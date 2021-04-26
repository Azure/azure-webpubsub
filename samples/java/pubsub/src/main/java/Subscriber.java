import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.models.GetAuthenticationTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubAuthenticationToken;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.net.URISyntaxException;

public class Subscriber {
    private WebPubSubServiceClient webPubSubServiceClient;
    private WebSocketClient webSocketClient;
    private String hubName;
    private Helper helper;
    public Subscriber(String connectionString, String hubName) {
        webPubSubServiceClient = new Helper().getWebPubSubClient(connectionString, hubName);
        this.hubName = hubName;
        this.helper = new Helper();
    }

    public void subscribe() throws URISyntaxException, InterruptedException {
        WebPubSubAuthenticationToken token = webPubSubServiceClient.getAuthenticationToken(new GetAuthenticationTokenOptions());

        webSocketClient = new WebSocketClient(new URI(token.getUrl())) {
            @Override
            public void onMessage(String message) {
                System.out.println(String.format("%s: Received message \"%s\" from hub [%s].", helper.getCurrentTime(), message, hubName));
            }

            @Override
            public void onOpen(ServerHandshake handshake) {
                System.out.println(String.format("%s: Subscribed...", helper.getCurrentTime()));
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                System.out.println(String.format("%s: Subscriber connection closed...", helper.getCurrentTime()));
            }

            @Override
            public void onError(Exception ex) {
                System.out.println(String.format("%s: Subscriber connection get error:", helper.getCurrentTime()));
                ex.printStackTrace();
            }

        };

        System.out.println(String.format("%s: Subscribing to hub [%s]...", helper.getCurrentTime(), this.hubName));
        webSocketClient.connectBlocking();
    }

    public void unsubscribe() {
        System.out.println(String.format("%s: Unsubscribing to hub [%s]...",helper.getCurrentTime(), this.hubName));
        webSocketClient.close();
    }
}
