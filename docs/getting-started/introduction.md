---
layout: docs
group: getting-started
redirect_from:
  - "/getting-started/"
toc: true
---

# Azure Web PubSub
## Overview

Azure Web PubSub enables you to build real-time messaging web applications using WebSockets and the publish-subscribe pattern. Any platform supporting WebSocket APIs can connect to the service easily, e.g. web pages, mobile applications, edge devices, etc. The service manages the WebSocket connections for you and allows up to 100K **concurrent* connections. It provides powerful APIs for you to manage these clients and deliver real-time messages.

## Scenarios

Any scenario that requires real-time publish-subscribe messaging between server and clients or among clients, can use Azure Web PubSub service. Traditional real-time features that often require polling from server or submitting HTTP requests, can also use Azure Web PubSub service.

We list some examples that are good to use Azure Web PubSub service:

* **High frequency data updates:** gaming, voting, polling, auction.
* **Live dashboards and monitoring:** company dashboard, financial market data, instant sales update, multi-player game leader board, and IoT monitoring.
* **Cross-platform live chat:** live chat room, chat bot, on-line customer support, real-time shopping assistant, messenger, in-game chat, and so on.
* **Real-time location on map:** logistic tracking, delivery status tracking, transportation status updates, GPS apps.
* **Real-time targeted ads:** personalized real-time push ads and offers, interactive ads.
* **Collaborative apps:** coauthoring, whiteboard apps and team meeting software.
* **Push instant notifications:** social network, email, game, travel alert.
* **Real-time broadcasting:** live audio/video broadcasting, live captioning, translating, events/news broadcasting.
* **IoT and connected devices:** real-time IoT metrics, remote control, real-time status, and location tracking.
* **Automation:** real-time trigger from upstream events.

## Quickstart

Eager to get started? Check [Quickstart](./quickstart.md) to get started!

## Step-by-step tutorials
- Publish messages to WebSocket connections 
    - [JavaScript](./publish-messsages/js-publish-message.md)
    - [C#](./publish-messsages/csharp-publish-message.md)
- Create a chat app
    - [JavaScript](./create-a-chat-app/js-handle-events.md)
- Using PubSub WebSocket subprotocol
    - [JavaScript](./using-pubsub-subprotocol/js-work-with-subprotocols.md)

## Integrate with Azure Function
- [Work with Azure Function](./work-with-azure-function.md)
- [Function bindings](./../references/functions-bindings.md)

## References
- [Establish WebSocket connections to the service](./../references/websocket-clients.md)
- [WebSocket PubSub Subprotocol in detail](./../references/pubsub-websocket-subprotocol.md)
- [Web PubSub CloudEvents in detail](./../references/protocol-cloudevents.md)