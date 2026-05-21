import type { MessageInfo, RoomInfo } from "./generatedTypes.js";

/**
 * A chat message payload. Extends the wire `MessageInfo` so existing
 * accessors keep working and reserves room for client-only metadata in
 * future revisions of the SDK.
 */
export interface ChatMessage extends MessageInfo {}

/** Payload of the `"message"` event. */
export interface MessageEvent {
  /** Conversation the message belongs to. */
  conversationId: string;
  /** Room id when the conversation is room-scoped; otherwise undefined. */
  roomId?: string;
  /** The message. */
  message: ChatMessage;
}

/** Payload of the `"roomJoined"` event. Fired when the current client joins a room. */
export interface RoomJoinedEvent {
  room: RoomInfo;
}

/** Payload of the `"roomLeft"` event. Fired when the current client leaves a room. */
export interface RoomLeftEvent {
  roomId: string;
  title: string;
}

/** Payload of the `"memberJoined"` event. Fired when another user joins a room this client is in. */
export interface MemberJoinedEvent {
  roomId: string;
  title: string;
  userId: string;
}

/** Payload of the `"memberLeft"` event. Fired when another user leaves a room this client is in. */
export interface MemberLeftEvent {
  roomId: string;
  title: string;
  userId: string;
}

/**
 * Map of all chat-domain `ChatClient` events to their payload types.
 *
 * Connection-lifecycle events (`connected`, `disconnected`, `stopped`)
 * live on the underlying transport and are subscribed via
 * `chatClient.connection.on("connected", ...)` etc.
 *
 * Used by the generic `ChatClient.on` / `ChatClient.off` overloads for
 * type narrowing. Convenience methods (`onMessage`, `onRoomJoined`, ...)
 * are thin wrappers over `on(...)` and accept the corresponding payload
 * type.
 */
export interface ChatEventMap {
  message: MessageEvent;
  roomJoined: RoomJoinedEvent;
  roomLeft: RoomLeftEvent;
  memberJoined: MemberJoinedEvent;
  memberLeft: MemberLeftEvent;
}

export type ChatEventName = keyof ChatEventMap;
export type ChatEventListener<K extends ChatEventName> = (event: ChatEventMap[K]) => void;

/** Returned from listener registrations. Call to remove the listener. */
export type Disposable = () => void;
