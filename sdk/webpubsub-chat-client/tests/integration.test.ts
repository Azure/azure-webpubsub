import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ChatClient, ChatError } from "../src/chatClient.js";
import type { MessageInfo } from "../src/generatedTypes.js";
import {
  SHORT_TEST_TIMEOUT,
  LONG_TEST_TIMEOUT,
  createTestClient,
  getMultipleClients,
  stopClients,
  forceExitAfterTests,
} from "./testUtils.js";

async function waitForCondition(predicate: () => boolean, description: string, timeoutMs: number = SHORT_TEST_TIMEOUT): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for ${description}`);
}

test("same user id start twice", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let chat0, chat1;
  try {
    chat0 = await createTestClient();

    // first start
    chat1 = await createTestClient();
    const chat1UserId = chat1.userId;
    let messageReceived = 0;
    chat1.onMessage((notification) => {
      messageReceived++;
    });
    assert.equal(chat1.userId, chat1UserId, `chat1 userId should be '${chat1UserId}'`);

    const roomName = `room-${Math.floor(Math.random() * 10000)}`;
    const createdRoom = await chat0.createRoom(roomName, [chat1.userId], { roomId: `uid_${roomName}` });
    await chat0.sendToRoom(createdRoom.roomId, `Hello from chat0`);
    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(messageReceived, 1, `chat1 should receive 1 message after first start`);

    await chat1.stop();

    // second start with same userId
    chat1 = await createTestClient(chat1UserId);
    messageReceived = 0;
    chat1.onMessage((notification) => {
      messageReceived++;
    });
    assert.equal(chat1.userId, chat1UserId, `chat1 userId should still be '${chat1UserId}' after restart`);

    const sentMsgId = await chat0.sendToRoom(createdRoom.roomId, `Hello from chat0`);

    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(messageReceived, 1, `chat1 should receive 1 message after second start`);
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    const clientsToStop = [chat0, chat1].filter(Boolean) as ChatClient[];
    await stopClients(clientsToStop);
  }
});

test("same user on two clients still receives remote room messages", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let admin, sender, watcher;
  try {
    const sharedUserId = `shared-${randomUUID().substring(0, 6)}`;
    admin = await createTestClient();

    const roomId = `room-shared-${randomUUID().substring(0, 6)}`;
    const createdRoom = await admin.createRoom("ut-shared-room", [sharedUserId], { roomId });

    sender = await createTestClient(sharedUserId);
    watcher = await createTestClient(sharedUserId);

    assert.equal(sender.hasJoinedRoom(createdRoom.roomId), true, "sender should load the shared room on start");
    assert.equal(watcher.hasJoinedRoom(createdRoom.roomId), true, "watcher should load the shared room on start");

    const senderNotifications: any[] = [];
    const watcherNotifications: any[] = [];
    sender.onMessage((notification) => {
      senderNotifications.push(notification);
    });
    watcher.onMessage((notification) => {
      watcherNotifications.push(notification);
    });

    const sentMsgId = await sender.sendToRoom(createdRoom.roomId, "Hello from sender");

    await waitForCondition(
      () => senderNotifications.some((notification) => notification.message.messageId === sentMsgId),
      "sender synthetic message",
    );
    await waitForCondition(
      () => watcherNotifications.some((notification) => notification.message.messageId === sentMsgId),
      "same-user watcher remote message",
      LONG_TEST_TIMEOUT,
    );

    const senderCopies = senderNotifications.filter(
      (notification) => notification.message.messageId === sentMsgId,
    );
    const watcherCopies = watcherNotifications.filter(
      (notification) => notification.message.messageId === sentMsgId,
    );

    assert.equal(senderCopies.length, 1, "sender should emit exactly one synthetic message event");
    assert.equal(watcherCopies.length, 1, "same-user watcher should receive exactly one remote room message");
    assert.equal(watcherCopies[0].message.createdBy, sharedUserId, "watcher should still see the shared user as message creator");
    assert.equal(watcherCopies[0].message.content.text, "Hello from sender", "watcher should receive the sender text");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    const clientsToStop = [admin, sender, watcher].filter(Boolean) as ChatClient[];
    await stopClients(clientsToStop);
  }
});

test("single client", { timeout: SHORT_TEST_TIMEOUT }, async (t) => {
  let chat1;
  try {
    chat1 = await createTestClient();

    assert.ok(chat1.userId && typeof chat1.userId === "string");

    const roomId = `room-id-${randomUUID().substring(0, 3)}`;
    const created = await chat1.createRoom("ut-single-room", [], { roomId });
    assert.equal(created.roomId, roomId, "roomId should match");
    assert.equal(created.title, "ut-single-room", "room title should match");
    assert.ok(Array.isArray(created.members), "members should be an array");
    assert.deepEqual(created.members, [chat1.userId], "members should contain only the creator");
    assert.ok(created.members.includes(chat1.userId), "members should include the creator");

    const fetched = await chat1.getRoom(created.roomId, { withMembers: true });
    assert.equal(fetched.roomId, created.roomId, "fetched roomId should match created");
    assert.equal(fetched.title, created.title, "fetched title should match created");
    assert.ok(Array.isArray(fetched.members), "fetched members should be an array");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    if (chat1) await stopClients([chat1]);
  }
});

test("create room with multiple users", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let chats;
  try {
    chats = await getMultipleClients(3);

    var joinedRoomCounts = [0, 0, 0],
      receivedMsgCounts = [0, 0, 0];

    for (let i = 0; i < 3; i++) {
      chats[i].onRoomJoined((event) => {
        joinedRoomCounts[i]++;
      });
      chats[i].onMessage((message) => {
        receivedMsgCounts[i]++;
      });
    }

    const createdRoom = await chats[0].createRoom("test-room", [chats[1].userId, chats[2].userId]);

    for (let i = 1; i <= 5; i++) {
      const msgId: string = await chats[0].sendToRoom(createdRoom.roomId, `HelloMessage,#${i}`);
      assert.equal(msgId, i.toString(), `sent message id should be ${i} but got ${msgId}`);
    }

    const listedMsgs: MessageInfo[] = [];
    for await (const message of chats[0].listRoomMessages({ roomId: createdRoom.roomId, startId: "0", maxPageSize: 100 })) {
      listedMsgs.push(message);
    }
    let listedMsgCount = 0;
    for (const message of listedMsgs) {
      assert.equal(message.messageId, (5 - listedMsgCount).toString(), `message id should match expected order, expect ${5 - listedMsgCount} but got ${message.messageId}`);
      assert.equal(message.content.text, `HelloMessage,#${5 - listedMsgCount}`, `message body should match expected content, expect 'HelloMessage,#${5 - listedMsgCount}' but got '${message.content.text}'`);
      listedMsgCount++;
    }

    // Verify .byPage() yields explicit pages bounded by maxPageSize. With
    // 5 messages and maxPageSize=2 we expect pages of size [2, 2, 1] (or
    // possibly with a trailing empty page that the iterator filters out).
    const pagesIter = chats[0]
      .listRoomMessages({ roomId: createdRoom.roomId, startId: "0" })
      .byPage({ maxPageSize: 2 });
    const collectedPages: MessageInfo[][] = [];
    while (true) {
      const { value, done } = await pagesIter.next();
      if (done) break;
      collectedPages.push(value);
    }
    const flatFromPages = collectedPages.flat();
    assert.equal(flatFromPages.length, 5, `byPage should yield 5 total messages across pages, got ${flatFromPages.length}`);
    for (const page of collectedPages) {
      assert.ok(page.length <= 2, `each page should respect maxPageSize=2, got page of size ${page.length}`);
    }
    assert.ok(collectedPages.length >= 2, `byPage with maxPageSize=2 over 5 messages should yield multiple pages, got ${collectedPages.length}`);
    for (let i = 0; i < 5; i++) {
      assert.equal(flatFromPages[i].messageId, (5 - i).toString(), `byPage flat order should match latest-first; index ${i} expected ${5 - i}, got ${flatFromPages[i].messageId}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100)); // wait for events
    assert.equal(listedMsgCount, 5, "should list 5 messages");
    assert.deepEqual(joinedRoomCounts, [1, 1, 1], "chat2 should receive new room event");
    assert.deepEqual(receivedMsgCounts, [5, 5, 5], "chat2 should receive 5 new messages");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    if (chats && Array.isArray(chats)) {
      await stopClients(chats);
    }
  }
});

test("admin adds multiple users to a group", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let chats;
  try {
    chats = await getMultipleClients(3);
    const createdRoom = await chats[0].createRoom("ut-room", []);
    // Admin (chats[0]) adds other users to the room
    for (let i = 1; i < chats.length; i++) {
      await chats[0].addUserToRoom(createdRoom.roomId, chats[i].userId);
    }

    let messageReceivedCounts = new Array(chats.length).fill(0);

    chats.forEach((chat, index) => {
      chat.onMessage((notification) => {
        messageReceivedCounts[index]++;
      });
    });


    // client 0..n-1 send message, should be received by all others
    for (let i = 1; i < chats.length; i++) {
      const sentMsgId = await chats[i].sendToRoom(createdRoom.roomId, `Hello from chat${i}`);
      assert.equal(sentMsgId, i.toString(), `sent message id should be ${i} but got ${sentMsgId}`);
    }

    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (let i = 1; i < chats.length; i++) {
      assert.equal(messageReceivedCounts[i], chats.length - 1, `chat${i} should receive ${chats.length - 1} messages`);
    }
    assert.equal(messageReceivedCounts[0], chats.length - 1, `creator should receive ${chats.length - 1} messages`);

    // client 0 send message
    const finalMsgId = await chats[0].sendToRoom(createdRoom.roomId, "final message");
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
  } finally {
    if (chats && Array.isArray(chats)) {
      await stopClients(chats);
    }
  }
});

test("self remove updates local room cache immediately", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let chat1;
  try {
    chat1 = await createTestClient();

    const roomId = `room-leave-${randomUUID().substring(0, 6)}`;
    const created = await chat1.createRoom("ut-self-leave", [], { roomId });
    assert.equal(chat1.hasJoinedRoom(created.roomId), true, "room should be cached after creation");

    await chat1.removeUserFromRoom(created.roomId, chat1.userId);

    assert.equal(chat1.hasJoinedRoom(created.roomId), false, "room should be removed from local cache immediately after self removal");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    if (chat1) await stopClients([chat1]);
  }
});

test("self add restores local room cache without RoomJoined event", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let chat1;
  try {
    chat1 = await createTestClient();

    const roomId = `room-self-add-${randomUUID().substring(0, 6)}`;
    const created = await chat1.createRoom("ut-self-add", [], { roomId });
    assert.equal(chat1.hasJoinedRoom(created.roomId), true, "room should be cached after creation");

    let roomJoinedEvents = 0;
    chat1.onRoomJoined((event) => {
      if (event.room.roomId === created.roomId) {
        roomJoinedEvents += 1;
      }
    });

    (chat1 as any)._rooms.delete(created.roomId);
    assert.equal(chat1.hasJoinedRoom(created.roomId), false, "test should start with an empty local room cache");

    await chat1.addUserToRoom(created.roomId, chat1.userId);

    assert.equal(chat1.hasJoinedRoom(created.roomId), true, "self add should restore the missing local room cache entry");
    assert.equal(roomJoinedEvents, 0, "self cache restore should not emit a synthetic RoomJoined event");
    const sentMsgId = await chat1.sendToRoom(created.roomId, "self-add-cache-restored");
    assert.ok(sentMsgId, "sendToRoom should succeed after the cache is restored");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    if (chat1) await stopClients([chat1]);
  }
});

test("adding non-self user already in room throws ChatError with UserAlreadyInRoom code", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let admin, user1;
  try {
    admin = await createTestClient();
    user1 = await createTestClient();

    const roomId = `room-dup-add-${randomUUID().substring(0, 6)}`;
    await admin.createRoom("ut-dup-add", [user1.userId], { roomId });

    // Second add of the same non-self user must throw a ChatError wrapping the server's UserAlreadyInRoom code.
    let thrown: unknown;
    try {
      await admin.addUserToRoom(roomId, user1.userId);
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown instanceof ChatError, `expected ChatError, got ${thrown}`);
    assert.equal((thrown as ChatError).code, "UserAlreadyInRoom", "error code should be UserAlreadyInRoom");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    const clientsToStop = [admin, user1].filter(Boolean) as ChatClient[];
    await stopClients(clientsToStop);
  }
});

test("removing non-member user throws ChatError with UserNotInRoom code", { timeout: LONG_TEST_TIMEOUT }, async (t) => {
  let admin, stranger;
  try {
    admin = await createTestClient();
    stranger = await createTestClient();

    const roomId = `room-rm-nonmember-${randomUUID().substring(0, 6)}`;
    await admin.createRoom("ut-rm-nonmember", [], { roomId });

    let thrown: unknown;
    try {
      await admin.removeUserFromRoom(roomId, stranger.userId);
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown instanceof ChatError, `expected ChatError, got ${thrown}`);
    assert.equal((thrown as ChatError).code, "UserNotInRoom", "error code should be UserNotInRoom");
  } catch (e) {
    t.diagnostic((e as any).toString());
    throw e;
  } finally {
    const clientsToStop = [admin, stranger].filter(Boolean) as ChatClient[];
    await stopClients(clientsToStop);
  }
});

// Force exit after all tests to avoid hanging on open connections
after(() => {
  forceExitAfterTests();
});
