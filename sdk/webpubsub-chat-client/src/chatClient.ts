import { OnConnectedArgs, OnDisconnectedArgs, OnStoppedArgs, WebPubSubClient, WebPubSubClientCredential, WebPubSubClientOptions, WebPubSubDataType } from "@azure/web-pubsub-client";
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
  NotificationType,
  MemberLeftNotificationBody,
  RoomLeftNotificationBody,
} from "./generatedTypes.js";
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
  private readonly _joinedRoomIds = new Set<string>();
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
        case "MessageCreated":
          const notificationBody = data.body as NewMessageNotificationBody;
          this._emitter.emit(type, notificationBody);
          break;
        case "RoomJoined":
          const roomInfo = data.body as NewRoomNotificationBody as RoomInfo;
          this._rooms.set(roomInfo.roomId, roomInfo);  // Add to _rooms first so listeners can use listRoomMessage
          this._joinedRoomIds.add(roomInfo.roomId);
          this._emitter.emit(type, roomInfo);
          break;
        case "RoomMemberJoined":
          const memberJoinedInfo = data.body as MemberJoinedNotificationBody;
          this._emitter.emit(type, memberJoinedInfo);
          break;
        // someone (not self) left a specific room
        case "RoomMemberLeft":
          const memberLeftInfo = data.body as MemberLeftNotificationBody;
          this._emitter.emit(type, memberLeftInfo);
          break;
        // self left a specific room
        case "RoomLeft":
          const roomLeftInfo = data.body as RoomLeftNotificationBody;
          if (!this._rooms.has(roomLeftInfo.roomId)) {
            break;
          }
          this._emitter.emit(type, roomLeftInfo);
          this._rooms.delete(roomLeftInfo.roomId);
          this._joinedRoomIds.delete(roomLeftInfo.roomId);
          break;
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

    const rawResponse = await this.connection.invokeEvent(eventName, payload, dataType);

    logger.verbose(`invoke response for '${eventName}':`, rawResponse);

    const data = rawResponse.data as any;
    if (data && typeof data === "object" && typeof data.code === "string") {
      throw new ChatError(`Invocation of event "${eventName}" failed: ${data.code}`, data.code);
    }
    return data as T;
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
      this._joinedRoomIds.add(roomId);
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
    // sender won't receive conversation message via notification mechanism, so emit event here
    const roomId = Array.from(this._rooms.values()).find((r) => r.defaultConversationId === conversationId)?.roomId;
    if (!roomId) {
      logger.warning(`Failed to find roomId for conversationId ${conversationId} when sending message.`);
    }
    // Tag the synthetic sender-side event so callers can ignore only the local echo
    // without dropping same-user messages that arrive from another device.
    this._emitter.emit("MessageCreated" as NotificationType, {
      notificationType: "MessageCreated",
      conversation: { conversationId: conversationId, roomId: roomId || "" },
      message: {
        messageId: msgId,
        createdBy: this.userId,
        messageBodyType: "Inline",
        localEcho: true,
        content: {
          text: message,
          binary: null,
        },
      } as MessageInfo & { localEcho: boolean },
    } as NewMessageNotificationBody);
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
    this._joinedRoomIds.add(roomInfo.roomId);
    this._emitter.emit("RoomJoined" as NotificationType, roomInfo);
    return roomInfo;
  }

  private async manageRoomMember(request: ManageRoomMemberRequest): Promise<void> {
    await this.invokeWithReturnType<any>(INVOCATION_NAME.MANAGE_ROOM_MEMBER, request, "json");
  }

  private isUserAlreadyInRoomError(error: unknown): boolean {
    const detailName = typeof (error as any)?.errorDetail?.name === "string" ? (error as any).errorDetail.name : "";
    const code = error instanceof ChatError ? error.code : "";
    const name = typeof (error as any)?.name === "string" ? (error as any).name : "";
    const message = String((error as any)?.message || "");
    return code === ERRORS.USER_ALREADY_IN_ROOM
      || detailName === ERRORS.USER_ALREADY_IN_ROOM
      || name === ERRORS.USER_ALREADY_IN_ROOM
      || /already a member of the specified room/i.test(message);
  }

  private async hydrateSelfRoomCache(roomId: string): Promise<void> {
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
    const shouldHydrateSelfCache = isSelf && !this._rooms.has(roomId);
    try {
      await this.manageRoomMember(payload);
    } catch (error) {
      if (!isSelf || !this.isUserAlreadyInRoomError(error)) {
        throw error;
      }
    }
    // When the logged-in client adds itself to a room (or is already a member),
    // mark the room as authoritatively joined so hasJoinedRoom() returns true.
    // The RoomJoined notification may never arrive for server-side member management,
    // so this is the only reliable point to set the authoritative joined state.
    if (isSelf) {
      this._joinedRoomIds.add(roomId);
    }
    if (shouldHydrateSelfCache) {
      await this.hydrateSelfRoomCache(roomId);
    }
  }

  /** Remove a user from a room. This is an admin operation where one user removes another user from a room. */
  public async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    this.ensureLoggedIn();
    const payload: ManageRoomMemberRequest = { roomId: roomId, operation: "Delete", userId: userId };
    await this.manageRoomMember(payload);
    // Mirror the self-add path above: when the logged-in client removes its own userId,
    // the service-side membership is updated immediately but the RoomLeft notification may
    // arrive later or be absent from the local cache view. Drop the cached room eagerly so
    // follow-up UI and send/list calls do not treat a dead room as still joined.
    if (userId === this.userId) {
      const roomInfo = this._rooms.get(roomId);
      if (roomInfo) {
        this._rooms.delete(roomId);
        this._joinedRoomIds.delete(roomId);
        this._emitter.emit("RoomLeft" as NotificationType, {
          roomId,
          title: roomInfo.title,
          notificationType: "RoomLeft",
        } as RoomLeftNotificationBody);
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

  /** Whether the current connection has received an authoritative room join for this room. */
  public hasJoinedRoom(roomId: string): boolean {
    return this._joinedRoomIds.has(roomId);
  }

  public get userId(): string {
    if (!this._userId) {
      throw new Error("User ID is not set. Please login first.");
    }
    return this._userId;
  }
  /** Add callback for new message events. Returns a function to remove the listener. */
  public addListenerForNewMessage = (callback: (message: NewMessageNotificationBody) => void): (() => void) => {
    this._emitter.on("MessageCreated" as NotificationType, callback);
    return () => this._emitter.off("MessageCreated" as NotificationType, callback);
  };

  /** Add callback for new room events. Returns a function to remove the listener. */
  public addListenerForNewRoom = (callback: (room: RoomInfo) => void): (() => void) => {
    this._emitter.on("RoomJoined" as NotificationType, callback);
    return () => this._emitter.off("RoomJoined" as NotificationType, callback);
  };

  /** Add callback for member joined room events. Returns a function to remove the listener. */
  public addListenerForMemberJoined = (callback: (info: MemberJoinedNotificationBody) => void): (() => void) => {
    this._emitter.on("RoomMemberJoined" as NotificationType, callback);
    return () => this._emitter.off("RoomMemberJoined" as NotificationType, callback);
  };

  /** Add callback for member left room events. Returns a function to remove the listener. */
  public addListenerForMemberLeft = (callback: (info: MemberLeftNotificationBody) => void): (() => void) => {
    this._emitter.on("RoomMemberLeft" as NotificationType, callback);
    return () => this._emitter.off("RoomMemberLeft" as NotificationType, callback);
  };

  /** Add callback for user self left room events. Returns a function to remove the listener. */
  public addListenerForRoomLeft = (callback: (info: RoomLeftNotificationBody) => void): (() => void) => {
    this._emitter.on("RoomLeft" as NotificationType, callback);
    return () => this._emitter.off("RoomLeft" as NotificationType, callback);
  };

  public stop = (): void => {
    this.connection.stop();
  };

  public onConnected = (callback: (e: OnConnectedArgs) => void): void => {
    return this.connection.on("connected", callback);
  };

  public onDisconnected = (callback: (e: OnDisconnectedArgs) => void): void => {
    return this.connection.on("disconnected", callback);
  };

  public onStopped = (callback: (e: OnStoppedArgs) => void): void => {
    return this.connection.on("stopped", callback);
  };
}

export { ChatClient, ChatError };
