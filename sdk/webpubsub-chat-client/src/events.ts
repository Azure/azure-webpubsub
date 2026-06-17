import type { MessageInfo, RoomInfo } from "./generatedTypes.js";

/**
 * A chat message payload. Extends the wire `MessageInfo` so existing
 * accessors keep working and reserves room for client-only metadata in
 * future revisions of the SDK.
 */
export interface ChatMessage extends MessageInfo {}

/**
 * Argument of the `"started"` event listener. Fired after `start()`
 * completes successfully — the underlying connection is open, chat-
 * domain login has resolved, and `client.userId` / `client.rooms` are
 * populated. Mirrors the `On<Event>Args` shape used by the underlying
 * `WebPubSubClient` (e.g. `OnConnectedArgs`).
 */
export interface OnStartedArgs {
  /** The chat-domain identity of this client. Equivalent to `client.userId`. */
  userId: string;
}

/**
 * Argument of the `"stopped"` event listener. Fired when the chat
 * client transitions from started to not-started — either because
 * `stop()` was called or the underlying connection terminated. Empty
 * payload (reserved for future fields), matching upstream
 * `WebPubSubClient.OnStoppedArgs`.
 */
export interface OnStoppedArgs {}

/**
 * Argument of the `"message"` event listener. Naming mirrors the
 * `On<Event>Args` convention used by the underlying `WebPubSubClient`
 * (e.g. `OnGroupDataMessageArgs`).
 */
export interface OnMessageArgs {
  /** Room the message belongs to. */
  roomId: string;
  /** The message. */
  message: ChatMessage;
}

/** Argument of the `"room-joined"` event listener. Fired when the current client joins a room. */
export interface OnRoomJoinedArgs {
  room: RoomInfo;
}

/** Argument of the `"room-left"` event listener. Fired when the current client leaves a room. */
export interface OnRoomLeftArgs {
  roomId: string;
  title: string;
}

/** Argument of the `"member-joined"` event listener. Fired when another user joins a room this client is in. */
export interface OnMemberJoinedArgs {
  roomId: string;
  title: string;
  userId: string;
}

/** Argument of the `"member-left"` event listener. Fired when another user leaves a room this client is in. */
export interface OnMemberLeftArgs {
  roomId: string;
  title: string;
  userId: string;
}
