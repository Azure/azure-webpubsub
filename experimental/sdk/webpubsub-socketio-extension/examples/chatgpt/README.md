# My ChatGPT

A simple sample written in React.js and node.js to show how to build an OpenAI [ChatGPT](https://chat.openai.com/)-like chat bot using OpenAI chat completion [API](https://platform.openai.com/docs/guides/chat).

Main features:
1. Dialogue based chat with ChatGPT
2. Generate chat response in a streaming way (like how OpenAI ChatGPT does it)
3. Render chat messages in rich text format (using Markdown)
4. Automatically name the chat session from content
5. Support using system message to customize the chat
6. Multiple chat sessions support
7. Persist chat history at server side
8. Support both native OpenAI API and [Azure OpenAI Service](https://azure.microsoft.com/products/cognitive-services/openai-service) API

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
1. Go to your Azure OpenAI service resource.
2. Set the environment variable
```
export MODE="azure"
export AZURE_OPENAI_RESOURCE_NAME=<your-resource-name>
export AZURE_OPENAI_DEPLOYMENT_NAME=<your-deployment-name>
export AZURE_OPENAI_API_KEY=<your-api-key>
```
Or you can save the key into `.env` file:
```
MODE="azure"
AZURE_OPENAI_RESOURCE_NAME=<your-resource-name>
AZURE_OPENAI_DEPLOYMENT_NAME=<your-deployment-name>
AZURE_OPENAI_API_KEY=<your-api-key>
```

3. Run the following command:
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

## Use Azure OpenAI Service

Azure OpenAI service provides compatible APIs with native OpenAI ones. The main difference is the API endpoint and authentication method, which has already been abstracted into `createAzureOpenAIChat()` and `createOpenAIChat()` functions. To switch to Azure OpenAI Service, simply change to use `createAzureOpenAIChat()` in [index.js](src/server/index.js).

You also need to set different environment variables:
```
export AZURE_OPENAI_RESOURCE_NAME=<azure_openai_resource_name>
export AZURE_OPENAI_DEPLOYMENT_NAME=<azure_openai_model_deployment_name>
export AZURE_OPENAI_API_KEY=<azure_openai_api_key>
```

## Use WebSocket to stream messages

By default this sample uses HTTP request to stream the messages (message from ChatGPT is written into the HTTP response in a streaming way). You may want to use WebSocket to return the messages from server since it's usually considered as more efficient for slow and streaming responses.

To achieve this, simply change to use `setupWebSocketTransport()` in the constructor of client app. Here I use [Socket.IO](https://socket.io) which is popular javascript library for real-time communication.

> Socket.IO is not really a WebSocket implementation (it also uses long polling when WebSocket is not available), but in most cases it uses WebSocket since WebSocket is supported everywhere now.

> No matter which transport you're using, in the backend communication between server and OpenAI service is using [Server Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events), which is not something we can customize. Also this chat bot scenario itself is a request-response model, so there may not be big difference of using WebSocket/Socket.IO. But you may find it useful in other scenarios (e.g. in a multi-user chat room where messages may be broadcasted to all users), so I implemented it here just for the completeness of a technical demo.