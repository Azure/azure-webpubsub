# Streaming logs with client SDK

## Prerequisites

1. [ASP.NET Core 6 or above](https://docs.microsoft.com/aspnet/core)
2. [Node.js](https://nodejs.org/) with [npm](https://www.npmjs.com/)
3. Create an Azure Web PubSub resource

## Overview

This sample demonstrates how the JavaScript client SDK, .Net client SDK and .Net server SDK work together. In the sample, the server with server SDK exposes an endpoint for clients to get `Client Access Uri`. The .Net client sends messages to groups and JavaScript client listen to group messages and print in web page.

## Start the server

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service. Run the below command with the `<connection-string>` replaced by the value of your **Connection String**. We are using [Secret Manager](https://docs.microsoft.com/aspnet/core/security/app-secrets#secret-manager) tool for .NET Core to set the connection string.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
cd logstream
npm install
npm run release
dotnet user-secrets set Azure:WebPubSub:ConnectionString "<connection-string>"
dotnet run
```

The preceding command:

* Installed Node.js dependencies
* Bundled and copied the processed JavaScript and HTML files from `src` to the `wwwroot` directory.
* Started the server

The server is then started. Open `http://localhost:5000` in browser. If you use F12 to view the Network you can see the WebSocket connection is established.

## Start the log streamer

Run:

```bash
cd stream
dotnet run
```

Start typing messages and you can see these messages are transferred to the browser in real-time.
