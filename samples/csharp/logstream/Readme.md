# Streaming logs using `json.webpubsub.azure.v1` subprotocol

## Prerequisites

1. [ASP.NET Core 3.1 or above](https://docs.microsoft.com/aspnet/core)
2. Create an Azure Web PubSub resource

## Start the server

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service. Run the below command with the `<connection-string>` replaced by the value of your **Connection String**. We are using [Secret Manager](https://docs.microsoft.com/aspnet/core/security/app-secrets#secret-manager) tool for .NET Core to set the connection string.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
cd logstream
dotnet restore
dotnet user-secrets set Azure:WebPubSub:ConnectionString "<connection-string>"
dotnet run
```

The server is then started. Open `http://localhost:5000/index.html` in browser. If you use F12 to view the Network you can see the WebSocket connection is established.

## Start the log streamer
Run:

```bash
cd stream
dotnet run
```

Start typing messages and you can see these messages are transferred to the browser in real-time.
