
package com.webpubsub.quickstart;

import com.azure.messaging.webpubsub.*;
import com.azure.messaging.webpubsub.models.*;

/**
* Publish messages using Azure Web PubSub service SDK
*
*/
public class App 
{
    public static void main( String[] args )
    {
        if (args.length != 3) {
            System.out.println("Expecting 3 arguments: <connection-string> <hub-name> <message>");
            return;
        }

        WebPubSubServiceClient service = new WebPubSubServiceClientBuilder()
            .connectionString(args[0])
            .hub(args[1])
            .buildClient();
        service.sendToAll(args[2], WebPubSubContentType.TEXT_PLAIN);
    }
}