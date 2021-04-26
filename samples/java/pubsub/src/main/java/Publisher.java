import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;

public class Publisher {
    private WebPubSubServiceClient client;
    private String hubName;
    public Publisher(String connectionString, String hubName) {
        client = new Helper().getWebPubSubClient(connectionString, hubName);
        this.hubName = hubName;
    }

    public void publish(String message) {
        Helper helper = new Helper();
        System.out.println(String.format("%s: Publish message \"%s\" to hub [%s].", helper.getCurrentTime(), message, this.hubName));
        client.sendToAll(message, WebPubSubContentType.TEXT_PLAIN);
    }
}
