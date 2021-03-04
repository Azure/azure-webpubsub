---
layout: docs
toc: true
title: Server SDK Design Spec
group: specs
---

## Table of Content
- [Scope for Public Preview](#scope)
- [JavaScript](#js)
- [C#]
- [Python]
- [Java]

## Scope for Public Preview
<a name="scope"></a>

The server SDK, providing a convinience way for the users to use the service, should contain the following features:
1. [Must-have] Service->Server REST API support
1. [Nice-to-have] Server->Service CloudEvents handler
    1. Common data structure for Web PubSub Service specific CloudEvents request and response
    1. Helper method to convert HTTP headers and body to Web PubSub Service specific CloudEvents request
    1. Helper method to convert Web PubSub Service specific CloudEvents response to HTTP response headers and body
    1. Middleware for processing Web PubSub Service specific CloudEvents HTTP requests
1. [Nice-to-have] Client Auth token generator


## JavaScript SDK proposal
<a name="js"></a>
### For express
```js
const wpsserver = new WebPubSubServer(process.env.WPS_CONNECTION_STRING!,
  {
    onConnect: async connectRequest => {
      // success with client joining group1
      // await wpsserver.broadcast(connectRequest.context.connectionId);
      console.log(connectRequest.context.connectionId);
      return {
        userId: "vicancy"
      }; // or connectRequest.fail(); to 401 the request
    }
  }
);

const app = express();

app.use(wpsserver.getMiddleware())

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${wpsserver.eventHandlerUrl}`));
```

### For raw node
```js

const wpsserver = new WebPubSubServer(process.env.WPS_CONNECTION_STRING!,
  {
    eventHandlerUrl: "/customUrl", // optional
    hub: "chat", // optional
    onConnect: async connectRequest => {
      // success with client joining group1
      // await wpsserver.broadcast(connectRequest.context.connectionId);
      console.log(connectRequest.context);
      return {
        userId: "vicancy"
      }; // or connectRequest.fail(); to 401 the request
    },
    onConnected: async connectedRequest =>{
      await wpsserver.broadcast(connectedRequest.context.connectionId + " connected");
    },
    onUserEvent: async userRequest => {
      return {
        body: "Hey " + userRequest.data,
      };
    },
    onDisconnected: async disconnectRequest => {
      console.log(disconnectRequest.context.userId + " disconnected");
    }
  }
);

const port = 5555;

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  if (await wpsserver.handleNodeRequest(request, response)){
    console.log(`Processed ${request.url}`);
  }
  else{
    console.log(`${request.url} for others to process`);
    response.statusCode = 404;
    response.end();
  }
});

server.listen(port, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:${port}${wpsserver.eventHandlerUrl}`));
```