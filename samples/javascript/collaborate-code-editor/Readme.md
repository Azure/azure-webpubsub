# Collaborate code editor

This sample is to help you create a collaborate code editor.

Powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/) and [Yjs](https://github.com/yjs/yjs).

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an [Azure Web PubSub](https://ms.portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.SignalRService%2FWebPubSub) resource on Azure Portal

## Getting started

### 1. Run npm install

```bash
npm install
```
   
### 2. Start host server

```bash
npm run server <ConnectionString>
```

### 3. Start react app

```bash
npm run app
```

Open http://localhost:3000/, enter your name, then edit codes.