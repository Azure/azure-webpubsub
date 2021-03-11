import { WebPubSubCloudEventsHandler } from "../src/webPubSubServer";
import * as dotenv from "dotenv";
import express from "express";
dotenv.config();

const wpsserver = new WebPubSubCloudEventsHandler(process.env.WPS_CONNECTION_STRING!,
  'chat',
  {
    dumpRequest: false,
    onConnect: async connectRequest => {
      console.log(JSON.stringify(connectRequest));
      return {};
    },
    onConnected: async connectedRequest => {
      console.log(JSON.stringify(connectedRequest));
    },
    onUserEvent: async userRequest => {
      console.log(JSON.stringify(userRequest));
      return {
        payload: {
          data: "Hey " + userRequest.payload.data,
          dataType: userRequest.payload.dataType
        }
      };
    },
  }
);

const app = express();

app.use(wpsserver.getMiddleware())

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${wpsserver.path}`));
