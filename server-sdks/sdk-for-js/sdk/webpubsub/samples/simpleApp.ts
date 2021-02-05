import { WebPubSubServer } from "../src/webPubSubServer";
import * as dotenv from "dotenv";

import { createServer, IncomingMessage, ServerResponse } from 'http';

dotenv.config();

const wpsserver = new WebPubSubServer(process.env.WPS_CONNECTION_STRING!,
  {
    eventHandlerUrl: "/customUrl", // optional
    hub: "chat", // is optional
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

const port = 5000;

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

server.listen(port, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:8000${wpsserver.eventHandlerUrl}`));
