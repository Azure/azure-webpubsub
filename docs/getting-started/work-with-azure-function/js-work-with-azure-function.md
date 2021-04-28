---
layout: docs
group: getting-started
subgroup: work-with-azure-function
toc: true
---

# Quick start: publish and subscribe messages in Azure Functions

In this tutorial you'll learn how to publish messages and subscribe them using Azure Web PubSub with Azure Functions.

The complete code sample of this tutorial can be found [here][code].

## Prerequisites

1. [Node.js](https://nodejs.org)
2. [Azure Function Core Tools(v3)](https://www.npmjs.com/package/azure-functions-core-tools)
3. Create an Azure Web PubSub resource

## Setup subscriber

In Azure Web PubSub you can connect to the service and subscribe to messages through WebSocket connections. WebSocket is a full-duplex communication channel so service can push messages to your client in real time. You can use any API/library that supports WebSocket to do so. Here is an example in node.js:

1.  First install required dependencies:

    ```bash
    npm init -y
    npm install --save ws
    npm install --save @azure/web-pubsub
    ```

2.  Then use WebSocket API to connect to service

    ```javascript
    const WebSocket = require('ws');
    const { WebPubSubServiceClient } = require('@azure/web-pubsub');

    async function main() {
      if (process.argv.length !== 3) {
        console.log('Usage: node subscribe <connection-string>');
        return 1;
      }

      let serviceClient = new WebPubSubServiceClient(process.argv[2], "notification");
      let token = await serviceClient.getAuthenticationToken();
      let ws = new WebSocket(token.url);
      ws.on('open', () => console.log('connected'));
      ws.on('message', data => console.log(data));;
    }

    main();
    ```

The code above creates a WebSocket connection to connect to a hub in Azure Web PubSub. Hub is a logical unit in Azure Web PubSub where you can publish messages to a group of clients.

Azure Web PubSub by default doesn't allow anonymous connection, so in the code sample we use `WebPubSubServiceClient.getAuthenticationToken()` in Web PubSub SDK to generate a url to the service that contains an access token and hub name.

After connection is established, you will receive messages through the WebSocket connection. So we use `WebSocket.on('message', ...)` to listen to incoming messages.

Now save the code above as `subscribe.js` and run it using `node subscribe "<connection-string>" <hub-name>` (`<connection-string>` can be found in "Keys" tab in Azure portal, `<hub-name>` can be any alphabetical string you like), you'll see a `connected` message printed out, indicating that you have successfully connected to the service.

> Make sure your connection string is enclosed by quotes ("") in Linux as connection string contains semicolon.

## Setup publisher

1.  New a timer trigger. Select *node* -> *javascript* -> *Timer Trigger* -> *notifications* following prompt messages. 

    ```bash
    func new
    ```

2.  Remove the **extensionBundle** settings in `host.json` to add explicit version of extensions in next step. So the file would be like below.
   
    ```json
    {
        "version": "2.0",
        "logging": {
            "applicationInsights": {
                "samplingSettings": {
                    "isEnabled": true,
                    "excludedTypes": "Request"
                }
            }
        }
    }
    ```

3.  Install Azure Web PubSub function extensions
   
    ```bash
    func extensions install --package Microsoft.Azure.WebJobs.Extensions.WebPubSub --preview
    ```

4.  Update `function.json` to add `WebPubSub` output binding and shorten the default timer interval.
    
    ```json
    {
        "bindings": [
            {
                "name": "myTimer",
                "type": "timerTrigger",
                "direction": "in",
                "schedule": "*/10 * * * * *"
            },
            {
                "type": "webPubSub",
                "name": "webPubSubOperation",
                "hub": "notification",
                "direction": "out"
            }
        ]
    }
    ```

5.  Update `index.js` to enable function broadcast messages to subscribers.
   
    ```js
    module.exports = async function (context, myTimer) {
        var message = 260 + (Math.random() - 0.5) * 20;
        context.bindings.webPubSubOperation = {
            "operationKind": "sendToAll",
            "message": `MSFT price: ${message}`,
            "dataType": "text"
        }
        context.done();
    };
    ```

6.  Update `local.settings.json` to insert service connection string get from **Azure Portal** -> **Keys**. And set **CORS** to allow all.
   
    ```json
    {
        "IsEncrypted": false,
        "Values": {
            "AzureWebJobsStorage": "UseDevelopmentStorage=true",
            "FUNCTIONS_WORKER_RUNTIME": "dotnet",
            "WebPubSubConnectionString": "<connection-string>"
        },
        "Host": {
            "LocalHttpPort": 7071,
            "CORS": "*"
        }
    }
    ```

7.  Run the funcion.
   
    ```bash
    func start
    ```

# Further: Set up chat app for a bi-redirection communication

Try with [Sample](https://github.com/Azure/azure-webpubsub/tree/main/samples/functions/js/simplechat).

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/functions/js/notifications