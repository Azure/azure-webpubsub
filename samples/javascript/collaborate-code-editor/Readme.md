# Collaborate code editor

This sample is to help you create a collaborate code editor.

Powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/) and [Yjs](https://github.com/yjs/yjs).

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an [Azure Web PubSub](https://ms.portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.SignalRService%2FWebPubSub) resource on Azure Portal

## Getting started
   
### 1. Start host server

```bash
npm install
ts-node server.ts <ConnectionString>
```

### 2. Start react app

```bash
cd app
npm install
npm start
```

Open http://localhost:3000/, enter your name, then edit codes.