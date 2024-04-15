
package com.webpubsub.tutorial;

import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.WebPubSubServiceClientBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubClientAccessToken;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

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
            Gson gson = new Gson();
            JsonObject jsonObject = new JsonObject();
            jsonObject.addProperty("url", token.getUrl());
            String response = gson.toJson(jsonObject);
            ctx.result(response);
            return;
        });

        // validation:
        // https://learn.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#protection
        app.options("/eventhandler", ctx -> {
            ctx.header("WebHook-Allowed-Origin", "*");
        });

        // handle events:
        // https://learn.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#events
        app.post("/eventhandler", ctx -> {
            String event = ctx.header("ce-type");
            // handle connect event when lazy auth is enabled as described in 
            if ("azure.webpubsub.sys.connect".equals(event)) {
                String body = ctx.body();
                System.out.println("Reading from request body...");
                Gson gson = new Gson();
                JsonObject requestBody = gson.fromJson(body, JsonObject.class); // Parse JSON request body
                JsonObject query = requestBody.getAsJsonObject("query");
                if (query != null) {
                    System.out.println("Reading from request body query:" + query.toString());
                    JsonElement idElement = query.get("id");
                    if (idElement != null) {
                        JsonArray idInQuery = query.get("id").getAsJsonArray();
                        if (idInQuery != null && idInQuery.size() > 0) {
                            String id = idInQuery.get(0).getAsString();
                            ctx.contentType("application/json");
                            Gson response = new Gson();
                            JsonObject jsonObject = new JsonObject();
                            jsonObject.addProperty("userId", id);
                            ctx.result(response.toJson(jsonObject));
                            return;
                        }
                    }
                } else {
                    System.out.println("No query found from request body.");
                }
                ctx.status(401).result("missing user id");
            } else if ("azure.webpubsub.sys.connected".equals(event)) {
                String id = ctx.header("ce-userId");
                System.out.println(id + " connected.");
            } else if ("azure.webpubsub.user.message".equals(event)) {
                String id = ctx.header("ce-userId");
                String message = ctx.body();
                Gson gson = new Gson();
                JsonObject jsonObject = new JsonObject();
                jsonObject.addProperty("from", id);
                jsonObject.addProperty("message", message);
                String messageToSend = gson.toJson(jsonObject);
                service.sendToAll(messageToSend, WebPubSubContentType.APPLICATION_JSON);
            }
            ctx.status(200);
        });
    }
}
