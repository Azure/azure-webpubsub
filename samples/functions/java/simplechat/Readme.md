# Simple Chat

## Prerequisites
1. [Azure Function Core Tools(v3)](https://www.npmjs.com/package/azure-functions-core-tools)
2. [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to tunnel traffic from Web PubSub to your localhost

## Setup and Run

1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String** in `local.settings.json`.

![Connection String](./../../../../docs/images/portal_conn.png)

2. Start app

```bash
func start
```

3. Use `awps-tunnel` to tunnel traffic from Web PubSub service to your localhost

    ```bash
    npm install -g @azure/web-pubsub-tunnel-tool
    export WebPubSubConnectionString="<connection_string>"
    awps-tunnel run --hub simplechat --upstream http://localhost:7071
    ```

4. Update event handler settings in **Azure Portal** -> **Settings** to enable service route events to current function app.

    Property|Value
    --|--
    `HubName`| simplechat
    `URL Template`| tunnel:///api/message
    `User Event Pattern`| *

5. Open function hosted page `http://localhost:7071/api/index?authenticated=true` to start chat.

## Deploy Functions to Azure

Now you've been able to run with Web PubSub service in local function. And next you can deploy the function to Azure for a complete cloud environment.

1. Open the VS Code command palette(`F1`) and search and find: **Azure Functions: Deploy to Function App**. Ensure you've installed extensions: [**Azure Functions**](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions).

2. When prompted, select/create resource accordingly.
3. Update event handler settings for your Web PubSub service in **Azure Portal** -> **Settings**, and replace function app name and `API_KEY` following below pattern.

    ```
    https://{function-app}.azurewebsites.net/api/message?Code={API_KEY}
    ```
4. Go to Azure portal -> Find your Function App resource -> Authentication. Click Add identity provider. Set App Service authentication settings to Allow unauthenticated access, so your client index page can be visited by anonymous users before redirect to authenticate. Then Save. And try with https://{function-app}.azurewebsites.net/api/index to experience the "login" workflow.