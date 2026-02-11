import express from 'express';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { ChatClient } from '@azure/web-pubsub-chat-client';

const connectionString = process.argv[2];
if (!connectionString) {
  console.error('Usage: node index.js "<connection-string>"');
  process.exit(1);
}

const DEFAULT_ROOM_ID = "rid_public";
const DEFAULT_ROOM_NAME = "Public Room";
const GLOBAL_METADATA_ROOM_NAME = "GLOBAL_METADATA";
const GLOBAL_METADATA_ROOM_ID = "rid_global_metadata"

const hubName = 'chat';
const app = express();
const port = process.env.PORT || 3000;

let serviceClient = new WebPubSubServiceClient(connectionString, hubName, {allowInsecureConnection: true});

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
    // Create self-chat room for user (chat with yourself)
    const selfChatRoomId = `private-${userId}-${userId}`;
    try {
      await chatClient.createRoom(`${userId} (You)`, [userId], selfChatRoomId);
    } catch (err) {
      // Room may already exist, ignore error
      console.log(`Self-chat room for ${userId} may already exist:`, err.message);
    }
  }
  res.json({
    url: token.url
  });
});

app.listen(port, '0.0.0.0', async () => {
  console.log(`Event handler listening at http://localhost:${port}`);
  const adminUserId = "admin";
  chatClient = new ChatClient({
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
  await chatClient.login();
  chatClient.addListenerForNewMessage((message) => {
    const text = message.message.content.text;
    console.log(`new room message, roomId = ${message.conversation.roomId}, messageId = ${message.message.messageId}, createdBy = ${message.message.createdBy}, text = ${text}`);
  });
  console.log("Chat client logged in as admin");
  
  // Create initial rooms (ignore if already exists)
  const createRoomIfNotExists = async (name, members, roomId) => {
    try {
      await chatClient.createRoom(name, members, roomId);
      console.log(`Room created: ${name}`);
    } catch (err) {
      if (err.message === 'RoomAlreadyExists') {
        console.log(`Room already exists: ${name}`);
      } else {
        throw err;
      }
    }
  };
  
  await createRoomIfNotExists(DEFAULT_ROOM_NAME, [], DEFAULT_ROOM_ID);
  await createRoomIfNotExists(GLOBAL_METADATA_ROOM_NAME, [], GLOBAL_METADATA_ROOM_ID);
});