import { InvocationError, WebPubSubClient, WebPubSubClientCredential, WebPubSubClientOptions, WebPubSubDataType } from "@azure/web-pubsub-client";
import { getPagedAsyncIterator, type PagedAsyncIterableIterator, type PageSettings } from "@azure/core-paging";
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
  MemberLeftNotificationBody,
  RoomLeftNotificationBody,
} from "./generatedTypes.js";
import type {
  ChatMessage,
  OnMemberJoinedArgs,
  OnMemberLeftArgs,
  OnMessageArgs,
  OnRoomJoinedArgs,
  OnRoomLeftArgs,
} from "./events.js";
import type {
  ListRoomMessagesOptions,
  OperationOptions,
  StartOptions,
  StopOptions,
  GetRoomOptions,
  CreateRoomOptions,
  SendToRoomOptions,
  GetUserInfoOptions,
  AddUserToRoomOptions,
  RemoveUserFromRoomOptions,
} from "./options.js";

import { ERRORS, INVOCATION_NAME } from "./constant.js";
import { logger } from "./logger.js";
import { isWebPubSubClient } from "./utils.js";

class ChatError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

class PromiseCompletionSource {
  private readonly promise: Promise<void>;
  private resolvePromise!: () => void;

  public constructor() {
    this.promise = new Promise<void>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  public setResult(): void {
    this.resolvePromise();
  }

  public wait(): Promise<void> {
    return this.promise;
  }
}

class ChatClient {
  public readonly connection: WebPubSubClient;

  private readonly _emitter = new EventEmitter();
  private readonly _rooms = new Map<string, RoomInfo>();
  private _conversationIds = new Set<string>();
  private _userId: string | undefined;
  private _isStarted = false;
  private _startPromise: Promise<void> | undefined;
  // Created after the underlying connection starts so stop() can wait for the single "stopped" event.
  private _connectionStoppedTCS: PromiseCompletionSource | undefined;
  private _isConnectionStopping = false;

  /**
   * Create a `ChatClient` from a client-access URL.
   *
   * The client is constructed but not started; call `start()` (or use
   * the static `ChatClient.start(...)` factory) to authenticate.
   */
  constructor(clientAccessUrl: string, options?: WebPubSubClientOptions);
  /**
   * Create a `ChatClient` from a `WebPubSubClientCredential`.
   *
   * The client is constructed but not started; call `start()` (or use
   * the static `ChatClient.start(...)` factory) to authenticate.
   */
  constructor(credential: WebPubSubClientCredential, options?: WebPubSubClientOptions);
  /**
   * Create a `ChatClient` that reuses an existing `WebPubSubClient`.
   *
   * Passing an existing client gives `ChatClient` lifecycle ownership:
   * `start()` starts it and `stop()` stops it. The client is constructed
   * but not started; call `start()` to authenticate.
   */
  constructor(wpsClient: WebPubSubClient);

  constructor(arg1: string | WebPubSubClientCredential | WebPubSubClient, options?: WebPubSubClientOptions) {
    if (isWebPubSubClient(arg1)) {
      this.connection = arg1;
    } else if (typeof arg1 === "string") {
      this.connection = new WebPubSubClient(arg1, options);
    } else {
      this.connection = new WebPubSubClient(arg1, options);
    }
    this.connection.on("group-message", (e) => {
      this._handleNotification(e.message.data as Notification);
    });
    this.connection.on("server-message", (e) => {
      this._handleNotification(e.message.data as Notification);
    });
    this.connection.on("stopped", () => {
      this._connectionStoppedTCS?.setResult();
      this._connectionStoppedTCS = undefined;
      this._isConnectionStopping = false;
      this.resetState();
    });
  }

