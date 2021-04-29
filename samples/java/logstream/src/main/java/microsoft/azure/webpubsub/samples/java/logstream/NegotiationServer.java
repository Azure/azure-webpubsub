package microsoft.azure.webpubsub.samples.java.logstream;

import com.azure.messaging.webpubsub.WebPubSubClientBuilder;
import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.models.GetAuthenticationTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubAuthenticationToken;
import io.javalin.Javalin;

public class NegotiationServer {
    private String hubName;
    private String connectionString;

    public NegotiationServer(String hubName, String connectionString) {
        this.hubName = hubName;
        this.connectionString = connectionString;
    }

    public void start() {
        WebPubSubServiceClient client = new WebPubSubClientBuilder()
                .connectionString(connectionString)
                .hub(hubName)
                .buildClient();

        // setup a server
        Javalin app = Javalin.create().start(8080);

        // negotiation: redirect client to Web PubSub service
        app.get("/negotiate", ctx -> {
            String role = ctx.queryParam("role");
            GetAuthenticationTokenOptions option = new GetAuthenticationTokenOptions();
            option.addRole(role);
            WebPubSubAuthenticationToken token = client.getAuthenticationToken(option);
            ctx.result("{ \"url\": \"" + token.getUrl() + "\"}");
            return;
        });
    }
}
