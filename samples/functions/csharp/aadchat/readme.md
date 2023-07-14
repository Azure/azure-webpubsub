# Function app with Azure Web PubSub with AccessKey disabled

Web PubSub function triggers is actively working on supporting such format. For now, we need to explicity invoke Web PubSub SDK instead.

## 0. Enable Web PubSub identity 

Follow https://docs.microsoft.com/en-us/azure/azure-web-pubsub/howto-use-managed-identity to enable identity in Web PubSub

* Copy Object(principal) ID

## 1. Deploy the sample to Function app

Update your `local.settings.json`:
*   "Hub": &lt;your-hub-name&gt;
*   "WebPubSubEndpoint": "https://&lt;your-resource-name&gt;.webpubsub.azure.com",
*   "WebPubSubIdentityObjectId": The copied Object(principal) ID

Create and deploy:

```bash
# Create a storage
az storage account create -n <STORAGE_NAME> -l <REGION> -g <RESOURCEGROUP>
# Create Function app
az functionapp create --resource-group <RESOURCEGROUP> --consumption-plan-location <REGION> --runtime dotnet --functions-version 4 --name <FUNCIONAPP_NAME> --storage-account <STORAGE_NAME>
# Publish the sample
func azure functionapp publish <FUNCIONAPP_NAME>
# Publish the config, when asking if overwrite AzureWebJobsStorage, type "no"
func azure functionapp publish <FUNCIONAPP_NAME> --publish-local-settings --publish-settings-only
```

## 2. Set up AAD for both Function and Web PubSub

Since Azure Web PubSub and Function app talks bidirectional, we need to set AAD auth for both direction.

### 1. For Function to talk to Azure Web PubSub using AAD auth
For Function app to talk to Azure Web PubSub using AAD auth, you need to assign a `Web PubSub Service Owner role` to a system-assigned identity of your Function over a Web PubSub resource.

1. Add a system-assigned identity to your **Function** following https://docs.microsoft.com/en-us/azure/app-service/overview-managed-identity?tabs=portal%2Chttp#add-a-system-assigned-identity

2. Give this identity a `Web PubSub Service Owner role` following https://docs.microsoft.com/en-us/azure/azure-web-pubsub/howto-authorize-from-managed-identity

### 2. Enable Function client Authentication

Follow https://docs.microsoft.com/en-us/azure/app-service/configure-authentication-provider-aad?toc=%2Fazure%2Fazure-functions%2Ftoc.json#--option-1-create-a-new-app-registration-automatically to add client Authentication to your clients.

* Name: &lt;Your App Name&gt;
* Restrict access: Require authentication

Now let's test if the workflow works: open URL https://<FUNCIONAPP_NAME>.azurewebsites.net/api/index, it should redirect to AAD login window, login to redirect back. And when you press F12 to view the network, (F5 to refresh the page)you can see that there is a request to "negotiate" with your Function and the WebSocket connection is successfully established.

### 2. For Azure Web PubSub to send events to Function using AAD auth

Now it's time for us the set the "message" event handler in Azure Web PubSub with Managed Identity.

Open your Web PubSub resource from Azure portal, go to **Settting**, add a **chat** (depends on the Hub you set in the settings.json) hub:
  * URL Template: https://<FUNCIONAPP_NAME>.azurewebsites.net/runtime/webhooks/webpubsub?code=<APP_KEY>
    * <APP_KEY> can be read from Function poratl (App Keys => System Keys => `webpubsub_extension`)
  * Authentication: Use Managed Identity
    * Specify the issued token audience
        * Click **select from existing applications** and search with your &lt;Your App Name&gt; and select App ID which is provided by app's identity provider
  * Others keep default settings

All set.
Open URL https://<FUNCIONAPP_NAME>.azurewebsites.net/api/index to run.