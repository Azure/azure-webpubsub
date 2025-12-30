import { OnConnectedArgs, OnDisconnectedArgs, OnStoppedArgs, WebPubSubClient, WebPubSubDataType } from "@azure/web-pubsub-client";
import { EventEmitter } from "events";
import { MessageInfo, MessageRangeQuery, RoomInfo, UserProfile, RoomInfoWithMembers, Notification, NewMessageNotificationBody, NewRoomNotificationBody, SendMessageResponse } from "./generatedTypes.js";
import { ERRORS, INVOCATION_NAME } from "./constant.js";
import { logger } from "./logger.js";
import { decodeMessageBody } from "./utils.js";


class ChatClient {
    private _wpsClient: WebPubSubClient;
    private readonly _emitter = new EventEmitter();
    private readonly _rooms = new Map<string, RoomInfo>();
    protected _conversationIds = new Set<string>();
    private _userId: string | undefined;

    constructor(wpsClient: WebPubSubClient) {
        this._wpsClient = wpsClient;

        this._wpsClient.on("group-message", (e) => {
            try {
                const [wpsGroup, data] = [e.message.group, e.message.data as Notification];
                logger.info(`Received notification via wps group message, group: ${wpsGroup}, data: `, data);
                switch (data.NotificationType) {
                    case "NewMessage":
                        const notificationBody = data.Body as NewMessageNotificationBody;
                        const contentBody = (notificationBody.Message as MessageInfo).Body;
                        (notificationBody.Message as MessageInfo).Body = decodeMessageBody(contentBody);
                        this._emitter.emit("newMessage", notificationBody);
                        break;
                    case "NewRoom":
                        const roomInfo = (data.Body as NewRoomNotificationBody) as RoomInfo;
                        this._emitter.emit("newRoom", roomInfo);
                        this._rooms.set(roomInfo.RoomId, roomInfo);
                        break;
                    case "UpdateMessage":
                    case "AddContact":
                        logger.warning(`Notification type ${data.NotificationType} received but not implemented yet.`);
                        break;
                    default:
                        logger.warning(`Unknown notification type received: ${data.NotificationType}`);
                }
            }
            catch (err) {
                logger.error(`Error processing notification, error = ${err}, event: `, e);
            }
        });
    }


    /** Invoke server event and return typed data */
    private async invokeWithReturnType<T>(eventName: string, payload: any, dataType: WebPubSubDataType): Promise<T> {
        logger.verbose(`invoke event: '${eventName}', dataType: ${dataType}, payload:`, payload);

        const rawResponse = await this._wpsClient.invokeEvent(eventName, payload, dataType);

        logger.verbose(`invoke response for '${eventName}':`, rawResponse);

        const dataString = JSON.stringify(rawResponse);
        if (dataString?.indexOf("InvalidRequest") !== -1) {
            throw new Error(`Invocation of event "${eventName}" failed: ${dataString || 'Unknown error'}`);
        }
        return rawResponse.data as T;
    }

    /** create a chat client based on an existing WebPubSubClient. */
    public static async login(wpsClient: WebPubSubClient): Promise<ChatClient> {
        const chatClient = new ChatClient(wpsClient);
        return await chatClient.login();
    }   

    /** create a chat client based on an existing WebPubSubClient. */
    public async login(): Promise<ChatClient> {
        await this._wpsClient.start();
        const loginResponse = await this.invokeWithReturnType<UserProfile>(INVOCATION_NAME.LOGIN, "", "text");
        console.log("loginResponse", loginResponse);
        this._userId = loginResponse.UserId;
        this._conversationIds = new Set(loginResponse.ConversationIds || []);
        loginResponse.RoomIds?.forEach(async roomId => {
            const roomInfo = await this.getRoom(roomId, false);
            this._rooms.set(roomId, roomInfo);
        });
        return this;
    }


    public async getUserInfo(userId: string): Promise<UserProfile> {
        return this.invokeWithReturnType<UserProfile>(INVOCATION_NAME.GET_USER_PROPERTIES, { UserId: userId }, "json");
    }

    public async sendToConversation(conversationId: string, message: string): Promise<string> {
        const payload = {
            Conversation: { ConversationId: conversationId },
            Content: message
        }
        const msgId = (await this.invokeWithReturnType<SendMessageResponse>(INVOCATION_NAME.SEND_TEXT_MESSAGE, payload, "json")).Id;
        // sender won't receive conversation message via notification mechanism, so emit event here
        const roomId = Array.from(this._rooms.values()).find(r => r.DefaultConversationId === conversationId)?.RoomId;
        logger.warning(`Failed to find roomId for conversationId ${conversationId} when sending message.`)
        this._emitter.emit("newMessage", {
            Conversation: { ConversationId: conversationId, RoomId: roomId || "" },
            Message: {
                MessageId: msgId,
                Body: message,
                CreatedBy: this.userId,
            } as MessageInfo,
        } as NewMessageNotificationBody);
        return msgId;
    }

