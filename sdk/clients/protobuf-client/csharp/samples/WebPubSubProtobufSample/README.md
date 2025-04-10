# WebPubSubProtobufSample

This sample demonstrates how to use the Azure Web PubSub protobuf protocol client for .NET to interact with the Azure Web PubSub service using protobuf subprotocols.

## Prerequisites

- An active Azure subscription. If you don't have one, you can create a free account at [https://azure.com/free](https://azure.com/free).
- An Azure Web PubSub resource. You can create one by following the instructions [here](https://aka.ms/awps/doc).
- .NET 8.0 SDK or later installed on your machine.

## Getting Started

1. Update the `appsettings.json` file with your Azure Web PubSub connection string. You can find the connection string in the Azure portal under your Web PubSub resource's **Keys** section.

2. Build the sample:
   ```bash
   dotnet build
   ```

3. Run the sample:
   ```bash
   dotnet run
   ```

## Key Features

- Demonstrates how to connect to Azure Web PubSub using protobuf subprotocols.
- Shows how to send and receive messages using the `protobuf.webpubsub.azure.v1` protocols.
