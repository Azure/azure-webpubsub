# Create a Chat app

## Prerequisites

1. [ASP.NET Core 3.1 or above](https://docs.microsoft.com/aspnet/core)
2. Create an [Azure Web PubSub](https://ms.portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.SignalRService%2FWebPubSub) resource on Azure Portal
3. [localtunnel](https://github.com/localtunnel/localtunnel) to expose our localhost to internet

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

## Use localtunnel to expose localhost

[localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

```bash
lt --port 8080 --print-requests
```

localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

> Tip:
> There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)  

There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

```bash
curl https://<domain-name>.loca.lt/eventhandler -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
```

Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.

## Configure the event handler

Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

Go to the **Settings** tab to configure the event handler for this `Sample_ChatApp` hub:

1. Click **Add** to add setting for hub `Sample_ChatApp`.

2. Set Url template to `https://<domain-name>.loca.lt/eventhandler` and check `connected` system event, click "Save".

    ![Event Handler](./../../../docs/images/portal_event_handler.png)

## Start the chat

Open http://localhost:8080/index.html, input your user name, and send messages.

You can see in the localtunnel command window that there are requests coming in with every message sent from the page.