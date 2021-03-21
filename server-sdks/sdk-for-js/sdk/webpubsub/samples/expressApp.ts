import { WebPubSubCloudEventsHandler, WebPubSubServiceRestClient } from "../src";

import * as dotenv from "dotenv";
import express from "express";
dotenv.config();
const hub = 'chat';
const client = new WebPubSubServiceRestClient(process.env.WPS_CONNECTION_STRING!, hub);
const wpsserver = new WebPubSubCloudEventsHandler(
  'chat', ["*"],
  {
    dumpRequest: false,
    onConnect: async connectRequest => {
      return {
        userId: "Ken",
        groups: [
          "group3"
        ],
        roles: [
          "webpubsub.sendToGroup",
        ]
      };
    },
    onConnected: async connectedRequest => {
      await client.sendToAll("Hello I am here", {plainText: true});
    },
    onUserEvent: async userRequest => {
      if (await client.hasUser("Ken")){
        await client.sendToUser("Ken", "Hi Ken: " + userRequest.payload.data);
      } else{
        console.log("Ken is not yet online");
      }
      return {
        payload: {
          data: "Echo " + userRequest.payload.data,
          dataType: userRequest.payload.dataType
        }
      };
    },
  }
);

const app = express();

app.use(wpsserver.getMiddleware())

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${wpsserver.path}`));
