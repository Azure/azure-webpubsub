# Use Azure Web PubSub in GraphQL subscription

## Prepare
1. Create a Microsoft Azure Web PubSub resource instance. Details are [Here](https://docs.microsoft.com/en-us/azure/azure-web-pubsub/quickstart-serverless?tabs=javascript).

2. Use `ngrok` to expose our local endpoint to the public Internet

**Notice**: make sure the region of your Azure Web PubSub resource and the region of ngrok tunnel server are the same. For Example, if your Azure Web PubSub instance is located in Asia Pacific (ap) region , run your ngrok with parameter `--region=ap` as below. [Ngrok documents](https://ngrok.com/docs#global-locations) shows more location settings.
```
ngrok http --region=ap 8888 
```
Then you'll get a forwarding endpoint `http://{ngrok-id}.ngrok.io` like `http://1bff94a2f246.ap.ngrok.io`

3. Set `Event Handler` in Azure Web PubSub service. Go to **Azure portal** -> Find your Web PubSub resource -> **Settings**. Add two new hub settings as below. Replace the {ngrok-id} to yours. 

| Hub Name: graphql_main                         |                    |                                |
| ---------------------------------------------- | ------------------ | ------------------------------ |
| URL Template                                   | User Event Pattern | System Events                  |
| http://{ngrok-id}.ngrok.io/wps-services/main   | *                  | connect,connected,disconnected |


| Hub Name: graphql_pubsub                       |                    |                                |
| ---------------------------------------------- | ------------------ | ------------------------------ |
| URL Template                                   | User Event Pattern | System Events                  |
| http://{ngrok-id}.ngrok.io/wps-services/pubsub | *                  | No system Events is selected   |

4. replace `<web-pubsub-connection-string>>` in `index.js` Line 7 to your own Azure Web PubSub connection string

## Setup
```
npm install
node index.js
```
