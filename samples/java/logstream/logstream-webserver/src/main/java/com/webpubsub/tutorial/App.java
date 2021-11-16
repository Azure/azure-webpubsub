package com.webpubsub.tutorial;

import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.WebPubSubServiceClientBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubClientAccessToken;

import io.javalin.Javalin;

public class App {
    public static void main(String[] args) {
        
        if (args.length != 1) {
            System.out.println("Expecting 1 arguments: <connection-string>");
            return;
        }

        // create the service client
        WebPubSubServiceClient service = new WebPubSubServiceClientBuilder()
                .connectionString(args[0])
                .hub("chat")
                .buildClient();

        // start a server
        Javalin app = Javalin.create(config -> {
            config.addStaticFiles("public");
        }).start(8080);

        
        // Handle the negotiate request and return the token to the client
        app.get("/negotiate", ctx -> {
            GetClientAccessTokenOptions option = new GetClientAccessTokenOptions();
            option.addRole("webpubsub.sendToGroup.stream");
            option.addRole("webpubsub.joinLeaveGroup.stream");
            WebPubSubClientAccessToken token = service.getClientAccessToken(option);

            // return JSON string
            ctx.result("{\"url\":\"" + token.getUrl() + "\"}");
            return;
        });
    }
}