# Create a Chat app with client SDK and react

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to tunnel traffic from Web PubSub to your localhost

## Overview
The sample demonstrates building a chat app on a webpage with the Web PubSub client SDK and react.

The functionality of the following files:

* `/server.js` Host a server exposing endpoints for returning `Client Access URI` for clients; serve the `invokegpt` event ask from the client.
* `/src/App.js` Contains a Web PubSub client receiving messages from a group and sending messages to the group with the react framework. When the chat starts with `@chatgpt ` then the client sends event `invokegpt` to the service.

## Create your OpenAI service
You can use OpenAI API or your own Azure OpenAI service. If you are using Azure OpenAI service, make sure the Model deployment name is the model name `gpt-3.5-turbo`.

## Setup and run the app
In some of the other samples, we show how to run the app locally and use [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to route traffic from Web PubSub service to your localhost.

1. Navigate to current folder
    ```bash
    cd samples/javascript/groupchatgpt
    ```
2. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and set the value to the environment.
    ```bash
    export WebPubSubConnectionString="<your-web-pubsub-service-connection-string>"
    ```
3. Copy your OpenAI API, and set the value to the environment:
    ```bash
    export OPENAI_API_KEY="<your-api-key>"
    export OPENAI_API_Endpoint="<your-api-service-endpoint>" #set if you are using Azure OpenAI
    export OPENAI_API_Deployment="<your-service-model-deployment-name>" #set if you are using Azure OpenAI
    ```
4. Run the project on port 8080
    ```bash
    npm install
    npm run start
    ```
5. Run awps-tunnel
   Start a new terminal and run:
   ```bash
    npm install -g @azure/web-pubsub-tunnel-tool
    export WebPubSubConnectionString="<connection_string>"
    awps-tunnel run --hub groupchatgpt --upstream http://localhost:8080
   ```
   
6. In Azure Web PubSub *settings* tab, add hub setting for `groupchatgpt`
    * Hub: `groupchatgpt`
    * Configure Event Handlers -> Add
        * URL Template:  `tunnel:///eventhandler`
        * User events: **Specify**
        * Specify the user events: `invokegpt`
    * **Confirm** and **Save**
7. Open the application http://localhost:8080/index.html in multiple browser tabs with your copied local address and start your chat.
