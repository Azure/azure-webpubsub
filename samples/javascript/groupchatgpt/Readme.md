# Create a Chat app with client SDK and react

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. Use GitHub Codespaces

## Overview
The sample demonstrates building a chat app on a webpage with the Web PubSub client SDK and react.

The functionality of the following files:

* `/server.js` Host a server exposing endpoints for returning `Client Access URI` for clients; serve the `invokegpt` event ask from the client.
* `/src/App.js` Contains a Web PubSub client receiving messages from a group and sending messages to the group with the react framework. When the chat starts with `@chatgpt ` then the client sends event `invokegpt` to the service.

## Create your OpenAI service
You can use OpenAI API or your own Azure OpenAI service. If you are using Azure OpenAI service, make sure the Model deployment name is the model name `gpt-3.5-turbo`.

## Setup and run the app
In some of the other samples, we show how to run the app locally and expose the local app through some local tunnel tools like ngrok or localtunnel.

In this sample, we open this project from [GitHub codespace](https://github.com/features/codespaces) and run it from inside the Codespace.

1. In this GitHub repo, click **Code** and choose `Codespaces` tab to open the project in codespace. If there is no codespace yet, click *Create codespace on main* to create one for you. Codespace starts in seconds with up to 60 hours a month free.
2. In Codespace, switch to the Terminal tab
    0. Navigate to current folder
        ```bash
        cd samples/javascript/groupchatgpt
        ```
    1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and set the value to the environment.
        ```bash
        export WebPubSubConnectionString="<your-web-pubsub-service-connection-string>"
        ```
    2. Copy your OpenAI API, and set the value to the environment:
        ```bash
        export OPENAI_API_KEY="<your-api-key>"
        export OPENAI_API_Endpoint="<your-api-service-endpoint>" #set if you are using Azure OpenAI
        export OPENAI_API_Deployment="<your-service-model-deployment-name>" #set if you are using Azure OpenAI
        ```
    3. Run the project on port 8080
        ```bash
        npm install
        npm run start
        ```
3. Expose port 8080 to public
    In Codespaces **PORTS** tab (next to the **TERMINAL** tab), right click to change *Port Visibility* to **Public** so that Azure Web PubSub can connect to it. Right click and select *Copy Local Address*, this address will be used in next step for Azure Web PubSub to push events to.
4. In Azure Web PubSub *settings* tab, add hub setting for `groupchatgpt`
    * Hub: `groupchatgpt`
    * Configure Event Handlers -> Add
        * URL Template:  `<copied_local_address>/eventhandler` (Don't forget to add path `/eventhandler`)
        * User events: **Specify**
        * Specify the user events: `invokegpt`
    * **Confirm** and **Save**
5. Switch back to your codespace and open the application in multiple browser tabs with your copied local address and start your chat.