---
layout: default
title: Welcome to the Web PubSub Service
permalink: /pubsub
---

## Welcome to the Web PubSub Service

Welcome to the Web PubSub Service. It is a **_real-time_** pub/sub using simple WebSocket connections with high scalability and reliability. You can publish/subscribe messages using simple WebSocket connections. The service manages the WebSocket connections for you, and provide powerful APIs for you to manage these clients and deliver real-time messages.

### Introduction

The Web PubSub Service:
* Maintain the lifecycle of your client WebSocket connections
* Provide Upstream webhooks for you to handle the WebSocket messages
* Provide APIs for you to manipulate and send messages to these connected connections
* Support a simple WebSocket subprotocol for you to do client side pub/sub

With:
- High availability
- High scalability
- High reliability

It is _**Fast**_, _**Reliable**_, and _**Easy to use**_.

Check the [specs here](./../serverless-websocket/specs/runtime-websocket-serverless.md).

Demos:
* [4 steps creating a chat](./../serverless-websocket/samples/simple-chat/Readme.md) in either Azure Function way or Express way.
    * 🔥 [Live Demo](https://wssimpledemo.z13.web.core.windows.net/)
* [A fully-functional server-less chatroom with group, user and history](./../serverless-websocket/samples/advanced-chatroom/Readme.md) with Azure Function and Azure Storage.
    * 🔥 [Live Demo](https://serverless-ws-chat-demo.azurewebsites.net/?code=LJ0EgrwWYSkm5MXGAe2AvPKVRGTaYpqQ/pxzJaFpVvyCY4j53s055Q==) 
* [A real-time whiteboard](https://github.com/chenkennt/Whiteboard#websocket-version)
    * 🔥 [Live Demo](https://ws-whiteboard.azurewebsites.net/)


Found a mistake? Edit this page on [GitHub](https://github.com/Azure/azure-signalr-vnext-features/edit/master/docs/index.md).
