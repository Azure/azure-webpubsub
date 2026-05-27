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

/** Options for {@link ChatClient.start}. */
export interface StartOptions extends OperationOptions {}

/** Options for {@link ChatClient.stop}. */
export interface StopOptions extends OperationOptions {}

/** Options for {@link ChatClient.getRoom}. */
export interface GetRoomOptions extends OperationOptions {}

/** Options for {@link ChatClient.createRoom}. */
export interface CreateRoomOptions extends OperationOptions {}

/** Options for {@link ChatClient.sendToRoom}. */
export interface SendMessageOptions extends OperationOptions {}

/** Options for {@link ChatClient.getUserInfo}. */
export interface GetUserInfoOptions extends OperationOptions {}

/** Options for {@link ChatClient.addUserToRoom} and {@link ChatClient.removeUserFromRoom}. */
export interface RoomMemberOperationOptions extends OperationOptions {}

/** Options for {@link ChatClient.listRoomMessages}. */
export interface ListRoomMessagesOptions extends OperationOptions {
  /** Room to list messages from. Must be a room this client has created or joined. */
  roomId: string;
  /**
   * Inclusive lower bound on message id; omit to start from the earliest available message.
   */
  startId?: string;
  /**
   * Inclusive upper bound on message id; omit to read up to the latest message.
   */
  endId?: string;
  /**
   * Maximum number of messages to request per service round-trip when
   * iterating with `for await`. Defaults to 100. Callers using
   * `byPage(...)` can override this per page via
   * `byPage({ maxPageSize })`.
   */
  pageSize?: number;
}
