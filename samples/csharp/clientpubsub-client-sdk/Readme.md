# Client pub-sub with `Azure.Messaging.WebPubSub.Client`

## Prerequisites

1. [NET 6 or above](https://docs.microsoft.com/dotnet)
2. Create an Azure Web PubSub resource

## Setup

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

1. Start Client subscriber
```bash
cd clientsub
dotnet run -- "<ConnectionString>" pubsubhub
```

2. Start Client publisher 
```bash
cd clientpub
dotnet run -- "ConnectionString>" pubsubhub
```

Start typing messages and you can see these messages are transferred to the client subscriber in real-time.
