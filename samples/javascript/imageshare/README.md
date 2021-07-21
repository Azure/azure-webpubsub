# Video Share: Real time binary pubsub sample

This is a sample project to demonstrate how to use protobuf subprotocol to achieve a binary based client pubsub:

This application is based on the following technologies:

* For frontend: HTML5/javascript, bootstrap and vue.js
* For backend: node.js + express.js
* For realtime communication: Azure Web PubSub with protobuf subprotocol

## Build and run locally

1. Generate protobuf client
   ```bash
   protoc --js_out=import_style=commonjs,binary:src proto/pubsub.proto
   ```

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
