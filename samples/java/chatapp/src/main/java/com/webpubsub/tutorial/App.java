
package com.webpubsub.tutorial;
    
import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.WebPubSubServiceClientBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubClientAccessToken;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;

import io.javalin.Javalin;

public class App {
    public static void main(String[] args) {
        String connectionString = System.getenv("WebPubSubConnectionString");

        if (connectionString == null) {
            System.out.println("Please set the environment variable WebPubSubConnectionString");
            return;
        }

        // create the service client
        WebPubSubServiceClient service = new WebPubSubServiceClientBuilder()
                .connectionString(connectionString)
                .hub("Sample_ChatApp")
                .buildClient();

        // start a server
        Javalin app = Javalin.create(config -> {
            config.staticFiles.add("public");
        }).start(8080);
        
        // Handle the negotiate request and return the token to the client
        app.get("/negotiate", ctx -> {
            String id = ctx.queryParam("id");
            if (id == null) {
                ctx.status(400);
                ctx.result("missing user id");
                return;
            }
            GetClientAccessTokenOptions option = new GetClientAccessTokenOptions();
            option.setUserId(id);
            WebPubSubClientAccessToken token = service.getClientAccessToken(option);
            ctx.contentType("application/json");
            String response = String.format("{\"url\":\"%s\"}", token.getUrl());
            ctx.result(response);
            return;
        });

        
        // validation: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#validation
        app.options("/eventhandler", ctx -> {
            ctx.header("WebHook-Allowed-Origin", "*");
        });

        // handle events: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#events
        app.post("/eventhandler", ctx -> {
            String event = ctx.header("ce-type");
            if ("azure.webpubsub.sys.connected".equals(event)) {
                String id = ctx.header("ce-userId");
                System.out.println(id + " connected.");
            } else if ("azure.webpubsub.user.message".equals(event)) {
                String id = ctx.header("ce-userId");
                String message = ctx.body();
                service.sendToAll(String.format("{\"from\":\"%s\",\"message\":\"%s\"}", id, message), WebPubSubContentType.APPLICATION_JSON);
            }
            ctx.status(200);
        });
    }
}