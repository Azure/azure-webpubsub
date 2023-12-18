# Create a Chat app with storage

## Overview
This demo shows how to work with storage to create a chat sample having chat history and states.

## Prerequisites

1. [ASP.NET Core 6.0 or above](https://docs.microsoft.com/aspnet/core)
2. Create an [Azure Web PubSub](https://ms.portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.SignalRService%2FWebPubSub) resource on Azure Portal
3. [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to tunnel traffic from Web PubSub to your localhost

## Provision storage service for data

We support the dependency injection (DI) software design pattern for the storage of messages and sessions.

### Store the data in memory

Sometimes we don't need to store data in a real database (For example, in a dev/test environment.)
Register [InMemoryChatStorage](./ChatStorage/InMemory/InMemoryChatStorage.cs) when DI services.

```cs
services.AddSingleton<IChatHandler, InMemoryChatStorage>();
```

### Store the data in Azure Table

> If you don't have an Azure Storage Account, **[start now](https://azure.microsoft.com/services/storage/tables/)** to create one for your project.

Use [AzureTableChatStorage](./ChatStorage/AzureTable/AzureTablChatStorage.cs) with Azure Table connection string when DI services.

```cs
builder.Services.AddSingleton<IChatHandler, AzureTableChatStorage>();
```

## Start the server
Now set the connection string in the [Secret Manager](https://docs.microsoft.com/aspnet/core/security/app-secrets?#secret-manager) tool for .NET Core, and run this app.

> Get Azure Web PubSub connection string from **Keys** tab of the Azure Web PubSub service

```
dotnet restore
dotnet user-secrets set Azure:Storage:ConnectionString "<Your Azure Storage's connection string>"
dotnet user-secrets set Azure:WebPubSub:ConnectionString "<Your Azure Web PubSub's connection string>"
dotnet run --urls http://localhost:8080
```

The server is then started:
* The web page is http://localhost:8080/index.html
* The web app is listening to event handler requests at http://localhost:8080/eventhandler

## Use `awps-tunnel` to tunnel traffic from Web PubSub service to your localhost

```bash
npm install -g @azure/web-pubsub-tunnel-tool
export WebPubSubConnectionString="<connection_string>"
awps-tunnel run --hub Sample_ChatWithStorageHub --upstream http://localhost:8080
```

## Configure the event handler

Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

Go to the **Settings** tab to configure the event handler for this `Sample_ChatWithStorageHub` hub:

1. Click **Add** to add setting for hub `Sample_ChatWithStorageHub`.

2. Set:
    * Url template: `tunnel:///eventhandler`
    * System event: check `connected` and `disconnected` 
    * User event: select `All`.

## Start the chat

Open http://localhost:8080/index.html, input your user name, and send messages.

You could open the webview of the tunnel tool http://127.0.0.1:9080/ to see the requests coming in with every message sent from the page.

![Chat demo](./images/demo.gif)

	
### Use your own database

If you want to use your own database to store the messages and sessions, you should create a class which implements [IChatHandler](./ChatStorage/IChatHandler.cs).

Then, register your services in `Startup.ConfigureServices` like above and run the app

When you open http://localhost:8080, you can see the application using the configured storage services.

You could open the webview of the tunnel tool http://127.0.0.1:9080/ to see the requests coming in with every message sent from the page.