---
id: Whiteboard
title: Whiteboard
description: A real-time collaboration live demo using Azure Web PubSub service
slug: /whiteboard
hide_table_of_contents: true
live_demo_link: https://awps-demo-whiteboard.azurewebsites.net/
preview_image_name: Whiteboard
---

# Whiteboard: Real Time Collaboration using Azure Web PubSub

This is a sample project to demonstrate how to build a web application for real time collaboration using Azure, Node.js and other related technologies. This sample application includes the following features:

* A whiteboard that anyone can paint on it and others can see you painting in real time
* Painting features:
  1. Basic paint tools (freehand, line, rectangle, circle, ellipse), color and stroke thickness
  2. Upload a background image
  3. Pan and zoom canvas
  4. Undo and redo
  5. Touch support for mobile devices
* Real time chat

This application is based on the following technologies:

* For frontend: HTML5/javascript, bootstrap and vue.js
* For backend: node.js + express.js
* For realtime communication: Azure Web PubSub

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

3. Use localtunnel to expose localhost

   [localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

   ```bash
   lt --port 8080 --print-requests
   ```

   localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

   > Tip:
   > There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)  

   There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

   ```bash
   curl https://<domain-name>.loca.lt/eventhandler/validate -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
   ```

   Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.

   Now you can see a public endpoint created by localtunnel (something like https://abc.loca.lt). Go to your Azure Web PubSub resource in Azure portal, open settings tab, create a new hub called `sample_draw`, set the following:
   
   * URL Template: `https://<your-domain-name>.loca.lt/eventhandler/{event}`
   * User Event Pattern: `message`
   * System Events: `connect`, `connected`, `disconnected`

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
