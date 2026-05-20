import { InvocationError, WebPubSubClient, WebPubSubClientCredential, WebPubSubClientOptions, WebPubSubDataType } from "@azure/web-pubsub-client";
import { EventEmitter } from "events";
import {
  MessageInfo,
  MessageRangeQuery,
  RoomInfo,
  UserProfile,
  RoomInfoWithMembers,
  Notification,
  NewMessageNotificationBody,
  NewRoomNotificationBody,
  SendMessageResponse,
  ManageRoomMemberRequest,
  MemberJoinedNotificationBody,
  MemberLeftNotificationBody,
  RoomLeftNotificationBody,
} from "./generatedTypes.js";
import type {
  ChatEventListener,
  ChatEventName,
  ChatMessage,
  Disposable,
  MemberJoinedEvent,
  MemberLeftEvent,
  MessageEvent,
  RoomJoinedEvent,
  RoomLeftEvent,
} from "./events.js";

import { ERRORS, INVOCATION_NAME } from "./constant.js";
import { logger } from "./logger.js";
import { isWebPubSubClient } from "./utils.js";

class ChatError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

class ChatClient {
  public readonly connection: WebPubSubClient;

  private readonly _emitter = new EventEmitter();
  private readonly _rooms = new Map<string, RoomInfo>();
  protected _conversationIds = new Set<string>();
  private _userId: string | undefined;
  private _isLoggedIn = false;

  constructor(clientAccessUrl: string, options?: WebPubSubClientOptions);
  constructor(credential: WebPubSubClientCredential, options?: WebPubSubClientOptions);
  constructor(credential: string | WebPubSubClientCredential, options?: WebPubSubClientOptions);
  constructor(wpsClient: WebPubSubClient);

  constructor(arg1: string | WebPubSubClientCredential | WebPubSubClient, options?: WebPubSubClientOptions) {
    if (isWebPubSubClient(arg1)) {
      this.connection = arg1;
    } else {
      this.connection = new WebPubSubClient(arg1 as any, options);
    }
    this.connection.on("group-message", (e) => {
      this._handleNotification(e.message.data as Notification);
    });
    this.connection.on("server-message", (e) => {
      this._handleNotification(e.message.data as Notification);
    });
  }

  private async _handleNotification(data: Notification): Promise<void> {
    logger.info("Received notification:", data);
    try {
      const type = data.notificationType;
      switch (type) {
        case "MessageCreated": {
          const body = data.body as NewMessageNotificationBody;
          const event: MessageEvent = {
            conversationId: body.conversation.conversationId ?? "",
            roomId: body.conversation.roomId ?? undefined,
            message: body.message as ChatMessage,
          };
          this._emitter.emit("message", event);
          break;
        }
        case "RoomJoined": {
          const roomInfo = data.body as NewRoomNotificationBody as RoomInfo;
          // Add to _rooms first so listeners can use listRoomMessage
          this._rooms.set(roomInfo.roomId, roomInfo);
          const event: RoomJoinedEvent = { room: roomInfo };
          this._emitter.emit("roomJoined", event);
          break;
        }
        case "RoomMemberJoined": {
          const body = data.body as MemberJoinedNotificationBody;
          const event: MemberJoinedEvent = { roomId: body.roomId, title: body.title, userId: body.userId };
          this._emitter.emit("memberJoined", event);
          break;
        }
        // someone (not self) left a specific room
        case "RoomMemberLeft": {
          const body = data.body as MemberLeftNotificationBody;
          const event: MemberLeftEvent = { roomId: body.roomId, title: body.title, userId: body.userId };
          this._emitter.emit("memberLeft", event);
          break;
        }
        // self left a specific room
        case "RoomLeft": {
          const body = data.body as RoomLeftNotificationBody;
          if (!this._rooms.has(body.roomId)) {
            break;
          }
          const event: RoomLeftEvent = { roomId: body.roomId, title: body.title };
          this._emitter.emit("roomLeft", event);
          this._rooms.delete(body.roomId);
          break;
        }
        case "MessageUpdated":
        case "MessageDeleted":
        case "RoomClosed":
        case "AddContact":
          logger.warning(`Known notification type ${type} received but not implemented yet.`);
          break;
        default:
          logger.warning(`Unknown notification type received: ${type}`);
      }
    }
    catch (err) {
      logger.error(`Error processing notification, error = ${err}, data: `, data);
    }
  }

