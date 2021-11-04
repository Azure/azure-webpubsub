# Create a Chat app

## Prerequisites

1. [ASP.NET Core 3.1 or above](https://docs.microsoft.com/aspnet/core)
2. Create an Azure Web PubSub resource
3. [ngrok](https://ngrok.com/download) to expose our localhost to internet

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

## Use ngrok to expose localhost

```bash
ngrok http 8080
```

`nrgok` will print out an url (`https://<domain-name>.ngrok.io`) that can be accessed from internet, e.g. `http://xxx.ngrok.io`.

## Configure the event handler

Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

Go to the **Settings** tab to configure the event handler for this `chat` hub:

1. Type the hub name (chat) and click "Add".

2. Set URL Pattern to `https://<domain-name>.ngrok.io/eventhandler/{event}` and check `connected` in System Event Pattern, click "Save".

    ![Event Handler](./../../../docs/images/portal_event_handler.png)

## Start the chat

Open http://localhost:8080/index.html, input your user name, and send messages.

You can see in the ngrok command window that there are requests coming in with every message sent from the page.