  private async _handleNotification(data: Notification): Promise<void> {
    if (!this._isStarted && !this._startPromise) {
      return;
    }
    logger.info("Received notification:", data);
    try {
      const type = data.notificationType;
      switch (type) {
        case "MessageCreated": {
          const body = data.body as NewMessageNotificationBody;
          if (!body.conversation.roomId) {
            logger.warning(
              `MessageCreated notification missing roomId; skipping emit. conversationId=${body.conversation.conversationId}`,
            );
            break;
          }
          const event: OnMessageArgs = {
            roomId: body.conversation.roomId,
            message: body.message as ChatMessage,
          };
          this._emitter.emit("message", event);
          break;
        }
        case "RoomJoined": {
          const roomInfo = data.body as NewRoomNotificationBody as RoomInfo;
          // Add to _rooms first so listeners can use listRoomMessages
          this._rooms.set(roomInfo.roomId, roomInfo);
          const event: OnRoomJoinedArgs = { room: roomInfo };
          this._emitter.emit("room-joined", event);
          break;
        }
        case "RoomMemberJoined": {
          const body = data.body as MemberJoinedNotificationBody;
          const event: OnMemberJoinedArgs = { roomId: body.roomId, title: body.title, userId: body.userId };
          this._emitter.emit("member-joined", event);
          break;
        }
        // someone (not self) left a specific room
        case "RoomMemberLeft": {
          const body = data.body as MemberLeftNotificationBody;
          const event: OnMemberLeftArgs = { roomId: body.roomId, title: body.title, userId: body.userId };
          this._emitter.emit("member-left", event);
          break;
        }
        // self left a specific room
        case "RoomLeft": {
          const body = data.body as RoomLeftNotificationBody;
          if (!this._rooms.has(body.roomId)) {
            break;
          }
          const event: OnRoomLeftArgs = { roomId: body.roomId, title: body.title };
          this._emitter.emit("room-left", event);
          this._rooms.delete(body.roomId);
          break;
        }
        case "MessageUpdated":
        case "MessageDeleted":
        case "RoomClosed":
        case "AddContact":
          logger.warning(`Known notification type ${type} received but not implemented yet.`);
          break;
        default:
          logger.warning(`Unknown notification type received: ${type}`);
      }
    }
    catch (err) {
      logger.error(`Error processing notification, error = ${err}, data: `, data);
    }
  }

  /** Invoke server event and return typed data */
  private async invokeWithReturnType<T>(
    eventName: string,
    payload: any,
    dataType: WebPubSubDataType,
    options?: OperationOptions,
  ): Promise<T> {
    logger.verbose(`invoke event: '${eventName}', dataType: ${dataType}, payload:`, payload);
    try {
      const rawResponse = await this.connection.invokeEvent(eventName, payload, dataType, {
        abortSignal: options?.abortSignal,
      });
      logger.verbose(`invoke response for '${eventName}':`, rawResponse);
      const data = rawResponse.data as any;
      if (data && typeof data === "object" && typeof data.code === "string") {
        throw new ChatError(`Invocation of event "${eventName}" failed: ${data.code}`, data.code);
      }
      return data as T;
    } catch (e) {
      if (e instanceof ChatError) throw e;
      if (e instanceof InvocationError && e.errorDetail?.name) {
        throw new ChatError(e.message, e.errorDetail.name);
      }
      throw e;
    }
  }

