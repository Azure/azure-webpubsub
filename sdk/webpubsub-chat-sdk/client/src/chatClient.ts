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
} from "./generatedTypes.js";
import { ERRORS, INVOCATION_NAME } from "./constant.js";
import { logger } from "./logger.js";
import { isWebPubSubClient } from "./utils.js";

class ChatClient {
  public readonly connection: WebPubSubClient;

  private readonly _emitter = new EventEmitter();
  private readonly _rooms = new Map<string, RoomInfo>();
  protected _conversationIds = new Set<string>();
  private _userId: string | undefined;

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
      try {
        const [wpsGroup, data] = [e.message.group, e.message.data as Notification];
        logger.info(`Received notification via wps group message, group: ${wpsGroup}, data: `, data);
		const type = data.notificationType;
        switch (type) {
          case "NewMessage":
            const notificationBody = data.body as NewMessageNotificationBody;
            this._emitter.emit(type, notificationBody);
            break;
          case "NewRoom":
            const roomInfo = data.body as NewRoomNotificationBody as RoomInfo;
            this._emitter.emit(type, roomInfo);
            this._rooms.set(roomInfo.roomId, roomInfo);
            break;
          case "MemberJoined":
            const memberJoinedInfo = data.body as MemberJoinedNotificationBody;
			this._emitter.emit(type, memberJoinedInfo);
            break;
          case "UpdateMessage":
          case "AddContact":
            logger.warning(`Known notification type ${type} received but not implemented yet.`);
            break;
          default:
            logger.warning(`Unknown notification type received: ${type}`);
        }
      } catch (err) {
        logger.error(`Error processing notification, error = ${err}, event: `, e);
      }
    });
  }

  /** Invoke server event and return typed data */
  private async invokeWithReturnType<T>(eventName: string, payload: any, dataType: WebPubSubDataType): Promise<T> {
    logger.verbose(`invoke event: '${eventName}', dataType: ${dataType}, payload:`, payload);

    const rawResponse = await this.connection.invokeEvent(eventName, payload, dataType);

    logger.verbose(`invoke response for '${eventName}':`, rawResponse);

    const dataString = JSON.stringify(rawResponse);
    if (dataString?.indexOf("InvalidRequest") !== -1) {
      throw new Error(`Invocation of event "${eventName}" failed: ${dataString || "Unknown error"}`);
    }
    // todo: handle rawResponse.success
    return rawResponse.data as T;
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
    this._conversationIds = new Set(loginResponse.conversationIds || []);
    loginResponse.roomIds?.forEach(async (roomId) => {
      const roomInfo = await this.getRoom(roomId, false);
      this._rooms.set(roomId, roomInfo);
    });
    return this;
  }

  public async getUserInfo(userId: string): Promise<UserProfile> {
    return this.invokeWithReturnType<UserProfile>(INVOCATION_NAME.GET_USER_PROPERTIES, { userId: userId }, "json");
  }

  public async sendToConversation(conversationId: string, message: string): Promise<string> {
    const payload = {
      conversation: { conversationId: conversationId },
      content: message,
    };
    const msgId = (await this.invokeWithReturnType<SendMessageResponse>(INVOCATION_NAME.SEND_TEXT_MESSAGE, payload, "json")).id;
    // sender won't receive conversation message via notification mechanism, so emit event here
    const roomId = Array.from(this._rooms.values()).find((r) => r.defaultConversationId === conversationId)?.roomId;
    logger.warning(`Failed to find roomId for conversationId ${conversationId} when sending message.`);
    this._emitter.emit("NewMessage" as NotificationType, {
      conversation: { conversationId: conversationId, roomId: roomId || "" },
      message: {
        messageId: msgId,
        createdBy: this.userId,
        content: {
          text: message,
          binary: null,
        },
      } as MessageInfo,
    } as NewMessageNotificationBody);
    return msgId;
  }

  public async sendToRoom(roomId: string, message: string): Promise<string> {
    const conversationId = this._rooms.get(roomId)?.defaultConversationId;
    if (!conversationId) {
      throw Error(`Failed to sendToRoom, not found roomId ${roomId}`);
    }
    return await this.sendToConversation(conversationId, message);
  }

  public async getRoom(roomId: string, withMembers: boolean): Promise<RoomInfoWithMembers> {
    return this.invokeWithReturnType<RoomInfoWithMembers>(INVOCATION_NAME.GET_ROOM, { id: roomId, withMembers: withMembers }, "json");
  }

  /** Create a room and its initial members. If `roomId` is not set, the service will create a random one. */
  public async createRoom(title: string, members: string[], roomId?: string): Promise<RoomInfoWithMembers> {
    let roomDetails = {
      title: title,
      members: [...new Set([...members, this.userId])], // deduplicate and add self
    } as any;
    if (roomId) {
      roomDetails = { ...roomDetails, roomId: roomId };
    }
    const roomInfo = await this.invokeWithReturnType<RoomInfoWithMembers>(INVOCATION_NAME.CREATE_ROOM, roomDetails, "json");
    if ((roomInfo as any).code === ERRORS.ROOM_ALREADY_EXISTS) {
      throw new Error(ERRORS.ROOM_ALREADY_EXISTS);
    }
    console.log(`createdRoom:`, roomInfo);
    this._rooms.set(roomInfo.roomId, roomInfo);
    this._emitter.emit("NewRoom" as NotificationType, roomInfo);
    return roomInfo;
  }

  private async manageRoomMember(request: ManageRoomMemberRequest): Promise<void> {
    console.log("manageRoomMember request:", request);
    const ret = await this.invokeWithReturnType<any>(INVOCATION_NAME.MANAGE_ROOM_MEMBER, request, "json");
    console.log("manageRoomMember response:", ret);
    if ((ret as any).code === ERRORS.NO_PERMISSION_IN_ROOM) {
      throw new Error(ERRORS.NO_PERMISSION_IN_ROOM);
    }
  }

  /** Add a user to a room. This is an admin operation where one user adds another user to a room. */
  public async addUserToRoom(roomId: string, userId: string): Promise<void> {
    const payload: ManageRoomMemberRequest = { roomId: roomId, operation: "Add", userId: userId };
    await this.manageRoomMember(payload);
  }

  /** Remove a user from a room. This is an admin operation where one user removes another user from a room. */
  public async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    const payload: ManageRoomMemberRequest = { roomId: roomId, operation: "Delete", userId: userId };
    await this.manageRoomMember(payload);
  }

  /** List messages in a conversation. It returns messages and a query for the next query parameter. */
  public async listMessage(conversationId: string, startId: string | null, endId: string | null, maxCount: number = 100): Promise<{ messages: MessageInfo[]; nextQuery: MessageRangeQuery }> {
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

  public get userId(): string {
    if (!this._userId) {
      throw new Error("User ID is not set. Please login first.");
    }
    return this._userId;
  }
  /** add callback for new message events. */
  public addListenerForNewMessage = (callback: (message: NewMessageNotificationBody) => void) => this._emitter.on("NewMessage" as NotificationType, callback);

  /** add callback for new room events. */
  public addListenerForNewRoom = (callback: (room: RoomInfo) => void) => this._emitter.on("NewRoom" as NotificationType, callback);

  /** add callback for new member joined room events */
  public addListenerForMemberJoined = (callback: (info: MemberJoinedNotificationBody) => void) => this._emitter.on("MemberJoined" as NotificationType, callback);

  public stop = (): void => {
    this.connection.stop();
  };

  public onConnected = (callback: (e: OnConnectedArgs) => void): void => {
    return this.connection.on("connected", callback);
  };

  public onDisconnected = (callback: (e: OnDisconnectedArgs) => void): void => {
    return this.connection.off("disconnected", callback);
  };

  public onStopped = (callback: (e: OnStoppedArgs) => void): void => {
    return this.connection.off("stopped", callback);
  };

  public test() {
    return void 0;
  }
}

export { ChatClient };
