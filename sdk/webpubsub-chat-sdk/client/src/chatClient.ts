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

    // add a type as parameter
    private async invokeEvent<T>(eventName: string, payload: any): Promise<T> {
        // const result = await client.invokeEvent("processOrder", { orderId: 1 }, "json");
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
        return this.invokeEvent<UserProfile>(INVOCATION_NAME.user.GET_USER_PROPERTIES, { UserId: userId });
    }

    public async listConversationByUser(continuationToken?: string, MaxCount?: number): Promise<{ conversations: ChatConversation[]; continuationToken?: string }> {
        const result = await this.invokeEvent<{ Conversations: ChatConversation[]; ContinuationToken?: string }>(INVOCATION_NAME.user.LIST_USER_CONVERSATION, { ContinuationToken: continuationToken, MaxCount: MaxCount });
        return { conversations: result.Conversations, continuationToken: result.ContinuationToken };
    }

    // public async listMessages(user: UserProfile, options: MessageRangeQuery): Promise<MessageInfo[]> {
    //     // Placeholder implementation
    //     return [];
    // }

    public async sendToConversation(conversationId: string, message: string): Promise<MessageInfo> {
        const payload = {
            Conversation: {
                ConversationId: conversationId
            },
            Message: message
        }
        return this.invokeEvent<MessageInfo>(INVOCATION_NAME.messages.SEND_TEXT_MESSAGE, payload);
    }

    // ask if correct
    public async sendToRoom(room: string|RoomInfo, message: string): Promise<MessageInfo> {
        const conversationId = typeof room == "string" ? (await this.getRoom(room)).DefaultConversation  : room.DefaultConversation;
        return this.sendToConversation(conversationId, message);
    }

    // make it a property getter?
    public get rooms(): RoomInfo[] {
        return Array.from(this._rooms.values());
    }

    public async getRoom(roomId: string): Promise<RoomInfo> {
        return this.invokeEvent<RoomInfo>(INVOCATION_NAME.rooms.GET_ROOM, { id: roomId });
    }

    public async createRoom(roomDetails: { title: string; members: string[] }): Promise<RoomInfo> {
        return this.invokeEvent<RoomInfo>(INVOCATION_NAME.roomsManagement.CREATE_ROOM, roomDetails);
    }

    public async sendToUser(user: string|UserProfile, message: string): Promise<void> { 
        const userId = typeof user == "string" ? user : user.UserId;
        return ;
    }

}

export { ChatClient };