  /**
   * Create a chat client and `start()` it in one step.
   *
   * Construction options for the underlying transport and the cancellation
   * token for the start operation are kept as **separate parameters** so
   * they never collide at the type level. `webPubSubClientOptions` is the
   * full `WebPubSubClientOptions` bag (`protocol`, `autoReconnect`,
   * `reconnectRetryOptions`, keep-alive intervals, ...). `options` is the
   * same {@link StartOptions} the instance `start()` accepts.
   *
   * ```ts
   * // Most callers only need the URL.
   * const chat = await ChatClient.start(url);
   *
   * // Customise the transport, then start.
   * const chat = await ChatClient.start(
   *   url,
   *   { autoReconnect: false, reconnectRetryOptions: { maxRetries: 5 } },
   *   { abortSignal },
   * );
   *
   * // Already have a WebPubSubClient? Hand it in directly.
   * const chat = await ChatClient.start(wpsClient, { abortSignal });
   * ```
   *
   * Why two parameters instead of an intersection? `WebPubSubClientOptions`
   * ships from a separate package (`@azure/web-pubsub-client`) on its own
   * release cadence, so intersecting it with our `StartOptions` would be
   * fragile against upstream field additions (most obviously `abortSignal`).
   * Keeping the two bags positional preserves the full set of
   * construction knobs without exposing the intersection.
   */
  public static async start(
    clientAccessUrl: string,
    webPubSubClientOptions?: WebPubSubClientOptions,
    options?: StartOptions,
  ): Promise<ChatClient>;
  public static async start(
    credential: WebPubSubClientCredential,
    webPubSubClientOptions?: WebPubSubClientOptions,
    options?: StartOptions,
  ): Promise<ChatClient>;
  public static async start(wpsClient: WebPubSubClient, options?: StartOptions): Promise<ChatClient>;
  public static async start(
    arg1: string | WebPubSubClientCredential | WebPubSubClient,
    arg2?: WebPubSubClientOptions | StartOptions,
    arg3?: StartOptions,
  ): Promise<ChatClient> {
    let chatClient: ChatClient;
    let startOptions: StartOptions | undefined;
    if (isWebPubSubClient(arg1)) {
      chatClient = new ChatClient(arg1);
      startOptions = arg2 as StartOptions | undefined;
    } else if (typeof arg1 === "string") {
      chatClient = new ChatClient(arg1, arg2 as WebPubSubClientOptions | undefined);
      startOptions = arg3;
    } else {
      chatClient = new ChatClient(arg1, arg2 as WebPubSubClientOptions | undefined);
      startOptions = arg3;
    }
    await chatClient.start({ abortSignal: startOptions?.abortSignal });
    return chatClient;
  }

  /**
   * Connect the underlying transport and authenticate with the chat
   * service.
   *
   * Idempotent: concurrent calls share a single in-flight promise, and
   * calls made on an already-started client resolve immediately. After
   * `stop()` the client can be started again; state from the previous
   * session is reset.
   *
   * @param options - Cancellation token for the start operation. Aborting
   *   leaves the client in its initial (not-started) state.
   */
  public async start(options?: StartOptions): Promise<void> {
    if (this._startPromise) return this._startPromise;
    if (this._isStarted) return;

    if (this._connectionStoppedTCS && this._isConnectionStopping) {
      await this._connectionStoppedTCS.wait();
      // Another caller waiting on the same stop may have already started the restart.
      if (this._startPromise) return this._startPromise;
      if (this._isStarted) return;
    }

    const startPromise = this.startCore(options);
    this._startPromise = startPromise;
    try {
      await startPromise;
    } finally {
      if (this._startPromise === startPromise) {
        this._startPromise = undefined;
      }
    }
  }

  private async startCore(options?: StartOptions): Promise<void> {
    this.resetState();
    try {
      await this.connection.start({ abortSignal: options?.abortSignal });
      this._connectionStoppedTCS = new PromiseCompletionSource();
      this._isConnectionStopping = false;

      const loginResponse = await this.invokeWithReturnType<UserProfile>(
        INVOCATION_NAME.LOGIN,
        "",
        "text",
        options,
      );
      logger.info("loginResponse", loginResponse);
      const conversationIds = new Set(loginResponse.conversationIds || []);
      const roomInfos = await Promise.all(
        (loginResponse.roomIds || []).map(async (roomId) => {
          const roomInfo = await this.invokeWithReturnType<RoomInfoWithMembers>(
            INVOCATION_NAME.GET_ROOM,
            { id: roomId, withMembers: false },
            "json",
            options,
          );
          return { roomId, roomInfo };
        }),
      );

      this._userId = loginResponse.userId;
      this._conversationIds = conversationIds;
      roomInfos.forEach(({ roomId, roomInfo }) => {
        this._rooms.set(roomId, roomInfo);
      });
      this._isStarted = true;
    } catch (err) {
      this.resetState();
      await this.stopConnection();
      throw err;
    }
  }

  private ensureStarted(): void {
    if (!this._isStarted) {
      throw new ChatError("Not started. Please call start() first.", ERRORS.NotStarted);
    }
  }

  public async getUserInfo(userId: string, options?: GetUserInfoOptions): Promise<UserProfile> {
    this.ensureStarted();
    return this.invokeWithReturnType<UserProfile>(
      INVOCATION_NAME.GET_USER_PROPERTIES,
      { userId: userId },
      "json",
      options,
    );
  }

