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

Eager to get started? Check [Quickstart](./docs/getting-started/quickstart.md) to get started!

## Step-by-step tutorials
- Publish messages to WebSocket connections 
    - [JavaScript](./docs/getting-started/publish-messages/js-publish-message.md)
    - [C#](./docs/getting-started/publish-messages/csharp-publish-message.md)
    - [Python](./docs/getting-started/publish-messages/python-publish-message.md)
- Create a chat app
    - [JavaScript](./docs/getting-started/create-a-chat-app/js-handle-events.md)
    - [C#](./docs/getting-started/create-a-chat-app/csharp-handle-events.md)
- Using PubSub WebSocket subprotocol
    - [JavaScript](./docs/getting-started/using-pubsub-subprotocol/js-work-with-subprotocols.md)

## Integrate with Azure Function
- [Work with Azure Function](./docs/getting-started/work-with-azure-function.md)
- [Function bindings](./docs/references/functions-bindings.md)

## Troubleshooting Guidance
[Here](./docs/getting-started/troubleshoot.md) contains the details.

## References
- Client-side
    - [Client WebSocket APIs](./docs/references/client-websocket-apis/)
    - [Client PubSub Subprotocol](./docs/references/pubsub-websocket-subprotocol.md)
- Serve-side
    - [Server SDKs](./docs/references/server-sdks/index.md)
    - [Server CloudEvents protocol](./docs/references/protocol-cloudevents.md)
    - [Server REST API][rest]


## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

[rest]: https://docs.microsoft.com/rest/api/webpubsub/
