import { WebPubSubClient, type WebPubSubClientOptions } from "@azure/web-pubsub-client";
import { EventEmitter } from "events";
import { ChatConversation, MessageInfo, MessageRangeQuery, RoomInfo, UserProfile } from "./types.js";
import { INVOCATION_NAME } from "./constant.js";

class ChatClient {
    private _wpsClient: WebPubSubClient;
    private readonly _emitter = new EventEmitter();
    private readonly _rooms = new Map<string, RoomInfo>();

    constructor(wpsClient: WebPubSubClient) {
        this._wpsClient = wpsClient;
    }

    private async invokeEvent<T>(eventName: string, payload: any): Promise<T> {
        // const rawResponse = await this._wpsClient.invokeEvent(eventName, payload, "json");
        var rawResponse = "";
        return JSON.parse(rawResponse) as T;
    }

    public static async login(wpsClient: WebPubSubClient): Promise<ChatClient> {
        return new ChatClient(wpsClient);
    }

    public onNewMessage(callback: (message: MessageInfo) => void): void {
        this._emitter.on("newMessage", callback);
    }

    public onNewRoom(callback: (room: RoomInfo) => void): void {
        this._emitter.on("newRoom", callback);
    }

    public async getUserInfo(userId: string): Promise<UserProfile> {
        return this.invokeEvent<UserProfile>(INVOCATION_NAME.USER.GET_USER_PROPERTIES, { UserId: userId });
    }

    public async listConversationByUser(continuationToken?: string, MaxCount?: number): Promise<{ conversations: ChatConversation[]; continuationToken?: string }> {
        const result = await this.invokeEvent<{ Conversations: ChatConversation[]; ContinuationToken?: string }>(INVOCATION_NAME.USER.LIST_USER_CONVERSATION, { ContinuationToken: continuationToken, MaxCount: MaxCount });
        return { conversations: result.Conversations, continuationToken: result.ContinuationToken };
    }

    public async sendToConversation(conversationId: string, message: string): Promise<MessageInfo> {
        const payload = {
            Conversation: { ConversationId: conversationId },
            Message: message
        }
        return this.invokeEvent<MessageInfo>(INVOCATION_NAME.MESSAGES.SEND_TEXT_MESSAGE, payload);
    }

    public async sendToRoom(roomId: string, message: string): Promise<MessageInfo> {
        const conversationId = this._rooms.get(roomId)?.DefaultConversation;
        if (!conversationId) {
            throw Error(`Failed to sendToRoom, invalid roomId ${roomId}`)
        }
        return this.sendToConversation(conversationId, message);
    }

    public get rooms(): RoomInfo[] {
        return Array.from(this._rooms.values());
    }

    public async getRoom(roomId: string): Promise<RoomInfo> {
        return this.invokeEvent<RoomInfo>(INVOCATION_NAME.ROOMS.GET_ROOM, { id: roomId });
    }

    public async createRoom(roomDetails: { title: string; members: string[] }): Promise<RoomInfo> {
        return this.invokeEvent<RoomInfo>(INVOCATION_NAME.ROOMS_MANAGEMENT.CREATE_ROOM, roomDetails);
    }

    public async sendToUser(user: string, message: string): Promise<void> { 
        throw new Error("Not implemented")
    }

}

export { ChatClient };