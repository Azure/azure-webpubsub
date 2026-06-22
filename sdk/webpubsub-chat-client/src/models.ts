/**
 * Public domain model types for the chat client.
 *
 * These are hand-curated, standalone shapes that make up the SDK's public
 * surface. They expose a curated *subset* of the wire schemas in
 * `generatedTypes.ts` — an internal, auto-generated file — declared
 * independently so the generated OpenAPI aggregates (`components`,
 * `Schemas`, `paths`, ...) never leak into the public API. Internal-only
 * concepts (e.g. conversation ids) are intentionally omitted here even
 * though the wire types still carry them.
 *
 * A compile-time guard in `modelGuards.ts` fails the build if any field
 * these models *do* expose drifts out of sync with the generated wire
 * types, so regenerating the schema (`npm run generate:types`) surfaces
 * shape changes here instead of silently diverging.
 */

/** A single chat message. */
export interface MessageInfo {
  /** Service-assigned message id, unique and monotonically increasing within a conversation. */
  messageId: string;
  /** User id of the sender. */
  createdBy?: string;
  /** Creation timestamp, as returned by the service. */
  createdAt?: string;
  /** Body type of the message (service-defined). */
  bodyType?: string;
  /** Concrete body type of the message (service-defined). */
  messageBodyType: string;
  /** Message payload. Text messages populate `text`; binary messages populate `binary`. */
  content: {
    text?: string | null;
    binary?: string | null;
  };
  /** Id of the message this one references (e.g. a reply), when applicable. */
  refMessageId?: string | null;
}

/** Metadata describing a room. */
export interface RoomInfo {
  /** Unique room id. */
  roomId: string;
  /** Display title of the room. */
  title: string;
  /** Free-form room properties, when set. */
  properties?: Record<string, never> | null;
}

/**
 * The detailed view of a room: a {@link RoomInfo} plus, optionally, its
 * member list. Returned by `createRoom()` and `getRoomDetail()`. Reserved
 * to grow with further room detail (e.g. conversations) over time.
 */
export interface RoomDetail extends RoomInfo {
  /**
   * User ids of the room's members. Populated when the members were
   * requested (e.g. `getRoomDetail(..., { withMembers: true })`) and
   * `undefined` otherwise.
   */
  members?: string[];
}

/** Profile of a chat user. */
export interface UserProfile {
  /** The user's id. */
  userId: string;
  /** Ids of rooms the user belongs to. */
  roomIds?: string[];
}

/** Result of sending a message, returned by `sendToRoom()`. */
export interface SendMessageResult {
  /** Service-assigned id of the sent message. */
  messageId: string;
}
