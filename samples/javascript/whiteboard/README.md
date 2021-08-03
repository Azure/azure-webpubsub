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

   ```
   export Web_PubSub_ConnectionString="<azure-web-pubsub-connection-string>"
   npm start
   ```

3. Install [ngrok](https://www.ngrok.com/) and run it:
   ```bash
   ngrok http 8080
   ```

   Now you can see a public endpoint created by ngrok (something like https://abc.ngrok.io). Go to your Azure Web PubSub resource in Azure portal, open settings tab, create a new hub called `draw`, set the following:
   
   * URL Template: `https://<your-ngrok-name>.ngrok/eventhandler/{event}`
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
