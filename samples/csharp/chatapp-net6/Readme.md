# Create a Chat app

## Prerequisites

1. [ASP.NET Core 6.0 or above](https://docs.microsoft.com/aspnet/core)
2. Create an [Azure Web PubSub](https://ms.portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.SignalRService%2FWebPubSub) resource on Azure Portal
3. [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to tunnel traffic from Web PubSub to your localhost

## Start the server

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service. Run the below command with the `<connection-string>` replaced by the value of your **Connection String**. We are using [Secret Manager](https://docs.microsoft.com/aspnet/core/security/app-secrets#secret-manager) tool for .NET Core to set the connection string.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
dotnet restore
dotnet user-secrets set Azure:WebPubSub:ConnectionString "<connection-string>"
dotnet run --urls http://localhost:8080
```

The server is then started:
* The web page is http://localhost:8080/index.html
* The web app is listening to event handler requests at http://localhost:8080/eventhandler

## Use `awps-tunnel` to tunnel traffic from Web PubSub service to your localhost

```bash
npm install -g @azure/web-pubsub-tunnel-tool
export WebPubSubConnectionString="<connection_string>"
awps-tunnel run --hub Sample_ChatApp --upstream http://localhost:8080
```

## Configure the event handler

Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

Go to the **Settings** tab to configure the event handler for this `Sample_ChatApp` hub:

1. Click **Add** to add setting for hub `Sample_ChatApp`.

2. Set Url template to `tunnel:///eventhandler` and check `connected` system event, click "Save".

    ![Event Handler](../../images/portal_event_handler_Sample_ChatApp.png)

## Start the chat

Open http://localhost:8080/index.html, input your user name, and send messages.

You could open the webview of the tunnel tool http://127.0.0.1:9080/ to see the requests coming in with every message sent from the page.