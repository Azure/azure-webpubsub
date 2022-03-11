# Create a chat app with aad auth

This sample is to help you create a chat app with aad auth method.

## Prerequisites

1. [ASP.NET Core 3.1 or above](https://docs.microsoft.com/aspnet/core)
2. Create an [Azure Web PubSub](https://ms.portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.SignalRService%2FWebPubSub) resource on Azure Portal
3. [localtunnel](https://github.com/localtunnel/localtunnel) to expose our localhost to internet
4. [Azure CLI](https://docs.microsoft.com/cli/azure/) or [Azure Powershell](https://docs.microsoft.com/powershell/azure/)

## Getting started

### 1. Compile and build your project

```bash
dotnet restore
```

### 2. Login Azure account in your terminal

```bash
az login
```

### 3. Use localtunnel to expose localhost

[localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

```bash
lt --port 8080 --print-requests
```

localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

> Tip:
> There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)  

There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

```bash
curl https://<domain-name>.loca.lt/eventhandler -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
```

Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.


### 4. Configure an event handler

1. Open [Azure Portal](https://ms.portal.azure.com/), search for and select your `Azure Web PubSub` resource.
1. Open `Settings` panel.
1. Click `Add` to add a hub setting.
1. Enter `chat` as `Hub name`.
1. Set `URL template` to `https://<name>.loca.lt/eventhandler`
1. Click `System events`, then select `connected` to let the service sends `connected` events to your upstream server.
    ![Event Handler](./images/hub-settings.png)
1. Click `Save` to confirm the change.

### 5. Configure Role-Based Access Control (RBAC)

1. Open [Azure Portal](https://ms.portal.azure.com/), search for and select your `Azure Web PubSub` resource.
1. Open `Access control (IAM)` panel.
1. Click `Add > Add role assignment`.
1. On `Role` tab, select `Web PubSub Service Owner (Preview)`.
1. Click `Next`.
   ![Screenshot of Select Roles](./images/select-role.png)
1. On `Members` tab, choose `User, group, or service principal`, then click `Select members`.
1. Search for and select yourself. Don't forget to click `Select` to confirm selection.
1. Click `Next`.
   ![Screenshot of Select Members](./images/select-members.png)
1. On `Review + assign` tab, click `Review + assign` to confirm the assignment.

> Azure role assignments may take up to 30 minutes to propagate.

### 6. Start your server

```bash
dotnet user-secrets set Azure:WebPubSub:Endpoint "<endpoint>"
dotnet run --urls http://localhost:8080
```

Open http://localhost:8080/index.html, input your user name, and try sending messages.

## Questions

1. Q: Why I got a 401 (Unauthorized) error response?

   Please check if you have assigned `Web PubSub Service Owner` role to yourself first.

   If you did, please also check if there was environment variables such as:

   - AZURE_TENANT_ID
   - AZURE_CLIENT_ID
   - AZURE_CLIENT_SECRET
   - AZURE_USERNAME
   - AZURE_PASSWORD

   If there was, remove them and try again.

   By default our sample will use `DefaultAzureCredential` to acquire Azure Ad token, it will try using environment variables as its first priority, which always represents an Azure application. Our service will response 401 unauthorized since this application doesn't have `Web PubSub Service Owner` role.