  /** Invoke server event and return typed data */
  private async invokeWithReturnType<T>(eventName: string, payload: any, dataType: WebPubSubDataType): Promise<T> {
    logger.verbose(`invoke event: '${eventName}', dataType: ${dataType}, payload:`, payload);
    try {
      const rawResponse = await this.connection.invokeEvent(eventName, payload, dataType);
      logger.verbose(`invoke response for '${eventName}':`, rawResponse);
      const data = rawResponse.data as any;
      if (data && typeof data === "object" && typeof data.code === "string") {
        throw new ChatError(`Invocation of event "${eventName}" failed: ${data.code}`, data.code);
      }
      return data as T;
    } catch (e) {
      if (e instanceof ChatError) throw e;
      if (e instanceof InvocationError && e.errorDetail?.name) {
        throw new ChatError(e.message, e.errorDetail.name);
      }
      throw e;
    }
  }

  /** create a chat client based on an existing WebPubSubClient. */
  public static async login(wpsClient: WebPubSubClient): Promise<ChatClient> {
    const chatClient = new ChatClient(wpsClient);
    return await chatClient.login();
  }

  /** create a chat client based on an existing WebPubSubClient. */
  public async login(): Promise<ChatClient> {
    await this.connection.start();
    const loginResponse = await this.invokeWithReturnType<UserProfile>(INVOCATION_NAME.LOGIN, "", "text");
    logger.info("loginResponse", loginResponse);
    this._userId = loginResponse.userId;
    this._isLoggedIn = true;
    this._conversationIds = new Set(loginResponse.conversationIds || []);
    // Use Promise.all to wait for all room info to be fetched
    const roomInfos = await Promise.all(
      (loginResponse.roomIds || []).map(async (roomId) => {
        const roomInfo = await this.getRoom(roomId, false);
        return { roomId, roomInfo };
      })
    );
    roomInfos.forEach(({ roomId, roomInfo }) => {
      this._rooms.set(roomId, roomInfo);
    });
    return this;
  }

  private ensureLoggedIn(): void {
    if (!this._isLoggedIn) {
      throw new Error("Not logged in. Please call login() first.");
    }
  }

  public async getUserInfo(userId: string): Promise<UserProfile> {
    this.ensureLoggedIn();
    return this.invokeWithReturnType<UserProfile>(INVOCATION_NAME.GET_USER_PROPERTIES, { userId: userId }, "json");
  }

  public async sendToConversation(conversationId: string, message: string): Promise<string> {
    this.ensureLoggedIn();
    const payload = {
      conversation: { conversationId: conversationId },
      content: message,
    };
    const resp = await this.invokeWithReturnType<SendMessageResponse>(INVOCATION_NAME.SEND_TEXT_MESSAGE, payload, "json");
    if (!resp || !resp.id) {
      throw new Error(`Failed to send message to conversation ${conversationId}, got invalid invoke response: ${JSON.stringify(resp)}`);
    }
    const msgId = resp.id;
    const roomId = Array.from(this._rooms.values()).find((r) => r.defaultConversationId === conversationId)?.roomId;
    if (!roomId) {
      logger.warning(`Failed to find roomId for conversationId ${conversationId} when sending message.`);
    }
    // sender won't receive conversation message via notification mechanism, so emit event here
    const event: MessageEvent = {
      conversationId: conversationId,
      roomId: roomId,
      message: {
        messageId: msgId,
        createdBy: this.userId,
        messageBodyType: "Inline",
        content: {
          text: message,
          binary: null,
        },
      } as ChatMessage,
    };
    this._emitter.emit("message", event);
    return msgId;
  }

