package server;

import com.azure.core.util.Context;
import com.azure.messaging.webpubsub.WebPubSubClientBuilder;
import com.azure.messaging.webpubsub.WebPubSubGroup;
import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;
import com.azure.messaging.webpubsub.models.WebPubSubPermission;

/**
 * A simple Web PubSub Server.
 *
 */
public final class Server {
    private Server() {
    }

    /**
     * Starts a simple WebSocket connection.
     * @param args The arguments of the program.
     */
    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.out.println("Use parameters: <connection-string> <hub>");
            return;
        }

        String connectionString = args[0];
        String hub = args[1];
        WebPubSubServiceClient serviceClient = new WebPubSubClientBuilder().connectionString(connectionString).hub(hub)
                .buildClient();
        serviceClient.sendToAll("text from server to all", WebPubSubContentType.TEXT_PLAIN);

        // There is no method for JAVA to accept an object
        serviceClient.sendToAll("\"json from server to all\"");

        serviceClient.sendToUser("user1", "text from server to user", WebPubSubContentType.TEXT_PLAIN);

        // There is no method for JAVA to accept an object
        serviceClient.sendToUser("user1", "\"json from server to user\"");

        System.out.println(serviceClient.checkGroupExists("group1"));
        System.out.println(serviceClient.checkConnectionExists("group1"));

        // Use LiveTrace to get a valid connection
        String connectionId = "2omloUz82pfz6tGIjXO0kw73a06db11";
        System.out.println(serviceClient.checkPermissionExistsWithResponse(WebPubSubPermission.JOIN_LEAVE_GROUP,
                connectionId, "group1", Context.NONE));
        System.out.println(serviceClient.checkPermissionExistsWithResponse(WebPubSubPermission.SEND_TO_GROUP,
                connectionId, "group1", Context.NONE));

        serviceClient.revokePermissionWithResponse(WebPubSubPermission.JOIN_LEAVE_GROUP, connectionId, "group1",
                Context.NONE);
        System.out.println(serviceClient.checkPermissionExistsWithResponse(WebPubSubPermission.JOIN_LEAVE_GROUP,
                connectionId, "group1", Context.NONE));

        WebPubSubGroup group = serviceClient.getGroup("group1");
        group.addUser("user1");
        group.sendToAll("text from server to group", WebPubSubContentType.TEXT_PLAIN);
        group.sendToAll("\"json from server to group\"");
    }
}
