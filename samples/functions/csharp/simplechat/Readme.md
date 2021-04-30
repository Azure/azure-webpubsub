# Notifications

## Prerequisites
1. [Azure Function Core Tools(v3)](https://www.npmjs.com/package/azure-functions-core-tools)
2. [Azure Storage Emulator](https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409) or valid Azure Storage connection string.
3. [ngork](https://ngrok.com/download) to expose local function app.

## Setup and Run

1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String** in `local.settings.json`.

![Connection String](./../../../../docs/images/portal_conn.png)

2. Install function extensions

```bash
func extensions install
```

3. Start app

```bash
func start
```

4. Run `ngrok` to expose local function to public network, e.g. https://*{random-id}*.ngrok.io -> http://localhost:7071

```bash
ngrok http 7071
```

5. Update event handler settings in **Azure Portal** -> **Settings** to enable service route events to current function app.

Property|Value
--|--
`HubName`| simplechat
`URL Template`| https://*{random-id}*.ngrok.io/runtime/webhooks/webpubsub
`User Event Pattern`| *
`System Events`| connect, connected, disconnected

![Event Handler](./../../../../docs/images/portal_event_handler.png)

6. Open function hosted page `http://localhost:7071/api/index` to start chat.