  private async sendToConversation(
    conversationId: string,
    message: string,
    options?: OperationOptions,
  ): Promise<string> {
    this.ensureStarted();
    const payload = {
      conversation: { conversationId: conversationId },
      content: message,
    };
    const resp = await this.invokeWithReturnType<SendMessageResponse>(
      INVOCATION_NAME.SEND_TEXT_MESSAGE,
      payload,
      "json",
      options,
    );
    if (!resp || !resp.id) {
      throw new ChatError(
        `Failed to send message to conversation ${conversationId}, got invalid invoke response: ${JSON.stringify(resp)}`,
        ERRORS.InvalidServerResponse,
      );
    }
    const msgId = resp.id;
    const roomId = Array.from(this._rooms.values()).find((r) => r.defaultConversationId === conversationId)?.roomId;
    if (!roomId) {
      logger.warning(
        `Failed to find roomId for conversationId ${conversationId} when sending message; skipping local sender-echo emit.`,
      );
      return msgId;
    }
    // sender won't receive conversation message via notification mechanism, so emit event here
    const event: OnMessageArgs = {
      roomId,
      message: {
        messageId: msgId,
        createdBy: this.userId,
        messageBodyType: "Inline",
        content: {
          text: message,
          binary: null,
        },
      } as ChatMessage,
    };
    this._emitter.emit("message", event);
    return msgId;
  }

  public async sendToRoom(roomId: string, message: string, options?: SendToRoomOptions): Promise<string> {
    this.ensureStarted();
    const conversationId = this._rooms.get(roomId)?.defaultConversationId;
    if (!conversationId) {
      throw new ChatError(`Failed to sendToRoom, not found roomId ${roomId}`, ERRORS.UnknownRoom);
    }
    return await this.sendToConversation(conversationId, message, options);
  }

  /**
   * Fetch the latest service-side view of a room.
   *
   * @param roomId - Room to query.
   * @param options - Optional `{ withMembers, abortSignal }`. When
   *   `withMembers` is `true` the returned `members` array is
   *   populated; defaults to `false` to save a round-trip.
   */
  public async getRoom(roomId: string, options?: GetRoomOptions): Promise<RoomInfoWithMembers> {
    this.ensureStarted();
    return this.invokeWithReturnType<RoomInfoWithMembers>(
      INVOCATION_NAME.GET_ROOM,
      { id: roomId, withMembers: options?.withMembers ?? false },
      "json",
      options,
    );
  }

  /**
   * Create a room and its initial members. The current user is always
   * included in the resulting member list.
   *
   * @param title - Display title for the room.
   * @param members - Other user ids to invite. The caller is added
   *   automatically; duplicates are de-duplicated.
   * @param options - Optional `{ roomId, abortSignal }`. Pass `roomId`
   *   to choose an id explicitly; omit to let the service assign one.
   */
  public async createRoom(
    title: string,
    members: string[],
    options?: CreateRoomOptions,
  ): Promise<RoomInfoWithMembers> {
    this.ensureStarted();
    let roomDetails = {
      title: title,
      members: [...new Set([...members, this.userId])], // deduplicate and add self
    } as any;
    if (options?.roomId) {
      roomDetails = { ...roomDetails, roomId: options.roomId };
    }
    const roomInfo = await this.invokeWithReturnType<RoomInfoWithMembers>(
      INVOCATION_NAME.CREATE_ROOM,
      roomDetails,
      "json",
      options,
    );
    this._rooms.set(roomInfo.roomId, roomInfo);
    const event: OnRoomJoinedArgs = { room: roomInfo };
    this._emitter.emit("room-joined", event);
    return roomInfo;
  }

  private async manageRoomMember(
    request: ManageRoomMemberRequest,
    options?: OperationOptions,
  ): Promise<void> {
    await this.invokeWithReturnType<any>(INVOCATION_NAME.MANAGE_ROOM_MEMBER, request, "json", options);
  }