    public async sendToRoom(roomId: string, message: string): Promise<string> {
        const conversationId = this._rooms.get(roomId)?.DefaultConversationId;
        if (!conversationId) {
            throw Error(`Failed to sendToRoom, not found roomId ${roomId}`)
        }
        return await this.sendToConversation(conversationId, message);
    }

    public async getRoom(roomId: string, withMembers: boolean): Promise<RoomInfoWithMembers> {
        return this.invokeWithReturnType<RoomInfoWithMembers>(INVOCATION_NAME.GET_ROOM, { id: roomId, withMembers: withMembers }, "json");
    }

    /** Create a room and its initial members. If `roomId` is not set, the service will create a random one. */
    public async createRoom(title: string, members: string[], roomId?: string): Promise<RoomInfoWithMembers> {
        let roomDetails = {
            Title: title,
            Members: [...new Set([...members, this.userId])]    // deduplicate and add self
        } as any;
        if (roomId) {
            roomDetails = { ...roomDetails, RoomId: roomId };
        }
        const roomInfo = await this.invokeWithReturnType<RoomInfoWithMembers>(INVOCATION_NAME.CREATE_ROOM, roomDetails, "json");
        if ((roomInfo as any).Code === ERRORS.ROOM_ALREADY_EXISTS) {
            throw new Error(ERRORS.ROOM_ALREADY_EXISTS);
        }
        this._rooms.set(roomInfo.RoomId, roomInfo);
        this._emitter.emit("newRoom", roomInfo);
        return roomInfo;
    }

    public async joinRoom(roomId: string): Promise<RoomInfoWithMembers> {
        const roomInfo = await this.invokeWithReturnType<RoomInfoWithMembers>(INVOCATION_NAME.JOIN_ROOM, { RoomId: roomId }, "json");
        if ((roomInfo as any).Code === ERRORS.USER_ALREADY_IN_ROOM) {
            throw new Error(ERRORS.USER_ALREADY_IN_ROOM);
        }
        this._rooms.set(roomInfo.RoomId, roomInfo);
        this._emitter.emit("newRoom", roomInfo);
        return roomInfo;
    }

    /** List messages in a conversation. It returns messages and a query for the next query parameter. */
    public async listMessage(conversationId: string, startId: string | null, endId: string | null, maxCount: number = 100): Promise<{ Messages: MessageInfo[], NextQuery: MessageRangeQuery }> {
        const query: MessageRangeQuery = {
            Conversation: { ConversationId: conversationId },
            Start: startId,
            End: endId,
            MaxCount: maxCount
        };
        const result = await this.invokeWithReturnType<{ Messages: MessageInfo[], NextQuery: MessageRangeQuery }>(INVOCATION_NAME.LIST_MESSAGES, query, "json");
        for (const messageInfo of result.Messages) {
            messageInfo.Body = decodeMessageBody(messageInfo.Body);
        }
        return result;
    }

    /** List messages in a room. It returns messages and a query for the next query parameter. */
    public async listRoomMessage(roomId: string, startId: string | null, endId: string | null, maxCount: number = 100): Promise<{ Messages: MessageInfo[], NextQuery: MessageRangeQuery }> {
        const conversationId  = this._rooms.get(roomId)?.DefaultConversationId;
        console.log("found room", this._rooms.get(roomId), "rooms:", this._rooms);
        if (!conversationId) {
            throw Error(`Failed to listRoomMessage, not found roomId ${roomId}`)
        }
        const query: MessageRangeQuery = {
            Conversation: { ConversationId: conversationId },
            Start: startId,
            End: endId,
            MaxCount: maxCount
        };
        const result = await this.invokeWithReturnType<{ Messages: MessageInfo[], NextQuery: MessageRangeQuery }>(INVOCATION_NAME.LIST_MESSAGES, query, "json");
        for (const messageInfo of result.Messages) {
            messageInfo.Body = decodeMessageBody(messageInfo.Body);
        }
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
    public addListenerForNewMessage = (callback: (message: NewMessageNotificationBody) => void) => this._emitter.on("newMessage", callback);

    /** add callback for new room events. */
    public addListenerForNewRoom = (callback: (room: RoomInfo) => void) => this._emitter.on("newRoom", callback);

    public stop = (): void => { this._wpsClient.stop(); }

    public onConnected = (callback: (e: OnConnectedArgs) => void): void => { return this._wpsClient.on("connected", callback); }

    public onDisconnected = (callback: (e: OnDisconnectedArgs) => void): void => { return this._wpsClient.off("disconnected", callback); }

    public onStopped = (callback: (e: OnStoppedArgs) => void): void => { return this._wpsClient.off("stopped", callback); }

    public test() {
        return void 0;
    }
}

export { ChatClient };
