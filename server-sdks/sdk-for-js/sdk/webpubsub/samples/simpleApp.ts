import * as dotenv from "dotenv";

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebPubSubServer} from "../src";

dotenv.config();

const wpsserver = new WebPubSubServer(process.env.WPS_CONNECTION_STRING!, 'chat');

const serviceClient = wpsserver.createServiceClient();
console.log(serviceClient.authClient({}));

console.log(wpsserver.endpoint.clientNegotiate('chat', {
  userId: "vicancy",
  claims: {
    hey: ["w"],
    role: ["webpubsub.group.join"],
 }
}));

const handler = wpsserver.createCloudEventsHandler(
  {
    path: "/customUrl", // optional
    onConnect: async connectRequest => {
      // success with client joining group1
      console.log(connectRequest.context);
      return {
        userId: "vicancy"
      };
    },
    onConnected: async connectedRequest => {
      await serviceClient.sendToAll(connectedRequest.context.connectionId + " connected");
    },
  }
);

const port = 3000;

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  if (await handler.handleRequest(request, response)){
  }
  else{
    console.log(`${request.url} for others to process`);
    response.statusCode = 404;
    response.end();
  }
});

server.listen(port, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:${port}${handler.path}`));
