import * as dotenv from "dotenv";

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebPubSubServiceEndpoint, WebPubSubServiceRestClient, WebPubSubHttpProtocolHandler } from "../src";

dotenv.config();

const client = new WebPubSubServiceEndpoint(process.env.WPS_CONNECTION_STRING!);
console.log(client.clientNegotiate('hub'));

var rest = new WebPubSubServiceRestClient(process.env.WPS_CONNECTION_STRING!, 'chat');

const wpsserver = new WebPubSubHttpProtocolHandler(process.env.WPS_CONNECTION_STRING!, 'chat',
  {
    // eventHandlerUrl: "/customUrl", // optional
    onConnect: async (connectRequest, context) => {
      // success with client joining group1
      // await wpsserver.broadcast(connectRequest.context.connectionId);
      console.log(connectRequest.connection);
      return {
        userId: "vicancy"
      }; // or connectRequest.fail(); to 401 the request
    },
    onConnected: async (connectedRequest, context) => {
      await context.manager.sendToAll(connectedRequest.connection.connectionId + " connected");
    },
  }
);

const port = 3000;

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

server.listen(port, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:${port}${wpsserver.path}`));
