/**
 * Options-object types for `ChatClient` methods.
 *
 * Every asynchronous method accepts an options bag extending
 * {@link OperationOptions} with at least an `abortSignal`. Future
 * per-operation knobs (custom headers, retry policy, ...) live on
 * these interfaces too.
 */

import type { AbortSignalLike } from "@azure/abort-controller";

/** Base options accepted by every asynchronous `ChatClient` operation. */
export interface OperationOptions {
  /**
   * Signal used to cancel the operation. Accepts either a browser
   * `AbortSignal` or `@azure/abort-controller`'s polyfill.
   */
  abortSignal?: AbortSignalLike;
}

/** Options for `ChatClient.start()`. */
export interface StartOptions extends OperationOptions {}

/** Options for `ChatClient.getRoomDetail()`. */
export interface GetRoomDetailOptions extends OperationOptions {
  /**
   * When `true`, the returned {@link RoomDetail}'s `members` array is
   * populated. Defaults to `false`, leaving `members` undefined.
   */
  withMembers?: boolean;
}

/** Options for `ChatClient.createRoom()`. */
export interface CreateRoomOptions extends OperationOptions {
  /**
   * Optional client-chosen room id. If omitted, the service assigns a
   * random id. The id must be unique within the hub; reusing an
   * existing id rejects with `KnownChatErrorCode.RoomAlreadyExists`.
   */
  roomId?: string;
}

/** Options for `ChatClient.sendToRoom()`. */
export interface SendToRoomOptions extends OperationOptions {}

/** Options for `ChatClient.addUserToRoom()`. */
export interface AddUserToRoomOptions extends OperationOptions {}

/** Options for `ChatClient.removeUserFromRoom()`. */
export interface RemoveUserFromRoomOptions extends OperationOptions {}

/** Options for `ChatClient.listRoomMessages()`. */
export interface ListRoomMessagesOptions extends OperationOptions {
  /**
   * Inclusive lower bound on message id; omit to start from the earliest available message.
   */
  startId?: string;
  /**
   * Inclusive upper bound on message id; omit to read up to the latest message.
   */
  endId?: string;
  /**
   * Default maximum number of messages to request per service
   * round-trip when iterating with `for await`. Defaults to 100.
   * Callers using `byPage(...)` can override this per page via
   * `byPage({ maxPageSize })`; the name matches the
   * `@azure/core-paging` `PageSettings.maxPageSize` convention.
   */
  maxPageSize?: number;
}
