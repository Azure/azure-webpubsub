---
layout: docs
title: WebSocket Clients
group: references
subgroup: server-sdks
toc: true
---

## Using Server SDKs

* [Source Code](https://github.com/Azure/azure-sdk-for-java/tree/master/sdk/webpubsub/azure-messaging-webpubsub)
* [Package](https://repo1.maven.org/maven2/com/azure/azure-messaging-webpubsub/1.0.0-beta.1/)

### Include the Package
```xml
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-messaging-webpubsub</artifactId>
    <version>1.0.0-beta.1</version>
</dependency>
```

### Sample Usage

```java
WebPubSubClientBuilder webPubSubClientBuilder = new WebPubSubClientBuilder()
    .connectionString(CONNECTION_STRING)
    .httpClient(HttpClient.createDefault())
    .hub("test");

WebPubSubServiceClient client = webPubSubClientBuilder
    .buildClient();
WebPubSubGroup groupClient = client.getGroup("test_group");

// Send plain text
client.sendToAllWithResponse(
        "Hello World - Broadcast test!",
        WebPubSubContentType.TEXT_PLAIN);

// Send JSON text
client.sendToAllWithResponse("{\"boolvalue\": true}");

// Group related
groupClient.checkUserExists("user1");
```