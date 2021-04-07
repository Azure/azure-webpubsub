import { WebPubSubCloudEventsHandler, WebPubSubServiceClient } from "../src";

import * as dotenv from "dotenv";
import express from "express";
dotenv.config();

process.env.WPS_CONNECTION_STRING = "Endpoint=https://testaadforwps.webpubsub.azure.com;AccessKey=/jERd7YVCJxCinARLxZm2JXtijG13s2IGcmu6OdPOd4=;Version=1.0;";

const hub = 'chat';
const client = new WebPubSubServiceClient(process.env.WPS_CONNECTION_STRING!, hub);
const wpsserver = new WebPubSubCloudEventsHandler(
  'chat', ["*"],
  {
    dumpRequest: false,
    handleConnect: async (connectRequest, connectResponse) => {
      console.log("asd")
      connectResponse.success({
        userId: "std",
        groups: [
          "group3"
        ],
        roles: [
          "webpubsub.sendToGroup",
        ]
      });
    },
    handleUserEvent: async (userEventRequest, userEventResponse) => {
      console.log("event")
      userEventResponse.success("false", userEventRequest.dataType);
      if (await client.hasUser("Ken")){
        await client.sendToUser("Ken", "Hi Ken: " + userEventRequest.data, {dataType: userEventRequest.dataType});
      } else{
        console.log("Ken is not yet online");
      }
    },
    onConnected: async _ => {
      console.log("hello")
      await client.sendToAll("Hello I am here", {dataType: 'text'});
    },
    onDisconnected: async req => {
      console.log(req.context.connectionId + " disconnected.");
    }
  }
);

const app = express();

app.use(wpsserver.getMiddleware())

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${wpsserver.path}`));
