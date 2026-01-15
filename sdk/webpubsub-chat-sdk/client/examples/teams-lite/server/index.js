
const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');
const { ChatClient } = require("@azure/web-pubsub-chat-client");
const { WebPubSubClient } = require('@azure/web-pubsub-client');

const DEFAULT_ROOM_ID = "rid_public";
const DEFAULT_ROOM_NAME = "Public Room";
const GLOBAL_METADATA_ROOM_NAME = "GLOBAL_METADATA";
const GLOBAL_METADATA_ROOM_ID = "rid_global_metadata"

const hubName = 'chat';
const app = express();
const port = process.env.PORT || 3000;

const connectionString = process.env.WebPubSubConnectionString || process.argv[2];

let serviceClient = new WebPubSubServiceClient(connectionString, hubName, {allowInsecureConnection: true});
let handler = new WebPubSubEventHandler(hubName, {
  path: '/eventhandler',
  onConnected: async req => {
    console.log(`${req.context.userId} connected`);
  },
});

let chatClient = null;

app.get('/api/negotiate', async (req, res) => {
  let userId = req.query.userId;
  if (!userId) {
    res.status(400).send('userId is required');
    return;
  }
  let token = await serviceClient.getClientAccessToken({ userId: userId });
  if (userId !== "admin") {
    await chatClient.addUserToRoom(DEFAULT_ROOM_ID, userId);
    await chatClient.addUserToRoom(GLOBAL_METADATA_ROOM_ID, userId);
  }
  res.json({
    url: token.url
  });
});

app.use(handler.getMiddleware());

app.listen(port, async () => {
  console.log(`Event handler listening at http://localhost:${port}${handler.path}`);
  const adminUserId = "admin";
  const adminClient = new WebPubSubClient({
    getClientAccessUrl: async () => {
      const url = `http://localhost:${port}/api/negotiate?userId=${adminUserId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Negotiation failed: ${response.statusText}`);
      }
      const body = (await response.json());
      if (!body?.url || typeof body.url !== 'string') {
        throw new Error('Negotiation failed: invalid response shape');
      }
      return body.url;
    },
  });
  chatClient = new ChatClient(adminClient);
  await chatClient.login();
  chatClient.addListenerForNewMessage((message) => {
    const text = message.message.content.text;
    console.log(`new room message, roomId = ${message.conversation.roomId}, messageId = ${message.message.messageId}, createdBy = ${message.message.createdBy}, text = ${text}`);
  });
  console.log("Chat client logged in as admin");
  try {
    await chatClient.createRoom(DEFAULT_ROOM_NAME, [], DEFAULT_ROOM_ID);
    await chatClient.createRoom(GLOBAL_METADATA_ROOM_NAME, [], GLOBAL_METADATA_ROOM_ID);
  }
  catch (err) {
    console.error('Chat client failed to login:', err);
  }
});