/**
 * Options-object types for `ChatClient` methods.
 *
 * As more methods migrate to the options-object pattern, additional
 * interfaces will live here.
 */

/** Options for {@link ChatClient.listRoomMessages}. */
export interface ListRoomMessagesOptions {
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
