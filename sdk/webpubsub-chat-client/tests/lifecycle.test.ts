import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { WebPubSubClient, WebPubSubDataType } from "@azure/web-pubsub-client";
import { ChatClient } from "../src/chatClient.js";
import { INVOCATION_NAME } from "../src/constant.js";
import type { RoomInfoWithMembers, UserProfile } from "../src/generatedTypes.js";

/**
 * `_isStarted` is private; accessor used by tests to assert the post-login
 * state-machine flag without re-exposing it on the public surface.
 */
const isStarted = (client: ChatClient): boolean =>
  (client as unknown as { _isStarted: boolean })._isStarted;

class Deferred<T> {
  public promise: Promise<T>;
  public resolve!: (value: T | PromiseLike<T>) => void;
  public reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakeWebPubSubClient {
  public startCalls = 0;
  public stopCalls = 0;
  public loginResponse: UserProfile = { userId: "alice", roomIds: [], conversationIds: [] };
  public roomResponses = new Map<string, RoomInfoWithMembers>();
  public getRoomStarted?: Deferred<void>;
  public getRoomDelay?: Deferred<void>;
  public getRoomError?: Error;
  public stopDelay?: Deferred<void>;

  private readonly emitter = new EventEmitter();
  private connectionStopped = true;
  private stopping = false;

  public async start(): Promise<void> {
    if (this.stopping) {
      throw new Error("Cannot start while stopping");
    }
    this.startCalls += 1;
    this.connectionStopped = false;
  }

  public stop(): void {
    this.stopCalls += 1;
    if (this.connectionStopped || this.stopping) {
      return;
    }

    this.stopping = true;
    if (this.stopDelay) {
      void this.stopDelay.promise.then(() => this.emitStopped());
    } else {
      queueMicrotask(() => this.emitStopped());
    }
  }

  public on(event: string, listener: (args: any) => void): void {
    this.emitter.on(event, listener);
  }

  public off(event: string, listener: (args: any) => void): void {
    this.emitter.off(event, listener);
  }

  public async invokeEvent(eventName: string, payload: any, dataType: WebPubSubDataType): Promise<{ data: unknown }> {
    void dataType;
    if (eventName === INVOCATION_NAME.LOGIN) {
      return { data: this.loginResponse };
    }

    if (eventName === INVOCATION_NAME.GET_ROOM) {
      this.getRoomStarted?.resolve();
      if (this.getRoomDelay) {
        await this.getRoomDelay.promise;
      }
      if (this.getRoomError) {
        throw this.getRoomError;
      }

      const roomId = payload.id as string;
      const roomInfo = this.roomResponses.get(roomId) ?? {
        roomId,
        title: roomId,
        defaultConversationId: `conversation-${roomId}`,
        members: [],
      };
      return { data: roomInfo };
    }

    throw new Error(`Unexpected invocation: ${eventName}`);
  }

  public emitRoomJoined(roomId: string): void {
    this.emitter.emit("group-message", {
      message: {
        data: {
          notificationType: "RoomJoined",
          body: {
            roomId,
            title: roomId,
            defaultConversationId: `conversation-${roomId}`,
            notificationType: "RoomJoined",
          },
        },
      },
    });
  }

  private emitStopped(): void {
    this.stopping = false;
    this.connectionStopped = true;
    this.emitter.emit("stopped", {});
  }
}

function createClient(fakeClient: FakeWebPubSubClient): ChatClient {
  return new ChatClient(fakeClient as unknown as WebPubSubClient);
}

test("stop before start is a no-op", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);

  await client.stop();

  assert.equal(isStarted(client), false);
  assert.equal(fakeClient.stopCalls, 0);
});

test("concurrent start calls wait for room hydration", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = {
    userId: "alice",
    roomIds: ["room1"],
    conversationIds: ["conversation-room1"],
  };
  fakeClient.getRoomStarted = new Deferred<void>();
  fakeClient.getRoomDelay = new Deferred<void>();
  const client = createClient(fakeClient);

  const firstStart = client.start();
  await fakeClient.getRoomStarted.promise;

  let secondStartResolved = false;
  const secondStart = client.start().then(() => {
    secondStartResolved = true;
  });
  await Promise.resolve();

  assert.equal(isStarted(client), false, "client should not be marked started until room hydration completes");
  assert.equal(secondStartResolved, false, "second start should wait for the in-flight start promise");

  fakeClient.getRoomDelay.resolve();
  await Promise.all([firstStart, secondStart]);

  assert.equal(isStarted(client), true);
  assert.deepEqual(client.rooms.map((roomInfo) => roomInfo.roomId), ["room1"]);
  assert.equal(fakeClient.startCalls, 1);
});

test("failed start rolls back chat state and stops the connection", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = { userId: "alice", roomIds: ["room1"], conversationIds: [] };
  fakeClient.getRoomError = new Error("get room failed");
  const client = createClient(fakeClient);

  await assert.rejects(client.start(), /get room failed/);

  assert.equal(isStarted(client), false);
  assert.throws(() => client.userId, /start\(\)/);
  assert.deepEqual(client.rooms, []);
  assert.equal(fakeClient.stopCalls, 1);
});

test("stop waits for stopped event before allowing restart", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.stopDelay = new Deferred<void>();
  const client = createClient(fakeClient);
  await client.start();

  let stopResolved = false;
  const stopPromise = client.stop().then(() => {
    stopResolved = true;
  });
  const restartPromise = client.start();
  await Promise.resolve();

  fakeClient.emitRoomJoined("late-room");
  assert.equal(client.hasJoinedRoom("late-room"), false, "late notifications after stop starts should be ignored");
  assert.equal(stopResolved, false, "stop should not resolve before the underlying stopped event");
  assert.equal(fakeClient.startCalls, 1, "restart should wait for stop to finish");

  fakeClient.stopDelay.resolve();
  await Promise.all([stopPromise, restartPromise]);

  assert.equal(stopResolved, true);
  assert.equal(isStarted(client), true);
  assert.equal(fakeClient.startCalls, 2);
  assert.equal(fakeClient.stopCalls, 1);
});

test("concurrent stop calls wait for the same stopped event", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.stopDelay = new Deferred<void>();
  const client = createClient(fakeClient);
  await client.start();

  let firstStopResolved = false;
  let secondStopResolved = false;
  const firstStop = client.stop().then(() => {
    firstStopResolved = true;
  });
  const secondStop = client.stop().then(() => {
    secondStopResolved = true;
  });
  await Promise.resolve();

  assert.equal(fakeClient.stopCalls, 1);
  assert.equal(firstStopResolved, false);
  assert.equal(secondStopResolved, false);

  fakeClient.stopDelay.resolve();
  await Promise.all([firstStop, secondStop]);

  assert.equal(firstStopResolved, true);
  assert.equal(secondStopResolved, true);
  assert.equal(isStarted(client), false);
});

test("concurrent start calls during stop share a single restart", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.stopDelay = new Deferred<void>();
  const client = createClient(fakeClient);
  await client.start();
  assert.equal(fakeClient.startCalls, 1);

  const stopPromise = client.stop();
  // Both restart attempts should wait for the same stop and share one new start.
  const firstRestart = client.start();
  const secondRestart = client.start();
  await Promise.resolve();

  assert.equal(fakeClient.startCalls, 1, "no new connection start until stop completes");

  fakeClient.stopDelay.resolve();
  await Promise.all([stopPromise, firstRestart, secondRestart]);

  assert.equal(isStarted(client), true);
  assert.equal(fakeClient.startCalls, 2, "restart should call connection.start() exactly once");
  assert.equal(fakeClient.stopCalls, 1);
});