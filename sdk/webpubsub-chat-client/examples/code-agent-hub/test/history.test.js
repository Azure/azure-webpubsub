// End-to-end test: create room, send messages, verify history retrieval
import { ChatClient } from '@azure/web-pubsub-chat-client';
import { WebPubSubServiceClient } from '@azure/web-pubsub';

const DEFAULT_EMULATOR_CONNECTION_STRING = 'Endpoint=http://localhost;Port=8080;AccessKey='
  + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  + '0123456789ABCDEFGH;Version=1.0;';

const connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING 
  || DEFAULT_EMULATOR_CONNECTION_STRING;
const hubName = 'chat';

const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getClient(userId, { maxAttempts = 5 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token = await serviceClient.getClientAccessToken({ userId });
    try {
      return await new ChatClient(token.url).login();
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      if (!/429|too many requests/i.test(message) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(250 * attempt);
    }
  }
  throw lastError || new Error(`Failed to login chat client for ${userId}`);
}

async function main() {
  console.log('=== History Retrieval Test ===\n');

  // Step 1: Login as bot and user
  const bot = await getClient('test-bot');
  const user = await getClient('test-user');
  console.log(`Bot logged in as: ${bot.userId}`);
  console.log(`User logged in as: ${user.userId}`);

  // Step 2: Bot creates a room with user
  const roomId = `test-room-${Date.now()}`;
  const room = await bot.createRoom('Test History Room', [user.userId], roomId);
  console.log(`\nRoom created: ${room.roomId}`);
  console.log(`Room conversationId: ${room.defaultConversationId}`);

  // Step 3: Bot sends 3 messages
  console.log('\n--- Sending messages ---');
  for (let i = 1; i <= 3; i++) {
    const msgId = await bot.sendToRoom(room.roomId, JSON.stringify({ type: 'assistant.message', content: `Message #${i}` }));
    console.log(`Bot sent message #${i}, msgId=${msgId}`);
  }

  // Step 4: User sends 2 messages
  for (let i = 1; i <= 2; i++) {
    const msgId = await user.sendToRoom(room.roomId, JSON.stringify({ type: 'user.prompt', content: `User msg #${i}` }));
    console.log(`User sent message #${i}, msgId=${msgId}`);
  }

  // Wait a bit for persistence
  await new Promise(r => setTimeout(r, 500));

  // Step 5: Test history retrieval from BOT
  console.log('\n--- Bot retrieves history ---');
  try {
    console.log(`Bot rooms: ${bot.rooms.map(r => r.roomId).join(', ')}`);
    const h1 = await bot.listRoomMessage(room.roomId, null, null, 100);
    console.log(`listRoomMessage(null, null): ${h1.messages.length} messages`);
    for (const m of h1.messages) {
      console.log(`  [${m.messageId}] by=${m.createdBy} text=${m.content?.text?.substring(0, 50)}`);
    }
  } catch (e) {
    console.log(`listRoomMessage FAILED: ${e.message}`);
  }

  try {
    const h2 = await bot.listMessage(room.defaultConversationId, "0", null, 100);
    console.log(`\nlistMessage("0", null): ${h2.messages.length} messages`);
    for (const m of h2.messages) {
      console.log(`  [${m.messageId}] by=${m.createdBy} text=${m.content?.text?.substring(0, 50)}`);
    }
  } catch (e) {
    console.log(`listMessage("0") FAILED: ${e.message}`);
  }

  try {
    const h3 = await bot.listMessage(room.defaultConversationId, null, null, 100);
    console.log(`\nlistMessage(null, null): ${h3.messages.length} messages`);
    for (const m of h3.messages) {
      console.log(`  [${m.messageId}] by=${m.createdBy} text=${m.content?.text?.substring(0, 50)}`);
    }
  } catch (e) {
    console.log(`listMessage(null) FAILED: ${e.message}`);
  }

  // Step 6: Test history from USER (simulates browser after refresh)
  console.log('\n--- User retrieves history (simulates refresh) ---');

  // Simulate reconnect: new login
  user.stop();
  const user2 = await getClient('test-user');
  console.log(`User re-logged in. Rooms: ${user2.rooms.map(r => r.roomId).join(', ')}`);

  try {
    const ri = await user2.getRoom(room.roomId, false);
    console.log(`getRoom result: roomId=${ri.roomId}, cid=${ri.defaultConversationId}`);
    
    const h4 = await user2.listMessage(ri.defaultConversationId, "0", null, 100);
    console.log(`User listMessage("0"): ${h4.messages.length} messages`);
    for (const m of h4.messages) {
      console.log(`  [${m.messageId}] by=${m.createdBy} text=${m.content?.text?.substring(0, 50)}`);
    }
  } catch (e) {
    console.log(`User getRoom/listMessage FAILED: ${e.message}`);
  }

  try {
    const h5 = await user2.listRoomMessage(room.roomId, null, null, 100);
    console.log(`\nUser listRoomMessage(null, null): ${h5.messages.length} messages`);
    for (const m of h5.messages) {
      console.log(`  [${m.messageId}] by=${m.createdBy} text=${m.content?.text?.substring(0, 50)}`);
    }
  } catch (e) {
    console.log(`User listRoomMessage FAILED: ${e.message}`);
  }

  // Cleanup
  bot.stop();
  user2.stop();
  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
