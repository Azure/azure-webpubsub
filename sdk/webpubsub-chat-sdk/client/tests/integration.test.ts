import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { ChatClient } from "../src/chatClient.js";

const negotiateUrl = "http://localhost:3000/negotiate";

async function createTestClient(userId?: string) {
  const wpsClient = new WebPubSubClient({
    getClientAccessUrl: async () => {
      const res = await fetch(negotiateUrl + (userId ? `?userId=${encodeURIComponent(userId)}` : ""));
      const value = (await res.json()) as { url?: string };
      if (!value?.url) throw new Error("Failed to get negotiate url");
      return value.url;
    },
  });
  return await ChatClient.login(wpsClient);
}

test("same user id login twice", { timeout: 500_000 }, async (t) => {
  try {
    const chat0 = await createTestClient();

    // first login
    let chat1 = await createTestClient("bob");
    let messageReceived = 0;
    chat1.addListenerForNewMessage((notification) => {
      messageReceived++;
    });
    assert.equal(chat1.userId, "bob", "chat1 userId should be 'bob'");

    const roomName = `room-${Math.floor(Math.random() * 10000)}`;
    const userId = `user-${Math.floor(Math.random() * 10000)}`;
    const createdRoom = await chat0.createRoom(roomName, [userId], `uid_${roomName}`);
    await chat0.sendToRoom(createdRoom.RoomId, `Hello from chat0`);
    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(messageReceived, 1, `chat1 should receive 1 message at first login`);

    chat1.stop();

    // second login with same userId
    chat1 = await createTestClient(userId); // login again with same userId
    messageReceived = 0;
    chat1.addListenerForNewMessage((notification) => {
      messageReceived++;
    });
    assert.equal(chat1.userId, userId, `chat1 userId should still be '${userId}' after re-login`);

    const sentMsgId = await chat0.sendToRoom(createdRoom.RoomId, `Hello from chat0`);

    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log(messageReceived);
    assert.equal(messageReceived, 1, `chat1 should receive 1 message at second login`);
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  }
});

test("single client", { timeout: 3_000 }, async (t) => {
  try {
    const chat1 = await createTestClient();

    assert.ok(chat1.userId && typeof chat1.userId === "string");

    const roomId = `room-id-${randomUUID().substring(0, 3)}`;
    const created = await chat1.createRoom("ut-single-room", [], roomId);
    assert.equal(created.RoomId, roomId, "roomId should match");
    assert.equal(created.Title, "ut-single-room", "room title should match");
    assert.ok(Array.isArray(created.Members), "members should be an array");
    assert.deepEqual(created.Members, [chat1.userId], "members should contain only the creator");
    assert.ok(created.Members.includes(chat1.userId), "members should include the creator");

    const fetched = await chat1.getRoom(created.RoomId, true);
    assert.equal(fetched.RoomId, created.RoomId, "fetched roomId should match created");
    assert.equal(fetched.Title, created.Title, "fetched title should match created");
    assert.ok(Array.isArray(fetched.Members), "fetched members should be an array");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  }
});

test("create room with multiple users", { timeout: 3_000 }, async (t) => {
  try {
    const chats = await Promise.all([createTestClient(), createTestClient(), createTestClient()]);

    var joinedRoomCounts = [0, 0, 0],
      receivedMsgCounts = [0, 0, 0];

    for (let i = 0; i < 3; i++) {
      chats[i].addListenerForNewRoom((room) => {
        joinedRoomCounts[i]++;
      });
      chats[i].addListenerForNewMessage((message) => {
        receivedMsgCounts[i]++;
      });
    }

    const createdRoom = await chats[0].createRoom("test-room", [chats[1].userId, chats[2].userId]);

    for (let i = 1; i <= 5; i++) {
      const msgId = await chats[0].sendToRoom(createdRoom.RoomId, `HelloMessage,#${i}`);
      assert.equal(msgId, i.toString(), `sent message id should be ${i} but got ${msgId}`);
    }

    const listedMsgs = await chats[0].listMessage(createdRoom.DefaultConversationId, "0", null);
    let listedMsgCount = 0;
    for (const message of listedMsgs.Messages) {
      assert.equal(message.MessageId, (5 - listedMsgCount).toString(), `message id should match expected order, expect ${5 - listedMsgCount} but got ${message.MessageId}`);
      assert.equal(message.Body, `HelloMessage,#${5 - listedMsgCount}`, `message body should match expected content, expect 'HelloMessage,#${5 - listedMsgCount}' but got '${message.Body}'`);
      listedMsgCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 100)); // wait for events
    assert.equal(listedMsgCount, 5, "should list 5 messages");
    assert.deepEqual(joinedRoomCounts, [1, 1, 1], "chat2 should receive new room event");
    assert.deepEqual(receivedMsgCounts, [5, 5, 5], "chat2 should receive 5 new messages");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  }
});

test("multiple user join a group", { timeout: 5_000 }, async (t) => {
  try {
    const chats = await Promise.all([createTestClient(), createTestClient(), createTestClient()]);
    const createdRoom = await chats[0].createRoom("ut-room", []);
    for (let i = 1; i < chats.length; i++) {
      const joinedRoom = await chats[i].joinRoom(createdRoom.RoomId);
      assert.equal(joinedRoom.RoomId, createdRoom.RoomId, `chat${i} joined roomId should match created`);
    }

    let messageReceivedCounts = new Array(chats.length).fill(0);

    chats.forEach((chat, index) => {
      chat.addListenerForNewMessage((notification) => {
        console.log(`Client ${index} received message:`, notification.Message.Body);
        messageReceivedCounts[index]++;
      });
    });

    // client 0..n-1 send message, should be received by all others
    for (let i = 1; i < chats.length; i++) {
      const sentMsgId = await chats[i].sendToRoom(createdRoom.RoomId, `Hello from chat${i}`);
      assert.equal(sentMsgId, i.toString(), `sent message id should be ${i} but got ${sentMsgId}`);
    }

    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (let i = 1; i < chats.length; i++) {
      assert.equal(messageReceivedCounts[i], chats.length - 1, `chat${i} should receive ${chats.length - 1} messages`);
    }
    assert.equal(messageReceivedCounts[0], chats.length - 1, `creator should receive ${chats.length - 1} messages`);

    // client 0 send message
    const finalMsgId = await chats[0].sendToRoom(createdRoom.RoomId, "final message");
    assert.equal(finalMsgId, chats.length.toString(), `sent message id should be ${chats.length} but got ${finalMsgId}`);

    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (let i = 1; i < chats.length; i++) {
      assert.equal(messageReceivedCounts[i], chats.length, `chat${i} should receive ${chats.length} messages`);
    }
    assert.equal(messageReceivedCounts[0], chats.length, `creator should receive ${chats.length} messages`);
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  }
});
