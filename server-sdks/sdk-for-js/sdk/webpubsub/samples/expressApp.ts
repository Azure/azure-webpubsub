import { WebPubSubCloudEventsHandler, WebPubSubServiceClient } from "../src";

import * as dotenv from "dotenv";
import express from "express";
dotenv.config();

const hub = 'chat';
const client = new WebPubSubServiceClient(process.env.WPS_CONNECTION_STRING!, hub);
const wpsserver = new WebPubSubCloudEventsHandler(
  'chat', ["*"],
  {
    dumpRequest: false,
    handleConnect: async (connectRequest, connectResponse) => {
      connectResponse.success({
        userId: "vic",
        groups: [
          "group3"
        ],
        roles: [
          "webpubsub.sendToGroup",
        ]
      });
    },
    handleUserEvent: async (userEventRequest, userEventResponse) => {
      userEventResponse.success("Echo " + userEventRequest.data, userEventRequest.dataType);
      if (await client.hasUser("Ken")){
        await client.sendToUser("Ken", "Hi Ken: " + userEventRequest.data, {dataType: userEventRequest.dataType});
      } else{
        console.log("Ken is not yet online");
      }
    },
    onConnected: async _ => {
      await client.sendToAll("Hello I am here", {dataType: 'text'});
    },
    onDisconnected: async req => {
      console.log(req.context.connectionId + "disconnected.");
    }
  }
);

const app = express();

app.use(wpsserver.getMiddleware())

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${wpsserver.path}`));
