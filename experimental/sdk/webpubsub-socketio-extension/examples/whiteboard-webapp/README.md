---
id: Whiteboard
title: Whiteboard
description: A real-time collaboration live demo using Web PubSub for Socket.IO
slug: /whiteboard
hide_table_of_contents: true
preview_image_name: Whiteboard
---

# Whiteboard: Real-Time Collaboration using Web PubSub for Socket.IO

This is a sample project to demonstrate how to build a web application for real-time collaboration using Azure, Socket.IO and other related technologies. This sample application includes the following features:

* A whiteboard that anyone can paint on and others can see you painting in real-time
* Painting features:
  1. Basic paint tools (freehand, line, rectangle, circle, ellipse), color and stroke thickness
  2. Upload a background image
  3. Pan and zoom canvas
  4. Undo and redo
  5. Touch support for mobile devices
* Real-time chat

This application is based on the following technologies:

* For frontend: HTML5/javascript, Socket.IO client, bootstrap and vue.js
* For backend: Socket.IO server + express.js
* For real-time communication: Web PubSub for Socket.IO

## Build and run locally

1. Build
   ```bash
   npm install
   npm run build
   ```

2. Run

   ```bash
   npm start "<azure-web-pubsub-connection-string>"
   ```

   You can also set connection string as an environment variable:

   Linux:

   ```bash
   export Web_PubSub_ConnectionString="<connection_string>"
   npm start
   ```

   Windows:

   ```cmd
   SET Web_PubSub_ConnectionString=<connection_string>
   npm start
   ```

Now open http://localhost:8080 in your browser to use the whiteboard.

## Deploy to Azure

To deploy the application to Azure Web App, first package it into a zip file:

```
npm install
npm run build
zip -r app.zip *
```

Then use the following command to deploy it to Azure Web App:

```
az webapp deployment source config-zip --src app.zip -n <app-name> -g <resource-group-name>
```

Set Azure Web PubSub connection string in the application settings. You can do it through portal or using Azure CLI:
```
az webapp config appsettings set --resource-group <resource-group-name> --name <app-name> \
   --setting Web_PubSub_ConnectionString="<connection-string>"
```

Also update corresponding URL template in settings tab in Azure portal.

Now your whiteboard is running in Azure at `https://<app-name>.azurewebsites.net`. Enjoy!
