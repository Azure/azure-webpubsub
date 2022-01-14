# Publish and subscribe messages

## Prerequisites

1. [NET Core 2.1 or above](https://docs.microsoft.com/dotnet)
2. Create an Azure Web PubSub resource

## Setup

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

## Start subscriber

Start a terminal to run the subscriber:

```bash
dotnet restore subscriber/
dotnet run --project subscriber/subscriber.csproj "<connection-string>" "pubsub"
```

The subscriber is then connected.

## Start publisher

Start another terminal and replace the `<connection-string>` below with the value of your **Connection String**:

```bash
dotnet restore publisher/
dotnet run --project publisher/publisher.csproj "<connection-string>" "pubsub" "Hello world"
```

You can see that the client receives message `Hello world`.
