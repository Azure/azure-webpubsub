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

6.  New a `Http Trigger` function to generate service access url for clients. Select and enter *Http Trigger* -> *login*.

    ```bash
    func new
    ```

7.  Update `function.json` to add Web PubSub input binding.

    ```json
    {
        "disabled": false,
        "bindings": [
            {
            "authLevel": "anonymous",
            "type": "httpTrigger",
            "direction": "in",
            "name": "req"
            },
            {
            "type": "http",
            "direction": "out",
            "name": "res"
            },
            {
            "type": "webPubSubConnection",
            "name": "connection",
            "hub": "notification",
            "direction": "in"
            }
        ]
    }
    ```

8.  Update `index.js` as below:

    ```js
    module.exports = function (context, req, connection) {
        context.res = { body: connection };
        context.done();
    };
    ```

9.  Update `local.settings.json` to insert service connection string get from **Azure Portal** -> **Keys**. And set **CORS** to allow all.
   
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

10. Run the funcion.
   
    ```bash
    func start
    ```

## Setup subscriber

In Azure Web PubSub you can connect to the service and subscribe to messages through WebSocket connections. WebSocket is a full-duplex communication channel so service can push messages to your client in real time. You can use any API/library that supports WebSocket to do so. Here is an example in node.js:

1.  First install required dependencies:

    ```bash
    npm init -y
    npm install --save ws
    npm install --save axios
    ```

2.  Then use WebSocket API to connect to service

    ```javascript
    const WebSocket = require('ws');
    const axios = require('axios');

    async function main() {
    let funcUrl = 'http://localhost:7071';
    if (process.argv.length == 2) {
        console.log(`Use local function endpoint: ${funcUrl}`);
    }
    else if (process.argv.length == 3)
    {
        funcUrl = process.argv[2];
    }

    axios.get(`${funcUrl}/api/login`)
        .then(resp => resp.data)
        .then(info => {
        return info.url;
        }).then(url => {
        let ws = new WebSocket(url);
        ws.on('open', () => console.log('connected'));
        ws.on('message', data => console.log(data));
        });
    }

    main();
    ```

The code above first create a rest call to Azure Function `login` to retrieve client url. Then use the url to establish a websocket connection to service. After the connection is established, you'll able to receive server side messages.

> Make sure your connection string is enclosed by quotes ("") in Linux as connection string contains semicolon.

# Further: Set up chat app for a bi-redirection communication

Try with [Sample](https://github.com/Azure/azure-webpubsub/tree/main/samples/functions/js/simplechat).

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/functions/js/notifications