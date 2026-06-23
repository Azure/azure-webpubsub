import com.azure.core.http.HttpClient;
import com.azure.core.http.HttpHeaderName;
import com.azure.core.http.policy.HttpLogDetailLevel;
import com.azure.core.http.policy.HttpLogOptions;
import com.azure.core.http.rest.RequestOptions;
import com.azure.core.http.rest.Response;
import com.azure.core.test.TestMode;
import com.azure.core.test.TestProxyTestBase;
import com.azure.core.test.annotation.DoNotRecord;
import com.azure.core.util.BinaryData;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;
import com.azure.messaging.webpubsub.models.WebPubSubPermission;
import com.nimbusds.jwt.JWT;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.JWTParser;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Duration;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Function;

public class ClientConnectTests {

    @Test
    public void simpleWebSocketClientCanConnectAndReceiveMessages() throws Exception {
        WebPubSubServiceClientOptions options = new WebPubSubServiceClientOptions();
        WebPubSubServiceClient serviceClient = new WebPubSubServiceClient(TestEnvironment.getConnectionString(), "simpleWebSocketClientCanConnectAndReceiveMessages", options);

        String url = serviceClient.getClientAccessUri().block();
        WebSocketClient client = new WebSocketClient(url, this::isSimpleClientEndSignal);

        client.waitForConnected().get(5, TimeUnit.SECONDS);

        String textContent = "Hello";
        serviceClient.sendToAll(textContent, WebPubSubContentType.TEXT_PLAIN).block();
        BinaryData jsonContent = BinaryData.fromObject(new JsonObject().put("hello", "world"));
        serviceClient.sendToAll(jsonContent, WebPubSubContentType.APPLICATION_JSON).block();
        BinaryData binaryContent = BinaryData.fromString("Hello");
        serviceClient.sendToAll(binaryContent, WebPubSubContentType.APPLICATION_OCTET_STREAM).block();

        serviceClient.sendToAll(BinaryData.fromBytes(getEndSignalBytes()), WebPubSubContentType.APPLICATION_OCTET_STREAM).block();

        client.lifetimeTask().get(5, TimeUnit.SECONDS);
        List<WebSocketFrame> frames = client.getReceivedFrames();

        Assertions.assertEquals(3, frames.size());
        Assertions.assertEquals(textContent, frames.get(0).getMessageAsString());
        Assertions.assertEquals(jsonContent.toString(), frames.get(1).getMessageAsString());
        Assertions.assertArrayEquals(binaryContent.toBytes(), frames.get(2).getMessageBytes());
    }

    @Test
    public void webSocketClientWithInitialGroupCanConnectAndReceiveGroupMessages() throws Exception {
        WebPubSubServiceClientOptions options = new WebPubSubServiceClientOptions();
        WebPubSubServiceClient serviceClient = new WebPubSubServiceClient(TestEnvironment.getConnectionString(), "webSocketClientWithInitialGroupCanConnectAndReceiveGroupMessages", options);

        String group = "GroupA";
        String url = serviceClient.getClientAccessUri(new GetClientAccessTokenOptions().setGroups(List.of(group))).block();
        WebSocketClient client = new WebSocketClient(url, this::isSimpleClientEndSignal);

        client.waitForConnected().get(5, TimeUnit.SECONDS);

        String textContent = "Hello";
        serviceClient.sendToGroup(group, textContent, WebPubSubContentType.TEXT_PLAIN).block();
        BinaryData jsonContent = BinaryData.fromObject(new JsonObject().put("hello", "world"));
        serviceClient.sendToGroup(group, jsonContent, WebPubSubContentType.APPLICATION_JSON).block();
        BinaryData binaryContent = BinaryData.fromString("Hello");
        serviceClient.sendToGroup(group, binaryContent, WebPubSubContentType.APPLICATION_OCTET_STREAM).block();

        serviceClient.sendToGroup(group, BinaryData.fromBytes(getEndSignalBytes()), WebPubSubContentType.APPLICATION_OCTET_STREAM).block();

        client.lifetimeTask().get(5, TimeUnit.SECONDS);
        List<WebSocketFrame> frames = client.getReceivedFrames();

        Assertions.assertEquals(3, frames.size());
        Assertions.assertEquals(textContent, frames.get(0).getMessageAsString());
        Assertions.assertEquals(jsonContent.toString(), frames.get(1).getMessageAsString());
        Assertions.assertArrayEquals(binaryContent.toBytes(), frames.get(2).getMessageBytes());
    }