  public async sendToRoom(roomId: string, message: string): Promise<string> {
    this.ensureLoggedIn();
    const conversationId = this._rooms.get(roomId)?.defaultConversationId;
    if (!conversationId) {
      throw Error(`Failed to sendToRoom, not found roomId ${roomId}`);
    }
    return await this.sendToConversation(conversationId, message);
  }

  public async getRoom(roomId: string, withMembers: boolean): Promise<RoomInfoWithMembers> {
    this.ensureLoggedIn();
    return this.invokeWithReturnType<RoomInfoWithMembers>(INVOCATION_NAME.GET_ROOM, { id: roomId, withMembers: withMembers }, "json");
  }

  /** Create a room and its initial members. If `roomId` is not set, the service will create a random one. */
  public async createRoom(title: string, members: string[], roomId?: string): Promise<RoomInfoWithMembers> {
    this.ensureLoggedIn();
    let roomDetails = {
      title: title,
      members: [...new Set([...members, this.userId])], // deduplicate and add self
    } as any;
    if (roomId) {
      roomDetails = { ...roomDetails, roomId: roomId };
    }
    const roomInfo = await this.invokeWithReturnType<RoomInfoWithMembers>(INVOCATION_NAME.CREATE_ROOM, roomDetails, "json");
    this._rooms.set(roomInfo.roomId, roomInfo);
    const event: RoomJoinedEvent = { room: roomInfo };
    this._emitter.emit("roomJoined", event);
    return roomInfo;
  }

  private async manageRoomMember(request: ManageRoomMemberRequest): Promise<void> {
    await this.invokeWithReturnType<any>(INVOCATION_NAME.MANAGE_ROOM_MEMBER, request, "json");
  }

  private async ensureRoomCached(roomId: string): Promise<void> {
    if (this._rooms.has(roomId)) {
      return;
    }
    const roomInfo = await this.getRoom(roomId, false);
    this._rooms.set(roomId, roomInfo);
  }

  /** Add a user to a room. This is an admin operation where one user adds another user to a room. */
  public async addUserToRoom(roomId: string, userId: string): Promise<void> {
    this.ensureLoggedIn();
    const payload: ManageRoomMemberRequest = { roomId: roomId, operation: "Add", userId: userId };
    const isSelf = userId === this.userId;
    // If self-add succeeds but no RoomJoined notification arrives, fetch room info
    // from the service so sendToRoom can use its conversation id.
    const shouldCacheRoomAfterSelfAdd = isSelf && !this._rooms.has(roomId);
    try {
      await this.manageRoomMember(payload);
    } catch (error) {
      if (!isSelf || !(error instanceof ChatError && error.code === ERRORS.USER_ALREADY_IN_ROOM)) {
        throw error;
      }
    }
    if (shouldCacheRoomAfterSelfAdd) {
      await this.ensureRoomCached(roomId);
    }
  }

