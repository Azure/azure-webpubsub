# Create a chat app with Microsoft Entra ID

This sample is to help you create a chat app using Microsoft Entra authentication.

## Prerequisites

1. [ASP.NET Core 3.1 or above](https://docs.microsoft.com/aspnet/core)
2. Create an [Azure Web PubSub](https://ms.portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.SignalRService%2FWebPubSub) resource on Azure Portal
3. [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to tunnel traffic from Web PubSub to your localhost
4. [Azure CLI](https://docs.microsoft.com/cli/azure/) or [Azure Powershell](https://docs.microsoft.com/powershell/azure/)

## Getting started

### 1. Compile and build your project.

```bash
dotnet restore
```

### 2. Login Azure account in your terminal

```bash
az login
```

### 3. Configure an event handler on Azure portal.

1. Open [Azure Portal](https://ms.portal.azure.com/), search for and select your `Azure Web PubSub` resource.
2. Under **Settings** section, click **Settings**.
3. Click **Add**.
4. Enter `Sample_ChatApp` as **Hub name**.
5. Set **URL template** to `tunnel:///eventhandler`
6. Click **System events**, then select **connected** to let the service sends `connected` events to your upstream server.
    ![Event Handler](../../images/portal_event_handler_Sample_ChatApp.png)
7. Click **Save** to confirm the change.

### 4. Configure Role-Based Access Control (RBAC)

1. Open [Azure Portal](https://ms.portal.azure.com/), search for and select your `Azure Web PubSub` resource.
2. Select **Access control (IAM)**.
3. Click **Add > Add role assignment**.
4. On **Role** tab, select **Web PubSub Service Owner**.
5. Click **Next**.
   ![Screenshot of Select Roles](./media/add-role-assignment-roles.png)
6. On **Members** tab, select **User, group, or service principal**, then click **Select members**.
7. Search for and select yourself. Don't forget to click **Select** to confirm selection.
8. Click **Next**.
   ![Screenshot of Select Members](./media/add-role-assignment-members.png)
9. On **Review + assign** tab, click **Review + assign** to confirm the assignment.

> Azure role assignments may take up to 30 minutes to propagate.

### 5. Use `awps-tunnel` to tunnel traffic from your Web PubSub service

`awps-tunnel` also leverages the Microsoft Entra ID and RBAC role to login.

```bash
npm install -g @azure/web-pubsub-tunnel-tool
awps-tunnel run --endpoint "<endpoint>" --hub Sample_ChatApp --upstream http://localhost:8080 
```

### 6. Start your server

```csharp
dotnet user-secrets set Azure:WebPubSub:Endpoint "<endpoint>"
dotnet run --urls http://localhost:8080
```

Open http://localhost:8080/index.html, input your user name, and send messages.

You could open the webview of the tunnel tool http://127.0.0.1:9080/ to see the requests coming in with every message sent from the page.
