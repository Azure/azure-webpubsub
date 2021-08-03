---
layout: docs
group: getting-started
redirect_from:
  - "/getting-started/"
toc: true
---

# Azure Web PubSub
## Overview

Azure Web PubSub enables you to build real-time messaging web applications using WebSockets and the publish-subscribe pattern. Any platform supporting WebSocket APIs can connect to the service easily, e.g. web pages, mobile applications, edge devices, etc. The service manages the WebSocket connections for you and allows up to 100K *concurrent* connections. It provides powerful APIs for you to manage these clients and deliver real-time messages.

## Quickstart

Eager to get started? Check [Quickstart](./quickstart.md) to get started!

## Step-by-step tutorials
- Publish messages to WebSocket connections 
    - [JavaScript](./publish-messages/js-publish-message.md)
    - [C#](./publish-messages/csharp-publish-message.md)
    - [Python](./publish-messages/python-publish-message.md)
    - [Java](./publish-messages/java-publish-message.md)
- Create a chat app
    - [JavaScript](./create-a-chat-app/js-handle-events.md)
    - [C#](./create-a-chat-app/csharp-handle-events.md)
    - [Java](./create-a-chat-app/java-handle-events.md)
- Using PubSub WebSocket subprotocol
    - [JavaScript](./using-pubsub-subprotocol/js-work-with-subprotocols.md)
    - [Java](./using-pubsub-subprotocol/java-work-with-subprotocols.md)
    - [Python](./using-pubsub-subprotocol/python-work-with-subprotocols.md)

## Integrate with Azure Function
- Work with Azure Function
    - [JavaScript](./work-with-azure-function/js-work-with-azure-function.md)
    - [C#](./work-with-azure-function/csharp-work-with-azure-function.md)
- [Function bindings](./../references/functions-bindings.md)

## References
- Client-side
    - [Client WebSocket APIs](./../references/client-websocket-apis/)
    - [Client Json PubSub Subprotocol](./../references/pubsub-websocket-subprotocol.md)
    - [Client Protobuf PubSub Subprotocol](./../references/pubsub-websocket-protobuf-subprotocol.md)
- Server-side
    - [Server SDKs](./../references/server-sdks/index.md)
    - [Server CloudEvents protocol](./../references/protocol-cloudevents.md)
    - [Server REST API][rest]

## Troubleshooting Guidance
[Here](./troubleshoot.md) contains the details.


[rest]: https://docs.microsoft.com/rest/api/webpubsub/
