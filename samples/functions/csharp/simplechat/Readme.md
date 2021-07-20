# Simple Chat

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

## Deploy Functions to Azure

Now you've been able to run with Web PubSub service in local function. And next you can deploy the function to Azure for a complete cloud environment.

1. Open the VS Code command palette(`F1`) and search and find: **Azure Functions: Deploy to Function App**. Ensure you've installed extensions: [**Azure Functions**](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions).

2. When prompted, select/create resource accordingly.

3. Different from local functions, Azure Function App requires to access with valid keys when using webhook. So the event handler settings need an additional query part. 

    First navigate to **Azure Portal** and find the function app you just created. Then go to **Functions** -> **App keys** -> **System keys**. Copy out the value for webpubsub_extension.

    ![Function App Keys](./../../../../docs/images/functions_appkeys.png)

    Update event handler settings for your Web PubSub service in **Azure Portal** -> **Settings**, and replace function app name and code following below pattern.

    ```
    https://{function-app}.azurewebsites.net/runtime/webhooks/webpubsub?Code={code}
    ```