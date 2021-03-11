const { WebPubSubServer } = require('./../dist/webpubsub')
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

const wpsserver = new WebPubSubServer(
  'Endpoint=http://localhost;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Port=8080;Version=1.0;'
  , 'chat');
const serviceClient = wpsserver.createServiceClient();
const handler = wpsserver.createCloudEventsHandler(
  {
    //path: "/customUrl", // optional
    onConnect: async connectRequest => {
      return {
        userId: "vicancy"
      };
    },
    onConnected: async connectedRequest => {
      await serviceClient.sendToAll(connectedRequest.context.connectionId + " connected");
    },
    onUserEvent: async userRequest => {
      console.log(`Received user request data: ${userRequest.payload.data}`);
      if (userRequest.payload.data === 'abort') {
        return {
          error: {
            detail: "aborted"
          }
        };
      }
      if (userRequest.payload.data === 'error') {
        throw new Error("error from inside the event");
      }
      return {
        payload: {
          data: "Hey " + userRequest.payload.data,
          dataType: userRequest.payload.dataType
        }
      };
    },
    onDisconnected: async disconnectRequest => {
      console.log(disconnectRequest.context.userId + " disconnected");
    }
  }
);

const port = 3000;

const server = http.createServer(async (request, response) => {
  if (!await handler.handleRequest(request, response)) {
    console.log(`${request.url} for others to process`);
    response.statusCode = 404;
    response.end();
  }
});

server.listen(port, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:${port}${handler.path}`));
