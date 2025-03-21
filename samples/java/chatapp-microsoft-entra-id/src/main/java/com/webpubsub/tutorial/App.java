
package com.webpubsub.tutorial;

import com.azure.core.credential.AccessToken;
import com.azure.core.credential.TokenCredential;
import com.azure.core.credential.TokenRequestContext;
import com.azure.identity.AzureAuthorityHosts;
import com.azure.identity.AzurePowerShellCredentialBuilder;
import com.azure.identity.ClientAssertionCredentialBuilder;
import com.azure.identity.ClientCertificateCredentialBuilder;
import com.azure.identity.ClientSecretCredentialBuilder;
import com.azure.identity.ManagedIdentityCredential;
import com.azure.identity.ManagedIdentityCredentialBuilder;
import com.azure.identity.VisualStudioCodeCredentialBuilder;
import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.WebPubSubServiceClientBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubClientAccessToken;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;

import io.javalin.Javalin;

import java.util.function.Supplier;
import java.util.logging.Logger;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class App implements CommandLineRunner {

    private final AppConfig appConfig;

    public App(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    private enum AuthType {
        VISUAL_STUDIO_CODE,
        AZURE_POWER_SHELL,
        APPLICATION_WITH_CLIENT_SECRET,
        APPLICATION_WITH_CERTIFICATION,
        APPLICATION_WITH_FEDERATED_IDENTITY,
        SYSTEM_ASSIGNED_MANAGED_IDENTITY,
        USER_ASSIGNED_MANAGED_IDENTITY,
    }

    private TokenCredential buildTokenCredential(AuthType type) {
        switch (type) {
            case VISUAL_STUDIO_CODE:
                return new VisualStudioCodeCredentialBuilder().build();
            case AZURE_POWER_SHELL:
                return new AzurePowerShellCredentialBuilder().build();
            case APPLICATION_WITH_CLIENT_SECRET:
                return new ClientSecretCredentialBuilder()
                        .tenantId(appConfig.getTenantId())
                        .clientId(appConfig.getAppClientId())
                        .clientSecret(appConfig.getClientSecret())
                        .authorityHost(AzureAuthorityHosts.AZURE_PUBLIC_CLOUD)
                        .build();
            case APPLICATION_WITH_CERTIFICATION:
                return new ClientCertificateCredentialBuilder()
                        .tenantId(appConfig.getTenantId())
                        .clientId(appConfig.getAppClientId())
                        .pemCertificate(appConfig.getCertPath())
                        .authorityHost(AzureAuthorityHosts.AZURE_PUBLIC_CLOUD)
                        .build();
            case APPLICATION_WITH_FEDERATED_IDENTITY:
                ManagedIdentityCredential msiCredential = new ManagedIdentityCredentialBuilder()
                        .clientId(appConfig.getMsiClientId()).build();

                Supplier<String> tokenSupplier = () -> {
                    // Entra ID US Government: api://AzureADTokenExchangeUSGov
                    // Entra ID China operated by 21Vianet: api://AzureADTokenExchangeChina
                    String scope = "api://AzureADTokenExchange/.default";
                    TokenRequestContext context = new TokenRequestContext().addScopes(scope);
                    AccessToken token = msiCredential.getToken(context).block();
                    if (token == null) {
                        throw new IllegalStateException("Failed to acquire token");
                    }
                    return token.getToken();
                };

                return new ClientAssertionCredentialBuilder()
                        .tenantId(appConfig.getTenantId())
                        .clientId(appConfig.getAppClientId())
                        .clientAssertion(tokenSupplier)
                        .authorityHost(AzureAuthorityHosts.AZURE_PUBLIC_CLOUD)
                        .build();

            case SYSTEM_ASSIGNED_MANAGED_IDENTITY:
                return new ManagedIdentityCredentialBuilder().build();
            case USER_ASSIGNED_MANAGED_IDENTITY:
                return new ManagedIdentityCredentialBuilder().clientId(appConfig.getMsiClientId()).build();
            default:
                throw new IllegalArgumentException("Invalid AuthType");
        }
    }

    @Override
    public void run(String... args) {

        Logger logger = Logger.getLogger(App.class.getName());

        if (args.length == 1) {
            logger.warning("Expecting 1 arguments: <endpoint>");
            return;
        }

        TokenCredential credential = buildTokenCredential(AuthType.VISUAL_STUDIO_CODE);

        // create the service client
        WebPubSubServiceClient service = new WebPubSubServiceClientBuilder()
                .credential(credential)
                .hub("sample_aadchat")
                .buildClient();

        // start a server
        Javalin app = Javalin.create(config -> {
            config.addStaticFiles("public");
        }).start(8080);

        // Handle the negotiate request and return the token to the client
        app.get("/negotiate", ctx -> {
            String id = ctx.queryParam("id");
            if (id == null) {
                ctx.status(400);
                ctx.result("missing user id");
                return;
            }
            GetClientAccessTokenOptions option = new GetClientAccessTokenOptions();
            option.setUserId(id);
            WebPubSubClientAccessToken token = service.getClientAccessToken(option);

            ctx.result(token.getUrl());
            return;
        });

        // validation:
        // https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#validation
        app.options("/eventhandler", ctx -> {
            ctx.header("WebHook-Allowed-Origin", "*");
        });

        // handle events:
        // https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#events
        app.post("/eventhandler", ctx -> {
            String event = ctx.header("ce-type");
            if ("azure.webpubsub.sys.connected".equals(event)) {
                String id = ctx.header("ce-userId");
                service.sendToAll(String.format("[SYSTEM] %s joined", id), WebPubSubContentType.TEXT_PLAIN);
            } else if ("azure.webpubsub.user.message".equals(event)) {
                String id = ctx.header("ce-userId");
                String message = ctx.body();
                service.sendToAll(String.format("[%s] %s", id, message), WebPubSubContentType.TEXT_PLAIN);
            }
            ctx.status(200);
        });
    }

    public static void main(String[] args) {
        SpringApplication.run(App.class, args);
    }
}