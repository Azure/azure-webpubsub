package com.webpubsub.quickstart;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

import com.google.gson.Gson;

public class App 
{
    public static void main( String[] args ) throws IOException, InterruptedException
    {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:8080/negotiate"))
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        
        Gson gson = new Gson();

        String url = gson.fromJson(response.body(), Entity.class).url;

        WebSocket ws = HttpClient.newHttpClient().newWebSocketBuilder().subprotocols("json.webpubsub.azure.v1")
                .buildAsync(URI.create(url), new WebSocketClient()).join();
        int id = 0;
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String streaming = reader.readLine();
        App app = new App();
        while (streaming != null && !streaming.isEmpty()){
            String frame = gson.toJson(app.new GroupMessage(streaming + "\n", ++id));
            System.out.println("Sending: " + frame);
            ws.sendText(frame, true);
            streaming = reader.readLine();
        }
    }

    private class GroupMessage{
        public String data;
        public int ackId;
        public final String type = "sendToGroup";
        public final String group = "stream";
        
        GroupMessage(String data, int ackId){
            this.data = data;
            this.ackId = ackId;
        }
    }

    private static final class WebSocketClient implements WebSocket.Listener {
        private WebSocketClient() {
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            System.out.println("onOpen using subprotocol " + webSocket.getSubprotocol());
            WebSocket.Listener.super.onOpen(webSocket);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            System.out.println("onText received " + data);
            return WebSocket.Listener.super.onText(webSocket, data, last);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            System.out.println("Bad day! " + webSocket.toString());
            WebSocket.Listener.super.onError(webSocket, error);
        }
    }

    private static final class Entity {
        public String url;
    }
}
