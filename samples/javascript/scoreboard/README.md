---
id: Scoreboard
title: Real-time Scoreboard
description: A real-time scoreboard live demo utilizing Azure Web PubSub service
slug: /scoreboard
hide_table_of_contents: true
live_demo_link: https://awps-scoreboard-live-demo.azurewebsites.net/
---

# A Scoreboard

## Start the client

```
npm install
npm run dev
```

## Start the server

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

Linux:

```bash
cd src/server
npm install
export WebPubSubConnectionString="<connection_string>"
npm run dev
```

Windows:

```cmd
cd src\server
npm install
SET WebPubSubConnectionString=<connection_string>
npm run dev
```

## Use localtunnel to expose localhost

[localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

```bash
lt --port 5050 --print-requests
```

localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

> Tip:
> There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)

There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

```bash
curl https://<domain-name>.loca.lt/eventhandler -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
```

Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.

## Configure event handlers

Local development uses hub `dev_scoreboard`, so let's set the event handler through Azure CLI with below command (don't forget to replace `<your-unique-resource-name>` and `<domain-name>` with your own one):

```azurecli
az webpubsub hub create --hub-name dev_scoreboard --name "<your-unique-resource-name>" --resource-group "myResourceGroup" --event-handler url-template=http://<domain-name>.loca.lt/eventhandler/{event} user-event-pattern=* system-event=connect system-event=disconnected system-event=connected
```

## Deploy to Azure

You can deploy to Azure by use the `Deploy to Azure` button or Bicep file with Azure CLI.

### Deploy all with one click

todo: update ARM template link to make it work

![Deploy to Azure](https://aka.ms/deploytoazurebutton)

### Deploy Azure resources with Bicep

If you want to customize Azure resources to be created or demo code, you can deploy to Azure in the following steps:

1. Deploy resources to Azure

```bash
az deployment group create --resource-group <resource-group-name> --template-file ./deploy/deploy.bicep
```

1. Deploy demo package to your App Service

```bash
# build and pack the demo to dist.zip if you modify the code
npm run pack

# deploy demo with dist.zip
az webapp deploy --resource-group <resource-group>  --name <webapp-resource-name>  --src-path  ./dist.zip --type zip
```
