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
                .hub("sample_stream")
                .buildClient();

        // start a server
        // Since Javalin 7 all routes are registered upfront, inside Javalin.create
        Javalin.create(config -> {
            config.staticFiles.add("public");

            // Handle the negotiate request and return the token to the client
            config.routes.get("/negotiate", ctx -> {
                GetClientAccessTokenOptions option = new GetClientAccessTokenOptions();
                option.addRole("webpubsub.sendToGroup.stream");
                option.addRole("webpubsub.joinLeaveGroup.stream");
                WebPubSubClientAccessToken token = service.getClientAccessToken(option);

                // return JSON string
                ctx.result("{\"url\":\"" + token.getUrl() + "\"}");
                return;
            });
        }).start(8080);
    }
}