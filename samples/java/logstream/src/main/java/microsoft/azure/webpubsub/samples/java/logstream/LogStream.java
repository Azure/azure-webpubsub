package microsoft.azure.webpubsub.samples.java.logstream;

import com.alibaba.fastjson.JSONObject;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.extensions.IExtension;
import org.java_websocket.handshake.ServerHandshake;
import org.java_websocket.protocols.IProtocol;
import org.java_websocket.protocols.Protocol;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.function.Function;

public class LogStream {
    private static String subProtocol = "json.webpubsub.azure.v1";
    public WebSocketClient webSocketClient;
    private String endpoint;
    private Helper helper;

    public LogStream(String endpoint) {
        this.endpoint = endpoint;
        this.helper = new Helper();
    }

    public void write(String message) {
        JSONObject object = new JSONObject();
        object.put("type", "sendToGroup");
        object.put("group", "stream");
        object.put("dataType", "text");
        object.put("data", message);
        webSocketClient.send(object.toJSONString());
    }

    public void connect(String role, Function<String, Object> onMessage) throws URISyntaxException, InterruptedException, IOException {
        // set up sub protocol
        ArrayList<IProtocol> protocols = new ArrayList<IProtocol>();
        protocols.add(new Protocol(subProtocol));
        Draft_6455 draft = new Draft_6455(Collections.<IExtension>emptyList(), protocols);


        String url = negotiateToService(endpoint, role);
        webSocketClient = new WebSocketClient(new URI(url), draft) {
            @Override
            public void onMessage(String message) {
                if (onMessage != null) {
                    System.out.println(String.format("%s: received message: %s", helper.getCurrentTime(), message));
                    JSONObject object = JSONObject.parseObject(message);
                    if ("message".equals(object.getString("type")) &&
                            "text".equals(object.getString("dataType"))) {
                        onMessage.apply(object.getString("data"));
                    }
                }
            }

            @Override
            public void onOpen(ServerHandshake handshake) {
                System.out.println(String.format("%s: Connected...", helper.getCurrentTime()));
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                System.out.println(String.format("%s: Websocket connection closed...", helper.getCurrentTime()));
            }

            @Override
            public void onError(Exception ex) {
                System.out.println(String.format("%s: Websocket connection get error:", helper.getCurrentTime()));
                ex.printStackTrace();
            }
        };

        System.out.println(String.format("%s: Open websocket connection...", helper.getCurrentTime()));
        webSocketClient.connectBlocking();

        JSONObject object = new JSONObject();
        object.put("type", "joinGroup");
        object.put("group", "stream");
        System.out.println("out:" + object.toJSONString());
        webSocketClient.send(object.toJSONString());
    }

    public void disconnect() {
        System.out.println(String.format("%s: Close websocket connection...", helper.getCurrentTime()));
        webSocketClient.close();
    }

    // suggest to use a negotiation server to get redirect url instead of using connection string to generate it in client side, which may leak the connection string
    private String negotiateToService(String endpoint, String role) throws IOException, InterruptedException {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder(
                URI.create(String.format("%s?role=%s", endpoint, role)))
                .header("accept", "application/json")
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        String content = response.body();
        JSONObject object = JSONObject.parseObject(content);
        String url = object.getString("url");
        return url;
    }
}
