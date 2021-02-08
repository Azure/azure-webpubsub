import { WebPubSubServer } from "../src/webPubSubServer";
import * as dotenv from "dotenv";
import express from "express";
dotenv.config();

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
