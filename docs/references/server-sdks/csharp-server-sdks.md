---
layout: docs
group: references
subgroup: server-sdks
toc: true
---

# Azure Web PubSub service client library for .NET

This library can be used to do the following actions. Details about the terms used here are described in [Key concepts](#key-concepts) section.

- Send messages to hubs and groups. 
- Send messages to particular users and connections.
- Organize users and connections into groups.
- Close connections
- Grant, revoke, and check permissions for an existing connection


[Source code](https://github.com/Azure/azure-sdk-for-net/blob/master/sdk/webpubsub/Azure.Messaging.WebPubSub/src) |
[Package](https://www.nuget.org/packages/Azure.Messaging.WebPubSub) |
[API reference documentation](https://docs.microsoft.com/en-us/dotnet/api/azure.messaging.webpubsub?view=azure-dotnet-preview) |
[Product documentation](https://aka.ms/awps/doc) |
[Samples][samples_ref]

## Getting started
### Install the package

Install the client library from [NuGet](https://www.nuget.org/):

```PowerShell
dotnet add package Azure.Messaging.WebPubSub --prerelease
```

### Prerequisites

- An [Azure subscription][azure_sub].
- An existing Azure Web PubSub service instance.

### Authenticate the client

In order to interact with the service, you'll need to create an instance of the WebPubSubServiceClient class. To make this possible, you'll need the connection string or a key, which you can access in the Azure portal.

### Create a `WebPubSubServiceClient`

```csharp
var serviceClient = new WebPubSubServiceClient(new Uri("<endpoint>"), "<hub>", new AzureKeyCredential("<access-key>"));
```

## Key concepts

### Connection

Connections, represented by a connection id, represent an individual websocket connection to the Web PubSub service. Connection id is always unique.

### Hub

Hub is a logical concept for a set of connections. Connections are always connected to a specific hub. Messages that are broadcast to the hub are dispatched to all connections to that hub. Hub can be used for different applications, different applications can share one Azure Web PubSub service by using different hub names.

### Group

Group allow broadcast messages to a subset of connections to the hub. You can add and remove users and connections as needed. A client can join multiple groups, and a group can contain multiple clients.

### User

Connections to Web PubSub can belong to one user. A user might have multiple connections, for example when a single user is connected across multiple devices or multiple browser tabs.

### Message

Using this library, you can send messages to the client connections. A message can either be string text, JSON or binary payload.

## Examples

### Broadcast a text message to all clients

```csharp
var serviceClient = new WebPubSubServiceClient(new Uri("<endpoint>"), "<hub>", new AzureKeyCredential("<access-key>"));
await serviceClient.SendToAllAsync("Hello world!");
```

### Broadcast a JSON message to all clients

```csharp
var serviceClient = new WebPubSubServiceClient(new Uri("<endpoint>"), "<hub>", new AzureKeyCredential("<access-key>"));
await serviceClient.SendToAllAsync(
    RequestContent.Create(
        new {
            Foo = "Hello World!",
            Bar = 42
        }));
```

### Broadcast a binary message to all clients

```csharp
var serviceClient = new WebPubSubServiceClient(new Uri("<endpoint>"), "<hub>", new AzureKeyCredential("<access-key>"));

await serviceClient.SendToAllAsync(
    RequestContent.Create(new byte[] {0x1, 0x2, 0x3}), 
    HttpHeader.Common.OctetStreamContentType.Value
);
```

## Troubleshooting

### Setting up console logging
You can also easily [enable console logging](https://github.com/Azure/azure-sdk-for-net/blob/master/sdk/core/Azure.Core/samples/Diagnostics.md#logging) if you want to dig deeper into the requests you're making against the service.


[azure_sub]: https://azure.microsoft.com/free/
[samples_ref]: https://github.com/Azure/azure-webpubsub/tree/main/samples/csharp
