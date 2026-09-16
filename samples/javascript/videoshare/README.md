# Video Share: Real time binary pubsub sample

This is a sample project to demonstrate how to use protobuf subprotocol to achieve a binary based client pubsub:

This application is based on the following technologies:

* For frontend: HTML5/javascript, bootstrap and vue.js
* For backend: node.js + express.js
* For realtime communication: Azure Web PubSub with protobuf subprotocol

## Build and run locally

Use Node.js 22 or later and a checkout of this repository, not just the sample directory.
The service types are generated from the canonical
[Web PubSub schema](../../../protocols/protobuf.webpubsub.azure.v1/webpubsub.v1.proto)
(`azure.webpubsub`). The sample's [payload schema](proto/pubsub.proto) contains only
`video.CameraControl` and `video.CameraControlAck`; their `Any` type URLs remain
`type.googleapis.com/video.CameraControl` and `type.googleapis.com/video.CameraControlAck`.

1. Install dependencies, test the codecs offline, and build:
   ```bash
   npm install --registry=https://packagefeedproxy.microsoft.io/npm/
   npm test
   npm run build
   ```

   `npm run generate` uses pinned `protobufjs-cli` and `protobufjs` versions to generate
   separate service and video CommonJS modules under `src/generated/`. No system
   `protoc`, JavaScript plugin, or binary download is required. Generated files are
   ignored by Git; do not edit or check them in. Tests, development builds and production
   builds always regenerate them. Run `npm run generate` separately after a schema change
   if you are not building yet.

   JavaScript 64-bit fields use `Long`. Use decimal strings with generated `fromObject`
   methods and `.toString()` when inspecting IDs; do not convert large IDs to `Number`.
   The offline tests build the browser bundle and check its custom payload calls,
   canonical wire compatibility, join/ack IDs through the full uint64 range, metadata,
   video `Any` payloads, and current stream/group-state fields.

   CI must install development dependencies before `npm test` or `npm run build`.
   The existing sample test job runs generation through `npm test`; a packaged app also
   needs `npm run build` before packaging its browser assets.

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

Now open http://localhost:8080 in your browser to use the video share.

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

Now your video share is running in Azure at `https://<app-name>.azurewebsites.net`. Enjoy!
