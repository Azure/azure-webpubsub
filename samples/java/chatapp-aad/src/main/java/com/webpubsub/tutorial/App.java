
package com.webpubsub.tutorial;

import com.azure.core.credential.TokenCredential;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.WebPubSubServiceClientBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubClientAccessToken;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;

import io.javalin.Javalin;

public class App {
    public static void main(String[] args) {
        
        if (args.length != 1) {
            System.out.println("Expecting 1 arguments: <endpoint>");
            return;
        }

        TokenCredential credential = new DefaultAzureCredentialBuilder().build();

        // create the service client
        WebPubSubServiceClient service = new WebPubSubServiceClientBuilder()
                .credential(credential)
                .hub("chat")
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
        
        // validation: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#validation
        app.options("/eventhandler", ctx -> {
            ctx.header("WebHook-Allowed-Origin", "*");
        });
    
        // handle events: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#events
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
}