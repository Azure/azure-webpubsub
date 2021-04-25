import com.azure.messaging.webpubsub.WebPubSubClientBuilder;
import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.models.GetAuthenticationTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubAuthenticationToken;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;

public class Server {
    public static String hubName = "chat";
    public static String eventKey = "ce-type";
    public static String connectedEvent = "azure.webpubsub.sys.connected";
    public static String messageEvent = "azure.webpubsub.user.message";
    public static String eventHandler = "/eventhandler/";
    public static String connectionString = "<Your_ConnectionString>";

    public static void main(String[] args) {
        WebPubSubServiceClient client = new WebPubSubClientBuilder()
                .connectionString(connectionString)
                .hub(hubName)
                .buildClient();

        // setup a server
        Javalin app = Javalin.create(config -> {
            config.addStaticFiles("public/", Location.CLASSPATH);
        }).start(8080);

        // handle events: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#events
        app.post(eventHandler, ctx -> {
            String event = ctx.header(eventKey);
            if (connectedEvent.equals(event)) {
                String id = ctx.header("ce-userId");
                client.sendToAll(String.format("[SYSTEM] %s joined", id), WebPubSubContentType.TEXT_PLAIN);
            } else if (messageEvent.equals(event)) {
                String id = ctx.header("ce-userId");
                String message = ctx.body();
                client.sendToAll(String.format("[%s] %s", id, message), WebPubSubContentType.TEXT_PLAIN);
            }
            ctx.status(200);
        });

        // negotiation: redirect client to Web PubSub service
        app.get("/negotiate", ctx -> {
            String id = ctx.queryParam("id");
            if (id == null) {
                ctx.status(400);
                ctx.result("missing user id");
                return;
            }
            GetAuthenticationTokenOptions option = new GetAuthenticationTokenOptions();
            option.setUserId(id);
            WebPubSubAuthenticationToken token = client.getAuthenticationToken(option);
            ctx.result("{ \"url\": \"" + token.getUrl() + "\"}");
            return;
        });

        // validation: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#validation
        app.options(eventHandler, ctx -> {
            ctx.header("WebHook-Allowed-Origin", "*");
        });
    }
}
