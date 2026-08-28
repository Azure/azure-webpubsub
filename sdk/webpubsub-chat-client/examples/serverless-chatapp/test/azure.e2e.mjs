import assert from "node:assert/strict";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { ChatClient } from "@azure/web-pubsub-chat-client";

const connectionString = process.env.WebPubSubConnectionString;
const hubName = process.env.WebPubSubHub || "chat_client_demo";
if (!connectionString) throw new Error("Set WebPubSubConnectionString to run the Azure test.");

const serviceClient = new WebPubSubServiceClient(connectionString, hubName);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const aliceId = `functions-alice-${suffix}`;
const bobId = `functions-bob-${suffix}`;
const accessUrl = async (userId) => (await serviceClient.getClientAccessToken({ userId })).url;
const clients = [];

try {
  const alice = await ChatClient.start({ getClientAccessUrl: () => accessUrl(aliceId) });
  const bob = await ChatClient.start({ getClientAccessUrl: () => accessUrl(bobId) });
  clients.push(alice, bob);

  const joined = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Bob didn't receive room-joined.")), 15000);
    bob.on("room-joined", ({ room: joinedRoom }) => { clearTimeout(timeout); resolve(joinedRoom); });
  });
  const room = await alice.createRoom(`Functions E2E ${suffix}`, [bob.userId]);
  assert.equal((await joined).roomId, room.roomId);

  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Bob didn't receive the message.")), 15000);
    bob.on("message", ({ message }) => { clearTimeout(timeout); resolve(message); });
  });
  const text = `serverless-${suffix}`;
  await alice.sendToRoom(room.roomId, text);
  assert.equal((await received).content.text, text);

  const replyReceived = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Alice didn't receive Bob's reply.")), 15000);
    alice.on("message", ({ message }) => { clearTimeout(timeout); resolve(message); });
  });
  const reply = `serverless-reply-${suffix}`;
  await bob.sendToRoom(room.roomId, reply);
  assert.equal((await replyReceived).content.text, reply);

  const history = [];
  for await (const message of bob.listRoomMessages(room.roomId)) history.push(message);
  assert.ok(history.some((message) => message.content.text === text));
  assert.ok(history.some((message) => message.content.text === reply));
  console.log(JSON.stringify({ hubName, roomId: room.roomId, aliceId, bobId, historyCount: history.length }));
} finally {
  await Promise.allSettled(clients.map((client) => client.stop()));
}
