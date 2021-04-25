# Notifications

## Prerequisites
1. [Azure Function Core Tools(v3)](https://www.npmjs.com/package/azure-functions-core-tools)
2. [Azure Storage Emulator](https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409) or valid Azure Storage connection string.
3. [ngork](https://ngrok.com/download) to expose local function app
4. [http-server](https://www.npmjs.com/package/http-server) to host a simple static client page.

## Setup azure function

1. Copy **Connection String** from **Keys** blade of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String** in `local.settings.json`.

![Connection String](./../../../../docs/images/portal_conn.png)

2. Add preview version of package sources

```bash
dotnet nuget add source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json -n awps-dev
```

3. Install function extensions

```bash
func extensions install
```

4. Start app

```bash
func start
```

5. Run `ngrok` to expose local function to public network

```bash
ngrok http 7071
```

6. Update event handler settings in **Azure Portal** to enable service route events to current function app.

Property|Value
--|--
`HubName`| simplechat
`URL Template`| https://<domain-name>.ngrok.io/runtime/webhooks/webpubsub
`User Event Pattern`| *
`System Events`| connect, connected, disconnected

![Event Handler](./../../../../docs/images/portal_event_handler.png)

## Start client

Navigate to [Simple Chat](./../../client/) and run command below to start the client. Then you can open the local hosted client to start chat.

```bash
http-server
```