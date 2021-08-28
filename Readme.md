# Azure Web PubSub
## Overview

Azure Web PubSub enables you to build real-time messaging web applications using WebSockets and the publish-subscribe pattern. Any platform supporting WebSocket APIs can connect to the service easily, e.g. web pages, mobile applications, edge devices, etc. The service manages the WebSocket connections for you and allows up to 100K **concurrent* connections. It provides powerful APIs for you to manage these clients and deliver real-time messages.

## Scenarios

Any scenario that requires real-time publish-subscribe messaging between server and clients or among clients, can use Azure Web PubSub service. Traditional real-time features that often require polling from server or submitting HTTP requests, can also use Azure Web PubSub service.

## Quickstart

Eager to get started? Check [Quickstart](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-create-instance) to get started!

## Step-by-step tutorials
- [Publish and subscribe messages](https://docs.microsoft.com/azure/azure-web-pubsub/tutorial-pub-sub-messages)
- [Create a chat app](https://docs.microsoft.com/azure/azure-web-pubsub/tutorial-build-chat)
- [Publish and subscribe messages between WebSocket clients using subprotocol](https://docs.microsoft.com/azure/azure-web-pubsub/tutorial-subprotocol)

## Integrate with Azure Function
- [Tutorial: Create a serverless notification app with Azure Functions](https://docs.microsoft.com/azure/azure-web-pubsub/tutorial-serverless-notification)
- [Tutorial: Create a serverless chat with Azure Functions](https://docs.microsoft.com/azure/azure-web-pubsub/quickstart-serverless)
- [Function bindings](https://docs.microsoft.com/azure/azure-web-pubsub/reference-functions-bindings)

## Troubleshooting Guidance
[Here](https://docs.microsoft.com/azure/azure-web-pubsub/howto-troubleshoot-diagnostic-logs) contains the details.

## References
- Client-side
    - [Client WebSocket APIs](https://docs.microsoft.com/azure/azure-web-pubsub/concept-client-protocols)
    - [Client PubSub Subprotocol](https://docs.microsoft.com/azure/azure-web-pubsub/concept-client-protocols)
- Serve-side
    - [Server SDKs](https://docs.microsoft.com/azure/azure-web-pubsub/reference-server-sdk-csharp)
    - [Server CloudEvents protocol](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events)
    - [Server REST API][rest]
- [Service Internals](https://docs.microsoft.com/azure/azure-web-pubsub/concept-service-internals)

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
