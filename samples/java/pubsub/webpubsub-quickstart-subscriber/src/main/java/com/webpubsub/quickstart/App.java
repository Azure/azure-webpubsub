package com.webpubsub.quickstart;

import com.azure.messaging.webpubsub.*;
import com.azure.messaging.webpubsub.models.*;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;

/**
* Connect to Azure Web PubSub service using WebSocket protocol
*
*/
public class App 
{
    public static void main( String[] args ) throws IOException, URISyntaxException
    {
        if (args.length != 2) {
            System.out.println("Expecting 2 arguments: <connection-string> <hub-name>");
            return;
        }

        WebPubSubServiceClient client = new WebPubSubClientBuilder()
            .connectionString(args[0])
            .hub(args[1])
            .buildClient();

        WebPubSubAuthenticationToken token = client.getAuthenticationToken(new GetAuthenticationTokenOptions());

        WebSocketClient webSocketClient = new WebSocketClient(new URI(token.getUrl())) {
            @Override
            public void onMessage(String message) {
                System.out.println(String.format("Message received: %s", message));
            }

            @Override
            public void onClose(int arg0, String arg1, boolean arg2) {
                // TODO Auto-generated method stub
            }

            @Override
            public void onError(Exception arg0) {
                // TODO Auto-generated method stub
            }

            @Override
            public void onOpen(ServerHandshake arg0) {
                // TODO Auto-generated method stub
            }

        };

        webSocketClient.connect();
        System.in.read();
    }
}