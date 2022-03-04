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

## Use ngrok to expose your local endpoint

```
ngrok http 5050 
```

Then you'll get a forwarding endpoint `http://<your-ngrok-id>.ngrok.io` like `http://e27c-167-220-255-102.ngrok.io`

## Configure event handlers

Local development uses hub `dev_scoreboard`, so let's set the event handler through Azure CLI with below command (don't forget to replace `<your-unique-resource-name>` and `<your-ngrok-id>` with your own one):

```azurecli
az webpubsub hub create --hub-name dev_scoreboard --name "<your-unique-resource-name>" --resource-group "myResourceGroup" --event-handler url-template=http://<your-ngrok-id>.ngrok.io/eventhandler/{event} user-event-pattern=* system-event=connect system-event=disconnected system-event=connected
```
