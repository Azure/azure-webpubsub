package com.function;

import com.azure.messaging.webpubsub.WebPubSubServiceClient;
import com.azure.messaging.webpubsub.WebPubSubServiceClientBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubClientAccessToken;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;
import com.microsoft.azure.functions.ExecutionContext;
import com.microsoft.azure.functions.HttpMethod;
import com.microsoft.azure.functions.HttpRequestMessage;
import com.microsoft.azure.functions.HttpResponseMessage;
import com.microsoft.azure.functions.HttpStatus;
import com.microsoft.azure.functions.annotation.AuthorizationLevel;
import com.microsoft.azure.functions.annotation.FunctionName;
import com.microsoft.azure.functions.annotation.HttpTrigger;
import com.nimbusds.jose.shaded.gson.Gson;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Scanner;

/**
 * Azure Functions with HTTP Trigger.
 */
public class Function {
    /**
     * This function listens at endpoint "/api/index" and returns the html page
     */
    @FunctionName("index")
    public HttpResponseMessage run(
            @HttpTrigger(name = "req", methods = {
                    HttpMethod.GET }, authLevel = AuthorizationLevel.ANONYMOUS) HttpRequestMessage<Optional<String>> request,
            final ExecutionContext context) {
        context.getLogger().info("Java HTTP trigger processed a request.");

        InputStream inputStream = getClass().getResourceAsStream("/index.html");
        if (inputStream != null) {
            try (Scanner scanner = new Scanner(inputStream, "UTF-8")) {
                String content = scanner.useDelimiter("\\A").next();

                // Create an HTTP response with the file content
                return request.createResponseBuilder(HttpStatus.OK)
                        .header("Content-Type", "text/html")
                        .body(content)
                        .build();
            } catch (Exception e) {
                return request.createResponseBuilder(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Error reading index.html: " + e.getMessage())
                        .build();
            }
        } else {
            return request.createResponseBuilder(HttpStatus.NOT_FOUND)
                    .body("index.html not found")
                    .build();
        }
    }

    /**
     * This function listens at endpoint "/api/negotiate" and returns the token the
     * client needs to connect to the Web service
     */
    @FunctionName("negotiate")
    public HttpResponseMessage negotiate(
            @HttpTrigger(name = "req", methods = {
                    HttpMethod.POST }, authLevel = AuthorizationLevel.ANONYMOUS) HttpRequestMessage<Optional<String>> request,
            final ExecutionContext context) {
        context.getLogger().info("Java HTTP trigger processed a request.");
        // Read userId from AAD auth header

        // Read headers from the request
        String userId = request.getHeaders().get("X-MS-CLIENT-PRINCIPAL-NAME");
        WebPubSubServiceClient webPubSubServiceClient = new WebPubSubServiceClientBuilder()
                .connectionString(System.getenv("WebPubSubConnectionString"))
                .hub("simplechat")
                .buildClient();
        GetClientAccessTokenOptions options = new GetClientAccessTokenOptions().setUserId(userId);
        WebPubSubClientAccessToken token = webPubSubServiceClient.getClientAccessToken(options);

        // Create a map for the JSON response
        Map<String, String> jsonResponse = new HashMap<>();
        jsonResponse.put("url", token.getUrl());

        // Convert the map to JSON
        String jsonResponseStr = new Gson().toJson(jsonResponse);

        return request.createResponseBuilder(HttpStatus.OK)
                .header("Content-Type", "application/json")
                .body(jsonResponseStr)
                .build();
    }

    /**
     * This function listens at endpoint "/api/message" and returns the token the
     * client needs to connect to the Web service
     */
    @FunctionName("message")
    public HttpResponseMessage messages(
            @HttpTrigger(name = "req", methods = { HttpMethod.OPTIONS,
                    HttpMethod.POST }, authLevel = AuthorizationLevel.ANONYMOUS) HttpRequestMessage<Optional<String>> request,
            final ExecutionContext context) {
        context.getLogger().info("Java HTTP trigger message processed a request.");
        // Read userId from AAD auth header
        // validation:
        // https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#validation
        if (request.getHttpMethod() == HttpMethod.OPTIONS) {
            // The abuse protection request
            return request.createResponseBuilder(HttpStatus.OK).header("WebHook-Allowed-Origin", "*").build();
        } else {
            String event = request.getHeaders().get("ce-type");
            context.getLogger().info("Received " + event);
            if ("azure.webpubsub.user.message".equals(event)) {
                String userId = request.getHeaders().get("ce-userid");
                String message = request.getBody().get();
                context.getLogger().info("Received message from " + userId + ": " + message);
                WebPubSubServiceClient webPubSubServiceClient = new WebPubSubServiceClientBuilder()
                        .connectionString(System.getenv("WebPubSubConnectionString"))
                        .hub("simplechat")
                        .buildClient();
                webPubSubServiceClient.sendToAll(message, WebPubSubContentType.TEXT_PLAIN);
            }
            return request.createResponseBuilder(HttpStatus.ACCEPTED).body("[SYSTEM] ack").build();
        }
    }
}
