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
2. Create an Azure Web PubSub resource
3. [Azure Function Core Tools(v3)](https://www.npmjs.com/package/azure-functions-core-tools)

## Setup publisher

1.  New a timer trigger. Select *dotnet* -> *Timer Trigger* -> *notifications* following prompt messages. 

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
    func extensions install --package Microsoft.Azure.WebJobs.Extensions.WebPubSub --version 1.0.0-alpha.20210425.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
    ```

4.  Update `notificaions.cs` to below
    
    ```csharp
    using Microsoft.Azure.WebJobs.Extensions.WebPubSub;

    public static class notification
    {
        [FunctionName("notification")]
        public static async Task Run([TimerTrigger("*/10 * * * * *")]TimerInfo myTimer, ILogger log,
            [WebPubSub(Hub = "notification")] IAsyncCollector<WebPubSubOperation> operations)
        {
           await operations.AddAsync(new SendToAll
            {
                Message = BinaryData.FromString($"DateTime: {DateTime.Now}], MSFT stock price: {GetStockPrice()}"),
                DataType = MessageDataType.Text
            });
        }

        private static double GetStockPrice()
        {
            var rng = new Random();
            return 260 + 1.0 / 100 * rng.Next(-500, 500);
        }
    }
    ```

5.  New a `Http Trigger` function to generate service access url for clients. Select and enter *Http Trigger* -> *login*.

    ```bash
    func new
    ```

6.  Update `login.cs` as below:
    
    ```cs
    using Microsoft.Azure.WebJobs.Extensions.WebPubSub;

    [FunctionName("login")]
    public static WebPubSubConnection Run(
        [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = null)] HttpRequest req,
        [WebPubSubConnection(Hub = "notification")] WebPubSubConnection connection,
        ILogger log)
    {
        log.LogInformation("Connecting...");
        return connection;
    }
    ```

7.  Update `local.settings.json` to insert service connection string get from **Azure Portal** -> **Keys**. And set **CORS** to allow all.
   
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

8.  Run the funcion.
   
    ```bash
    func start
    ```

## Setup subscriber

In Azure Web PubSub you can connect to the service and subscribe to messages through WebSocket connections. WebSocket is a full-duplex communication channel so service can push messages to your client in real time. You can use any API/library that supports WebSocket to do so. Here is an example in csharp:

1.  First install required dependencies:

    ```bash
    dotnet add package Newtonsoft.Json --version 13.0.1
    ```

2.  Then use WebSocket API to connect to service.

    ```csharp
    static async Task Main(string[] args)
    {
        var response = await _httpClient.GetAsync("http://localhost:7071/api/login");
        var result = await response.Content.ReadAsStringAsync();
        var connection = JObject.Parse(result);
        using var webSocket = new ClientWebSocket();
        await webSocket.ConnectAsync(new Uri(connection["url"].Value.ToString()), default);
        Console.WriteLine("[Progress] Connected.");
        var ms = new MemoryStream();
        Memory<byte> buffer = new byte[1024];
        // receive loop
        while (true)
        {
            var receiveResult = await webSocket.ReceiveAsync(buffer, default);
            // Need to check again for NetCoreApp2.2 because a close can happen between a 0-byte read and the actual read
            if (receiveResult.MessageType == WebSocketMessageType.Close)
            {
                try
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, default);
                }
                catch
                {
                    // It is possible that the remote is already closed
                }
                break;
            }
            await ms.WriteAsync(buffer.Slice(0, receiveResult.Count));
            if (receiveResult.EndOfMessage)
            {
                Console.WriteLine($"[Received]: {Encoding.UTF8.GetString(ms.ToArray())}");
                ms.SetLength(0);
            }
        }
    }
    ```

The code above first create a rest call to Azure Function `login` to retrieve client url. Then use the url to establish a websocket connection to service. After the connection is established, you'll able to receive server side messages.

# Further: Set up chat app for a bi-redirection communication

Try with [Sample](https://github.com/Azure/azure-webpubsub/tree/main/samples/functions/csharp/simplechat).

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/functions/js/notifications