    @Test
    public void subprotocolWebSocketClientCanConnectAndReceiveMessages() throws Exception {
        WebPubSubServiceClientOptions options = new WebPubSubServiceClientOptions();
        WebPubSubServiceClient serviceClient = new WebPubSubServiceClient(TestEnvironment.getConnectionString(), "subprotocolWebSocketClientCanConnectAndReceiveMessages", options);

        String url = serviceClient.getClientAccessUri().block();
        WebSocketClient client = new WebSocketClient(url, this::isSubprotocolClientEndSignal, ws -> ws.addSubprotocol("json.webpubsub.azure.v1"));

        client.waitForConnected().get(5, TimeUnit.SECONDS);

        String textContent = "Hello";
        serviceClient.sendToAll(textContent, WebPubSubContentType.TEXT_PLAIN).block();
        JsonObject jsonContent = new JsonObject().put("hello", "world");
        serviceClient.sendToAll(BinaryData.fromObject(jsonContent), WebPubSubContentType.APPLICATION_JSON).block();
        BinaryData binaryContent = BinaryData.fromString("Hello");
        serviceClient.sendToAll(binaryContent, WebPubSubContentType.APPLICATION_OCTET_STREAM).block();

        serviceClient.sendToAll(BinaryData.fromBytes(getEndSignalBytes()), WebPubSubContentType.APPLICATION_OCTET_STREAM).block();

        client.lifetimeTask().get(5, TimeUnit.SECONDS);
        List<WebSocketFrame> frames = client.getReceivedFrames();

        Assertions.assertEquals(4, frames.size());
        ConnectedMessage connected = BinaryData.fromString(frames.get(0).getMessageAsString()).toObject(ConnectedMessage.class);
        Assertions.assertNotNull(connected);
        Assertions.assertEquals("connected", connected.getEvent());
        Assertions.assertEquals(new JsonObject().put("type", "message").put("from", "server").put("dataType", "text").put("data", textContent).toString(), frames.get(1).getMessageAsString());
        Assertions.assertEquals(new JsonObject().put("type", "message").put("from", "server").put("dataType", "json").put("data", jsonContent).toString(), frames.get(2).getMessageAsString());
        Assertions.assertArrayEquals(new JsonObject().put("type", "message").put("from", "server").put("dataType", "binary").put("data", binaryContent.toBytes()).toString().getBytes(StandardCharsets.UTF_8), frames.get(3).getMessageBytes());
    }

    private static class ConnectedMessage {
        private String type;
        private String event;
        private String userId;
        private String connectionId;

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getEvent() { return event; }
        public void setEvent(String event) { this.event = event; }
        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public String getConnectionId() { return connectionId; }
        public void setConnectionId(String connectionId) { this.connectionId = connectionId; }
    }

    private boolean isSimpleClientEndSignal(WebSocketFrame frame) {
        byte[] bytes = frame.getMessageBytes();
        return bytes.length == 3 && bytes[0] == 5 && bytes[1] == 1 && bytes[2] == 1;
    }

    private boolean isSubprotocolClientEndSignal(WebSocketFrame frame) {
        return frame.getMessageAsString().equals(new JsonObject().put("type", "message").put("from", "server").put("dataType", "binary").put("data", "BQEB").toString());
    }

    private byte[] getEndSignalBytes() {
        return new byte[] { 5, 1, 1 };
    }

    private static class WebSocketFrame {
        private final String messageAsString;
        private final byte[] messageBytes;

        public WebSocketFrame(byte[] bytes, String type) {
            if (type.equals("text")) {
                this.messageBytes = bytes;
                this.messageAsString = new String(bytes, StandardCharsets.UTF_8);
            } else if (type.equals("binary")) {
                this.messageBytes = bytes;
                this.messageAsString = null;
            } else {
                throw new UnsupportedOperationException(type);
            }
        }

        public String getMessageAsString() { return messageAsString; }
        public byte[] getMessageBytes() { return messageBytes; }
    }

    private static class WebSocketClient implements AutoCloseable {
        private final WebSocket webSocket;
        private final String uri;
        private final Function<WebSocketFrame, Boolean> isEndSignal;
        private final List<WebSocketFrame> receivedFrames = new ArrayList<>();
        private final CompletableFuture<Void> lifetimeTask = new CompletableFuture<>();
        private final CompletableFuture<Void> waitForConnected = new CompletableFuture<>();

        public WebSocketClient(String uri, Function<WebSocketFrame, Boolean> isEndSignal) {
            this(uri, isEndSignal, null);
        }

        public WebSocketClient(String uri, Function<WebSocketFrame, Boolean> isEndSignal, Function<WebSocket, Void> configureOptions) {
            this.uri = uri;
            this.isEndSignal = isEndSignal;
            this.webSocket = new WebSocket(uri);
            if (configureOptions != null) configureOptions.apply(webSocket);
            connect();
            receiveLoop();
        }

        private void connect() {
            webSocket.connect().thenRun(() -> waitForConnected.complete(null));
        }

        private void receiveLoop() {
            webSocket.onMessage((data, isLast) -> {
                WebSocketFrame frame = new WebSocketFrame(data, webSocket.getSubprotocol());
                if (isEndSignal.apply(frame)) {
                    lifetimeTask.complete(null);
                } else {
                    receivedFrames.add(frame);
                }
            });
        }

        public CompletableFuture<Void> waitForConnected() { return waitForConnected; }
        public CompletableFuture<Void> lifetimeTask() { return lifetimeTask; }
        public List<WebSocketFrame> getReceivedFrames() { return receivedFrames; }

        @Override
        public void close() throws Exception {
            webSocket.close();
        }
    }
}