  /** Remove a user from a room. This is an admin operation where one user removes another user from a room. */
  public async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    this.ensureLoggedIn();
    const payload: ManageRoomMemberRequest = { roomId: roomId, operation: "Delete", userId: userId };
    await this.manageRoomMember(payload);
    // RoomLeft notification is not guaranteed for server-managed membership;
    // eagerly clean up local cache and emit RoomLeft so callers see consistent state immediately.
    if (userId === this.userId) {
      const roomInfo = this._rooms.get(roomId);
      if (roomInfo) {
        this._rooms.delete(roomId);
        const event: RoomLeftEvent = { roomId, title: roomInfo.title };
        this._emitter.emit("roomLeft", event);
      }
    }
  }

  /** List messages in a conversation. It returns messages and a query for the next query parameter. */
  public async listMessage(conversationId: string, startId: string | null, endId: string | null, maxCount: number = 100): Promise<{ messages: MessageInfo[]; nextQuery: MessageRangeQuery }> {
    this.ensureLoggedIn();
    const query: MessageRangeQuery = {
      conversation: { conversationId: conversationId },
      start: startId,
      end: endId,
      maxCount: maxCount,
    };
    const result = await this.invokeWithReturnType<{ messages: MessageInfo[]; nextQuery: MessageRangeQuery }>(INVOCATION_NAME.LIST_MESSAGES, query, "json");
    return result;
  }

  /** List messages in a room. It returns messages and a query for the next query parameter. */
  public async listRoomMessage(roomId: string, startId: string | null, endId: string | null, maxCount: number = 100): Promise<{ messages: MessageInfo[]; nextQuery: MessageRangeQuery }> {
    this.ensureLoggedIn();
    const conversationId = this._rooms.get(roomId)?.defaultConversationId;
    if (!conversationId) {
      throw Error(`Failed to listRoomMessage, not found roomId ${roomId}`);
    }
    const query: MessageRangeQuery = {
      conversation: { conversationId: conversationId },
      start: startId,
      end: endId,
      maxCount: maxCount,
    };
    const result = await this.invokeWithReturnType<{ messages: MessageInfo[]; nextQuery: MessageRangeQuery }>(INVOCATION_NAME.LIST_MESSAGES, query, "json");
    return result;
  }

  /** Cached rooms known to the client. */
  public get rooms(): RoomInfo[] {
    return Array.from(this._rooms.values());
  }

  /** Whether the current client has the room in its local joined-room cache. */
  public hasJoinedRoom(roomId: string): boolean {
    return this._rooms.has(roomId);
  }

  public get userId(): string {
    if (!this._userId) {
      throw new Error("User ID is not set. Please login first.");
    }
    return this._userId;
  }

  /**
   * Subscribe to a chat client event. Returns a disposer that removes the
   * listener when called.
   *
   * Connection-lifecycle events (`connected`, `disconnected`, `stopped`)
   * are not exposed here — subscribe via
   * `chatClient.connection.on("connected", ...)` etc.
   *
   * @example
   * const dispose = client.on("message", (e) => console.log(e.message.content.text));
   * // later
   * dispose();
   */
  public on<K extends ChatEventName>(event: K, callback: ChatEventListener<K>): Disposable {
    this._emitter.on(event, callback as any);
    return () => this._emitter.off(event, callback as any);
  }

  /** Remove a listener previously registered with {@link on}. */
  public off<K extends ChatEventName>(event: K, callback: ChatEventListener<K>): void {
    this._emitter.off(event, callback as any);
  }

  /** Subscribe to new messages (including the sender-side event emitted by `sendToRoom` / `sendToConversation`). */
  public onMessage(callback: ChatEventListener<"message">): Disposable {
    return this.on("message", callback);
  }

  /** Subscribe to room-join events for this client (created or invited). */
  public onRoomJoined(callback: ChatEventListener<"roomJoined">): Disposable {
    return this.on("roomJoined", callback);
  }

  /** Subscribe to events where this client leaves a room. */
  public onRoomLeft(callback: ChatEventListener<"roomLeft">): Disposable {
    return this.on("roomLeft", callback);
  }

  /** Subscribe to events where another user joins a room this client is in. */
  public onMemberJoined(callback: ChatEventListener<"memberJoined">): Disposable {
    return this.on("memberJoined", callback);
  }

  /** Subscribe to events where another user leaves a room this client is in. */
  public onMemberLeft(callback: ChatEventListener<"memberLeft">): Disposable {
    return this.on("memberLeft", callback);
  }

  public stop = (): void => {
    this.connection.stop();
  };
}

export { ChatClient, ChatError };