  private async ensureRoomCached(roomId: string, options?: OperationOptions): Promise<void> {
    if (this._rooms.has(roomId)) {
      return;
    }
    const roomInfo = await this.getRoom(roomId, options);
    this._rooms.set(roomId, roomInfo);
  }

  /** Add a user to a room. This is an admin operation where one user adds another user to a room. */
  public async addUserToRoom(roomId: string, userId: string, options?: AddUserToRoomOptions): Promise<void> {
    this.ensureStarted();
    const payload: ManageRoomMemberRequest = { roomId: roomId, operation: "Add", userId: userId };
    const isSelf = userId === this.userId;
    // If self-add succeeds but no RoomJoined notification arrives, fetch room info
    // from the service so sendToRoom can use its conversation id.
    const shouldCacheRoomAfterSelfAdd = isSelf && !this._rooms.has(roomId);
    try {
      await this.manageRoomMember(payload, options);
    } catch (error) {
      if (!isSelf || !(error instanceof ChatError && error.code === ERRORS.UserAlreadyInRoom)) {
        throw error;
      }
    }
    if (shouldCacheRoomAfterSelfAdd) {
      await this.ensureRoomCached(roomId, options);
    }
  }

  /** Remove a user from a room. This is an admin operation where one user removes another user from a room. */
  public async removeUserFromRoom(roomId: string, userId: string, options?: RemoveUserFromRoomOptions): Promise<void> {
    this.ensureStarted();
    const payload: ManageRoomMemberRequest = { roomId: roomId, operation: "Delete", userId: userId };
    await this.manageRoomMember(payload, options);
    // RoomLeft notification is not guaranteed for server-managed membership;
    // eagerly clean up local cache and emit RoomLeft so callers see consistent state immediately.
    if (userId === this.userId) {
      const roomInfo = this._rooms.get(roomId);
      if (roomInfo) {
        this._rooms.delete(roomId);
        const event: OnRoomLeftArgs = { roomId, title: roomInfo.title };
        this._emitter.emit("room-left", event);
      }
    }
  }

  /**
   * List messages in a room as a paged async iterator.
   *
   * The iterator transparently fetches additional pages from the
   * service as you iterate. For Teams-style infinite scrolling, drive
   * the iterator one page at a time via `byPage(...)`:
   *
   * @example Stream every message (e.g. for export or full sync):
   * ```ts
   * for await (const msg of client.listRoomMessages({ roomId })) {
   *   console.log(msg.content.text);
   * }
   * ```
   *
   * @example Load history one page at a time (Teams-style scroll-back):
   * ```ts
   * // Load up to 50 messages per page.
   * const pages = client.listRoomMessages({ roomId }).byPage({ maxPageSize: 50 });
   * const first = await pages.next();
   * displayMessages(first.value);
   * // later, when the user scrolls up:
   * const more = await pages.next();
   * displayMessages(more.value);
   * ```
   *
   * The room must be one this client has created or joined.
   */
  public listRoomMessages(options: ListRoomMessagesOptions): PagedAsyncIterableIterator<MessageInfo> {
    this.ensureStarted();
    const conversationId = this._rooms.get(options.roomId)?.defaultConversationId;
    if (!conversationId) {
      throw new ChatError(`Failed to listRoomMessages, not found roomId ${options.roomId}`, ERRORS.UnknownRoom);
    }

    const defaultPageSize = options.maxPageSize ?? 100;
    const firstPageLink: MessageRangeQuery = {
      conversation: { conversationId },
      start: options.startId ?? null,
      end: options.endId ?? null,
      maxCount: defaultPageSize,
    };

    const fetchPage = async (
      link: MessageRangeQuery,
      maxPageSize?: number,
    ): Promise<{ page: MessageInfo[]; nextPageLink?: MessageRangeQuery } | undefined> => {
      const query: MessageRangeQuery = {
        ...link,
        maxCount: maxPageSize ?? link.maxCount ?? defaultPageSize,
      };
      const result = await this.invokeWithReturnType<{ messages: MessageInfo[]; nextQuery: MessageRangeQuery | null }>(
        INVOCATION_NAME.LIST_MESSAGES,
        query,
        "json",
        { abortSignal: options.abortSignal },
      );
      if (result.messages.length === 0) {
        return undefined;
      }
      return { page: result.messages, nextPageLink: result.nextQuery ?? undefined };
    };

    return getPagedAsyncIterator<MessageInfo, MessageInfo[], PageSettings, MessageRangeQuery>({
      firstPageLink,
      getPage: (link, maxPageSize) => fetchPage(link, maxPageSize),
    });
  }

