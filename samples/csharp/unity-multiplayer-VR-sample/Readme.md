# Unity Multiplayer VR Sample

his sample show off how to use [Azure Realtime Transport for Unity](https://github.com/wanlwanl/multiplayer-community-contributions/tree/wanl/transport/Transports/com.community.netcode.transport.azure-realtime) in VR game.

> This project is based on Meta Oculus's [Unity-UltimateGloveBall](https://github.com/oculus-samples/Unity-UltimateGloveBall) sample, please try to setup and run it first.

## Additional Setup

### A. Setup Dev Negotiate Server

1. Copy connection string in `Keys` page of your Web PubSub service you just created.
2. Install [dotnet runtime](https://learn.microsoft.com/dotnet/core/install/) if you don't have one.
3. In `Proejct` view, right click `Packages/Azure Web PubSub Transport for Netcode for Gameobjects`, and click `Show in Explorer`.
4. Extact `Resources/NegotiateServersSource~.zip`  and go into the extracted folder `NegotiateServersSource~/AWPSNegotiateServer`, rename `appseetings.sample.json` to  `appsettings.json `, fill the connection string in `ConnectionString` section.
5. In terminal app, run `dotnet run` to start negotiation server.
6. Get listening URL in console log. For example: `Now listening on: https://localhost:7172`

### B. Setup Transport

1. Download latest `azure-webpubsub-transport.unitypackage`package from `[Releases](https://github.com/albertxavier100/azure-web-pubsub-transport/releases)`.
2. Import `azure-webpubsub-transport.unitypackage` to your Unity project.
3. Add `AzureWebPubSubTransport` component to your GameObject containing your NetworkManager.
4. Set the `Network Transport` field on the NetworkManager to the `AzureWebPubSubTransport`.
5. Enter a room name into the `Room Name` field of the `AzureWebPubSubTransport`.
6. Enter negotiate endpoint. For example, `https://localhost:7172/negotiate` if you use the builtin developing negotiate server.
7. Use the `StartServer`, `StartHost` and `StartClient` functions as usually to host a game and have clients connect to it.

> At this point, you should be able to exchanges data between unity server and client.

## Next Step

For video tutorial, check out [From 0 to Unity Multiplayer Hero: 9 Steps Using Azure Web PubSub](https://www.youtube.com/watch?v=-0LlnojcMCs).
For more details, see [azure-web-pubsub-transport](https://github.com/albertxavier100/azure-web-pubsub-transport)

