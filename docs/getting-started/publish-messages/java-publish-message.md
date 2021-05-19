---
layout: docs
group: getting-started
subgroup: publish-messages
toc: true
---

# Quick start: publish and subscribe messages in Azure Web PubSub

In this tutorial you'll learn how to create a sample to publish messages and subscribe them using Azure Web PubSub with Java.

![pub sub](../../../docs/images/sample-java-pubsub-console.png)

## Prerequisites

1. [IntelliJ IDEA](https://www.jetbrains.com/idea/)
2. [Maven](https://maven.apache.org/)
3. Create an Azure Web PubSub resource

## Create the sample step by step

### Create a Maven project
1. Open _InteliJ IDEA_, click _File/New/Project..._ in the menu, select _Maven_, then type your _GroupId_ and _ArtifactId_, and setup other options to cerate a Maven project.
2. add dependencies to the `pom.xml`
```
    <dependencies>
        <dependency>
            <groupId>com.azure</groupId>
            <artifactId>azure-messaging-webpubsub</artifactId>
            <version>1.0.0-beta.1</version>
        </dependency>

        <dependency>
            <groupId>org.java-websocket</groupId>
            <artifactId>Java-WebSocket</artifactId>
            <version>1.5.1</version>
        </dependency>

        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-simple</artifactId>
            <version>1.7.30</version>
        </dependency>
    </dependencies>
```

>    * azure-messaging-webpubsub: Web PubSub service SDK for Java
>    * Java-WebSocket: WebSocket client SDK for Java
>    * slf4j-simple: Logger for Java


### Subscriber

In Azure Web PubSub you can connect to the service and subscribe to messages through WebSocket connections. WebSocket is a full-duplex communication channel so service can push messages to your client in real time. You can use any API/library that supports WebSocket to do so. For this sample, we use package [Java-WebSocket](https://github.com/TooTallNate/Java-WebSocket).


Create `Subscriber.java` which will be used as subscriber to the messages:

    ```java
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
    ```

The code above creates a WebSocket connection to connect to a hub in Azure Web PubSub. Hub is a logical unit in Azure Web PubSub where you can publish messages to a group of clients.

Azure Web PubSub by default doesn't allow anonymous connection, so in the code sample we use `WebPubSubServiceClient.getAuthenticationToken(new GetAuthenticationTokenOptions())` to get authentication token, then use `WebPubSubAuthenticationToken.getUrl()`  to get URL with a valid access token in Web PubSub SDK connect to Web PubSub service.

After connection is established, you will receive messages through the WebSocket connection. So we use `public void onMessage(String message)` to listen to incoming messages.

Once you run the application, you'll see a `Subscribed...` message printed out, indicating that you have successfully connected to the service.

Create a `Helper.java` to help to place shared functions

    ``` java
    import com.azure.messaging.webpubsub.WebPubSubClientBuilder;
    import com.azure.messaging.webpubsub.WebPubSubServiceClient;

    import java.time.LocalDateTime;
    import java.time.format.DateTimeFormatter;

    public class Helper {
        public static WebPubSubServiceClient getWebPubSubClient(String connectionString, String hubName) {
            return new WebPubSubClientBuilder()
                    .connectionString(connectionString)
                    .hub(hubName)
                    .buildClient();
        }
        public String getCurrentTime() {
            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");
            LocalDateTime now = LocalDateTime.now();
            return dtf.format(now);
        }
    }

    ```

### Publisher

Now let's create `Publisher.java` to use Azure Web PubSub SDK to publish a message to the service.

```java
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
```

The `sendToAll()` call simply sends a message to all connected clients in a hub.

### Complete the sample

Create `PubSub.java` to make the _subscriber_ connects to Web PubSub service and listen to the message sent to the hub _pubsub_, and _publisher_ send the anything you type in the console to hub _pubsub_ in the service.

```java
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URISyntaxException;

public class PubSub {
    public static String connectionString = "<connection-string>";
    public static String hubName = "pubsub";

    public static void main(String[] args) throws URISyntaxException, InterruptedException, IOException {
        Subscriber subscriber = new Subscriber(connectionString, hubName);
        Publisher publisher = new Publisher(connectionString, hubName);

        subscriber.subscribe();
        System.out.println(String.format("Input any message to publish to hub [%s] (Press 'Q' to leave): ", hubName));
        while (true) {
            BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
            String message = reader.readLine();
            if (message.equals("Q")) break;
            publisher.publish(message);
        }
        ;
        subscriber.unsubscribe();
    }
}
```

### Run sample

1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` (in `PubSub.java`) below with the value of your **Connection String**.
![connection string](../../../docs/images/portal_conn.png)
2. Run the project.
3. Input anything to publish the message.
4. You will see the message is published, e.g. `2021/04/26 12:43:03: Publish message "message" to hub [pubsub].`.
4. Later you will see the message get received, e.g. `2021/04/26 12:43:09: Received message "message" from hub [pubsub]`.
6. Press `Q` to leave.

![chat room](../../../docs/images/sample-java-pubsub-console.png)

Since the message is sent to all clients, you can use multiple subscribers at the same time and all of them will receive the same message.

The complete code sample of this tutorial can be found [here][code].

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/java/pubsub/Readme.md
