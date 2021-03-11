import { WebPubSubHttpProtocolHandler } from "../src/webPubSubServer";
import * as dotenv from "dotenv";
import express from "express";
dotenv.config();

const wpsserver = new WebPubSubHttpProtocolHandler(process.env.WPS_CONNECTION_STRING!,
  'chat',
  {
    onConnect: async connectRequest => {
      console.log(JSON.stringify(connectRequest));
      return {};
    },
    onConnected: async (connectedRequest, context) => {
      console.log(JSON.stringify(connectedRequest));
      try {
        await context.manager.sendToAll(connectedRequest.connection.connectionId + " connected");
      } catch (err) {
        console.error(err);
      }
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
  },
  {
    dumpRequest: false,
  }
);

const app = express();

app.use(wpsserver.getMiddleware())

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${wpsserver.path}`));
