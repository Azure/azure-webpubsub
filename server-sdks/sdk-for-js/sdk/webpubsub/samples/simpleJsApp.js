const { WebPubSubServer } = require('./../dist/webpubsub')
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

const wpsserver = new WebPubSubServer(process.env.WPS_CONNECTION_STRING, 'chat',
  {
    // eventHandlerUrl: "/customUrl", // optional
    onConnect: async connectRequest => {
      // success with client joining group1
      // await wpsserver.broadcast(connectRequest.context.connectionId);
      console.log(connectRequest.context);
      return {
        userId: "vicancy"
      }; // or connectRequest.fail(); to 401 the request
    },
    onConnected: async connectedRequest => {
      await wpsserver.sendToAll(connectedRequest.context.connectionId + " connected");
    },
    onUserEvent: async userRequest => {
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
  if (await wpsserver.handleNodeRequest(request, response)) {
    console.log(`Processed ${request.url}`);
  }
  else {
    console.log(`${request.url} for others to process`);
    response.statusCode = 404;
    response.end();
  }
});

server.listen(port, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:${port}${wpsserver.eventHandlerUrl}`));
