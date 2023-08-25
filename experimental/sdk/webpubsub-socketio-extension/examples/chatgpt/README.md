# ChatGPT in Web PubSub for Socket.IO

A simple sample written in React.js and Node.js to show how to build an OpenAI [ChatGPT](https://chat.openai.com/)-like chat bot using OpenAI chat completion [API](https://platform.openai.com/docs/guides/chat).

Web PubSub for Socket.IO service is used for realtime messaging.
The client is connected with the service rather than the server for realtime messaging.

Main features:
1. Dialogue based chat with ChatGPT
2. Generate chat response in a streaming way (like how OpenAI ChatGPT does it)
3. Render chat messages in rich text format (using Markdown)
4. Automatically name the chat session from content
5. Support using system message to customize the chat
6. Multiple chat sessions support
7. Persist chat history at server side
8. Support both native OpenAI API and [Azure OpenAI Service](https://azure.microsoft.com/products/cognitive-services/openai-service) API
9. Use Web PubSub for Socket.IO as realtime service to support large-scale concurrent clients.

## How to run

### Use native OpenAI:
You need to have an OpenAI account first.

1. Go to your OpenAI account, open [API keys](https://platform.openai.com/account/api-keys) page, create a new secret key.
2. Set the key as environment variable:
   ```
   export MODE="native"
   export OPENAI_API_KEY=<your_openai_api_key>
   ```
   Or you can save the key into `.env` file:
   ```
   MODE="native"
   OPENAI_API_KEY=<your_openai_api_key>
   ```

### Use Azure OpenAI Service
You need to have an Azure OpenAI resource first.

1. Go to your Azure OpenAI service resource, open tab "Keys and Endpoint" and get required information listed below.
2. Set the environment variable
   ```bash
   export MODE="azure"
   export AZURE_OPENAI_RESOURCE_NAME=<azure_openai_resource_name>
   export AZURE_OPENAI_DEPLOYMENT_NAME=<azure_openai_model_deployment_name>
   export AZURE_OPENAI_API_KEY=<azure_openai_api_key>
   ```
   Or you can save the key into `.env` file:
   ```
   MODE="azure"
   AZURE_OPENAI_RESOURCE_NAME=<azure_openai_resource_name>
   AZURE_OPENAI_DEPLOYMENT_NAME=<azure_openai_model_deployment_name>
   AZURE_OPENAI_API_KEY=<azure_openai_api_key>
   ```

3. Open you Web PubSub for Socket.IO resource and get the connection string.
   Set the environment variable
   ```bash
   export WebPubSubConnectionString=<web-pubsub-connection-string>
   ```
   Or you can save the connection string into `.env` file:
   ```
   WebPubSubConnectionString=<web-pubsub-connection-string>
   ```

4. Run the following command:
   ```
   npm install
   npm run build
   npm start
   ```

Then open http://localhost:3000 in your browser to use the app.

There is also a CLI version where you can play with the chat bot in command line window:
```
node src/server/test.js
```

## Persist chat history

This sample has a very simple [implementation](src/server/storage.js) to persist the chat history into file system (the files can be found under `sessions` directory), which is only for demo purpose and should not be used in any production environment. You can have your own storage logic by implementing the functions in `Storage` class.

## Use Web PubSub for Socket.IO for realtime messaging

Web PubSub for Socket.IO is used to handle realtime messaging and manage large-scale concurrent connections.

> No matter which transport you're using, in the backend communication between server and OpenAI service is using [Server Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events), which is not something we can customize. Also this chat bot scenario itself is a request-response model, so there may not be big difference of using WebSocket/Socket.IO. But you may find it useful in other scenarios (e.g. in a multi-user chat room where messages may be broadcasted to all users), so I implemented it here just for the completeness of a technical demo.