  /** Cached rooms known to the client. */
  public get rooms(): RoomInfo[] {
    return Array.from(this._rooms.values());
  }

  /** Whether the current client has the room in its local joined-room cache. */
  public hasJoinedRoom(roomId: string): boolean {
    return this._rooms.has(roomId);
  }

  public get userId(): string {
    if (!this._userId) {
      throw new ChatError("User ID is not set. Please call start() first.", ERRORS.NotStarted);
    }
    return this._userId;
  }

  /**
   * Subscribe to a chat-client event.
   *
   * Mirrors the underlying `WebPubSubClient.on(event, listener)` shape:
   * one explicit overload per event, returns `void`, paired with
   * `off(event, listener)` for removal. Pass the same callback
   * reference to `off()` to unsubscribe.
   *
   * Connection-lifecycle events (`connected`, `disconnected`, `stopped`)
   * are not exposed here — subscribe via
   * `chatClient.connection.on("connected", ...)` etc.
   *
   * @example
   * ```ts
   * const onMsg = (e: OnMessageArgs) => console.log(e.message.content.text);
   * client.on("message", onMsg);
   * // later
   * client.off("message", onMsg);
   * ```
   */
  public on(event: "message",       listener: (e: OnMessageArgs)      => void): void;
  public on(event: "room-joined",   listener: (e: OnRoomJoinedArgs)   => void): void;
  public on(event: "room-left",     listener: (e: OnRoomLeftArgs)     => void): void;
  public on(event: "member-joined", listener: (e: OnMemberJoinedArgs) => void): void;
  public on(event: "member-left",   listener: (e: OnMemberLeftArgs)   => void): void;
  public on(event: string, listener: (e: any) => void): void {
    this._emitter.on(event, listener);
  }

  /** Remove a listener previously registered with `on()`. */
  public off(event: "message",       listener: (e: OnMessageArgs)      => void): void;
  public off(event: "room-joined",   listener: (e: OnRoomJoinedArgs)   => void): void;
  public off(event: "room-left",     listener: (e: OnRoomLeftArgs)     => void): void;
  public off(event: "member-joined", listener: (e: OnMemberJoinedArgs) => void): void;
  public off(event: "member-left",   listener: (e: OnMemberLeftArgs)   => void): void;
  public off(event: string, listener: (e: any) => void): void {
    this._emitter.off(event, listener);
  }

  /**
   * Stop the underlying connection and reset client state. Idempotent.
   *
   * After resolution the client returns to its initial state and may
   * be started again via `start()`. Callers that want the same identity
   * should keep their authentication source (URL or credential)
   * constant.
   *
   * @param _options - Reserved for symmetry with other operations.
   *   Stopping is a local-state cleanup that does not perform a network
   *   round-trip and is therefore not cancellable today.
   */
  public async stop(_options?: StopOptions): Promise<void> {
    const startPromise = this._startPromise;
    if (startPromise) {
      await startPromise.catch(() => undefined);
    }
    this._startPromise = undefined;

    this.resetState();
    await this.stopConnection();
  }

  private resetState(): void {
    this._isStarted = false;
    this._userId = undefined;
    this._rooms.clear();
    this._conversationIds.clear();
  }

  private async stopConnection(): Promise<void> {
    const connectionStoppedTCS = this._connectionStoppedTCS;
    if (!connectionStoppedTCS) {
      return;
    }

    if (!this._isConnectionStopping) {
      this._isConnectionStopping = true;
      try {
        this.connection.stop();
      } catch (err) {
        this._isConnectionStopping = false;
        throw err;
      }
    }
    await connectionStoppedTCS.wait();
  }
}

export { ChatClient, ChatError };
