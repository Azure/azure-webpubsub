---
layout: docs
group: references
subgroup: server-sdks
toc: true
---

# Azure Web PubSub service client library for Java

Use the library to:

- Send messages to hubs and groups.
- Send messages to particular users and connections.
- Organize users and connections into groups.
- Close connections
- Grant/revoke/check permissions for an existing connection

[Source code][source_code] | [Product Documentation][product_documentation] | [Samples][samples_readme]

## Getting started

### Prerequisites

- A [Java Development Kit (JDK)][jdk_link], version 8 or later.
- [Azure Subscription][azure_subscription]

### Include the Package

[//]: # ({x-version-update-start;com.azure:azure-messaging-webpubsub;current})

```xml
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-messaging-webpubsub</artifactId>
    <version>1.0.0-beta.2</version>
</dependency>
```

[//]: # ({x-version-update-end})

### Create a Web PubSub client using connection string

<!-- embedme ./src/samples/java/com/azure/messaging/webpubsub/ReadmeSamples.java#L21-L24 -->
```java
WebPubSubServiceClient webPubSubServiceClient = new WebPubSubClientBuilder()
    .connectionString("{connection-string}")
    .hub("chat")
    .buildClient();
```

### Create a Web PubSub client using access key

<!-- embedme ./src/samples/java/com/azure/messaging/webpubsub/ReadmeSamples.java#L31-L35 -->
```java
WebPubSubServiceClient webPubSubServiceClient = new WebPubSubClientBuilder()
    .credential(new AzureKeyCredential("{access-key}"))
    .endpoint("<Insert endpoint from Azure Portal>")
    .hub("chat")
    .buildClient();
```

### Create a Web PubSub Group client
<!-- embedme ./src/samples/java/com/azure/messaging/webpubsub/ReadmeSamples.java#L42-L46 -->
```java
WebPubSubServiceClient webPubSubServiceClient = new WebPubSubClientBuilder()
    .credential(new AzureKeyCredential("{access-key}"))
    .hub("chat")
    .buildClient();
WebPubSubGroup javaGroup = webPubSubServiceClient.getGroup("java");
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

* [Broadcast message to entire hub](#broadcast-all "Broadcast message to entire hub")
* [Broadcast message to a group](#broadcast-group "Broadcast message to a group")
* [Send message to a connection](#send-to-connection "Send message to a connection")
* [Send message to a user](#send-to-user "Send message to a user")

### Broadcast message to entire hub

<!-- embedme ./src/samples/java/com/azure/messaging/webpubsub/ReadmeSamples.java#L58-L58 -->
```java
webPubSubServiceClient.sendToAll("Hello world!");
```

### Broadcast message to a group

<!-- embedme ./src/samples/java/com/azure/messaging/webpubsub/ReadmeSamples.java#L70-L71 -->
```java
WebPubSubGroup javaGroup = webPubSubServiceClient.getGroup("Java");
javaGroup.sendToAll("Hello Java!");
```

### Send message to a connection

<!-- embedme ./src/samples/java/com/azure/messaging/webpubsub/ReadmeSamples.java#L83-L83 -->
```java
webPubSubServiceClient.sendToConnection("myconnectionid", "Hello connection!");
```

### Send message to a user
<!-- embedme ./src/samples/java/com/azure/messaging/webpubsub/ReadmeSamples.java#L95-L95 -->
```java
webPubSubServiceClient.sendToUser("Andy", "Hello Andy!");
```

## Troubleshooting

### Enable client logging
You can set the `AZURE_LOG_LEVEL` environment variable to view logging statements made in the client library. For
example, setting `AZURE_LOG_LEVEL=2` would show all informational, warning, and error log messages. The log levels can
be found here: [log levels][log_levels].

### Default HTTP Client
All client libraries by default use the Netty HTTP client. Adding the above dependency will automatically configure
the client library to use the Netty HTTP client. Configuring or changing the HTTP client is detailed in the
[HTTP clients wiki](https://github.com/Azure/azure-sdk-for-java/wiki/HTTP-clients).

### Default SSL library
All client libraries, by default, use the Tomcat-native Boring SSL library to enable native-level performance for SSL
operations. The Boring SSL library is an uber jar containing native libraries for Linux / macOS / Windows, and provides
better performance compared to the default SSL implementation within the JDK. For more information, including how to
reduce the dependency size, refer to the [performance tuning][performance_tuning] section of the wiki.

## Next steps

- Samples are explained in detail [here][samples_readme].

<!-- LINKS -->

[azure_subscription]: https://azure.microsoft.com/free
[jdk_link]: https://docs.microsoft.com/java/azure/jdk/?view=azure-java-stable
[source_code]: https://github.com/Azure/azure-sdk-for-java/tree/master/sdk/webpubsub/azure-messaging-webpubsub/src
[product_documentation]: https://aka.ms/awps/doc
[samples_readme]: https://github.com/Azure/azure-webpubsub/tree/main/samples/java
[log_levels]: https://github.com/Azure/azure-sdk-for-java/blob/master/sdk/core/azure-core/src/main/java/com/azure/core/util/logging/ClientLogger.java
[performance_tuning]: https://github.com/Azure/azure-sdk-for-java/wiki/Performance-Tuning
