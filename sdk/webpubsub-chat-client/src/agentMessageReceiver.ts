import type { GroupStreamMessage } from "@azure/web-pubsub-client";

import type { ChatMessage } from "./events.js";
import { logger } from "./logger.js";
import type {
  DecodedMessage,
  EmitChatMessage,
  MessageDecoder,
  MessageDecoderInput,
} from "./messageCodec.js";
import type { MessageContentItem } from "./models.js";

/** One normalized agent item emitted by the receiver. */
interface AgentMessageItem extends MessageDecoderInput {
  readonly kind: "item";
}

/** One persisted-message checkpoint emitted by the writer. */
export interface AgentMessageCheckpoint {
  readonly kind: "checkpoint";
  readonly messageId: string;
  readonly etag: string;
}

type AgentMessageReceiverOutput = AgentMessageItem | AgentMessageCheckpoint;

/**
 * Normalizes live group-stream frames and historical chat messages into the
 * same per-item representation. It does not interpret codec semantics.
 */
export class AgentMessageReceiver {
  private readonly _dataByItemId = new Map<number, string>();
  private readonly _metadataByItemId = new Map<
    number,
    Readonly<Record<string, string>> | null
  >();
  private _current?: DecodedMessage;
  private _chatMessage: ChatMessage;

  public constructor(
    chatMessage: ChatMessage,
    private readonly _decoder: MessageDecoder,
    private readonly _emit: EmitChatMessage,
  ) {
    this._chatMessage = chatMessage;
  }

  public get messageId(): string {
    return this._chatMessage.messageId;
  }

  public receiveLive(message: GroupStreamMessage): void {
    const output = readAgentLiveMessage(message, this.messageId);
    if (!output) {
      return;
    }
    if (output.kind === "checkpoint") {
      logger.warning(`Ignoring unimplemented checkpoint for message '${this.messageId}'.`);
      return;
    }
    this._receiveItem({
      messageId: output.messageId,
      itemId: output.itemId,
      data: output.data,
      metadata: output.metadata,
    }, true);
  }

  public receiveHistory(): ChatMessage {
    const content = this._chatMessage.content as unknown as {
      items?: readonly HistoryAgentItem[] | null;
    };
    const items = (content.items ?? []).flatMap((item, itemId): MessageDecoderInput[] => {
      if (item.type !== undefined && item.type !== "Text") {
        logger.warning(
          `Ignoring agent history item '${itemId}' for message '${this.messageId}' with unknown content type '${String(item.type)}'.`,
        );
        return [];
      }
      if (
        item.content?.text !== undefined
        && item.content.text !== null
        && typeof item.content.text !== "string"
      ) {
        logger.warning(
          `Ignoring agent history item '${itemId}' for message '${this.messageId}' with invalid text content.`,
        );
        return [];
      }
      const meta = item.metadata?.custom;
      if (meta !== undefined && meta !== null && !isStringRecord(meta)) {
        logger.warning(
          `Ignoring agent history item '${itemId}' for message '${this.messageId}' with invalid metadata.`,
        );
        return [];
      }
      return [{
        messageId: this.messageId,
        itemId,
        data: item.content?.text ?? "",
        metadata: meta,
      }];
    });
    for (const item of items) {
      this._receiveItem(item, false);
    }
    return this._createMessage(
      this._current === undefined ? undefined : { ...this._current, delta: undefined },
    );
  }

  private _receiveItem(item: MessageDecoderInput, emit: boolean): void {
    const data = (this._dataByItemId.get(item.itemId) ?? "") + item.data;
    this._dataByItemId.set(item.itemId, data);
    if (item.metadata !== undefined) {
      this._metadataByItemId.set(item.itemId, item.metadata);
    }
    this._updateChatMessageItems();

    const decodedMessages = this._decoder.decode(item);
    const current = decodedMessages.at(-1);
    if (current !== undefined) {
      this._current = current;
    }
    for (const decoded of decodedMessages) {
      if (emit) {
        this._emit(this._createMessage(decoded));
      }
    }
  }

  private _createMessage(decodedMessage = this._current): ChatMessage {
    return decodedMessage === undefined
      ? this._chatMessage
      : { ...this._chatMessage, decodedMessage };
  }

  private _updateChatMessageItems(): void {
    const items: MessageContentItem[] = [...this._dataByItemId.entries()]
      .sort(([left], [right]) => left - right)
      .map(([itemId, text]) => ({
        type: "Text",
        content: { text },
        metadata: toContentItemMetadata(this._metadataByItemId.get(itemId)),
        isAttachment: false,
      }));
    this._chatMessage = {
      ...this._chatMessage,
      content: { items },
    };
  }
}

interface AgentLiveMessage {
  itemId: number;
  data: string;
  metadata?: Record<string, string> | null;
}

interface MessageItemNotification {
  operation: "MessageItem";
  body: AgentLiveMessage;
}

interface MessageCheckPointNotification {
  operation: "MessageCheckPoint";
  body: {
    itemIndex?: number | null;
    etag: string;
  };
}

interface HistoryAgentItem {
  type?: unknown;
  content?: {
    text?: unknown;
  };
  metadata?: {
    custom?: unknown;
  } | null;
}

function readAgentLiveMessage(
  message: GroupStreamMessage,
  messageId: string,
): AgentMessageReceiverOutput | undefined {
  if (message.dataType !== "json") {
    logger.warning(
      `Ignoring agent stream message for '${messageId}' with unknown data type '${message.dataType}'.`,
    );
    return undefined;
  }
  if (!isRecord(message.data)) {
    logger.warning(`Ignoring malformed agent stream message for '${messageId}'.`);
    return undefined;
  }
  const envelope = message.data;
  if (!isRecord(envelope.body)) {
    logger.warning(`Ignoring malformed agent stream message for '${messageId}' without a body.`);
    return undefined;
  }
  const body = envelope.body;
  if (envelope.operation === "MessageCheckPoint") {
    if (typeof body.etag !== "string") {
      logger.warning(`Ignoring malformed agent checkpoint for message '${messageId}'.`);
      return undefined;
    }
    const checkpoint = (envelope as unknown as MessageCheckPointNotification).body;
    return { kind: "checkpoint", messageId, ...checkpoint };
  }
  if (envelope.operation !== "MessageItem") {
    logger.warning(
      `Ignoring agent stream message for '${messageId}' with unknown operation '${String(envelope.operation)}'.`,
    );
    return undefined;
  }
  if (
    !Number.isInteger(body.itemId)
    || (body.itemId as number) < 0
    || typeof body.data !== "string"
    || (body.metadata !== undefined && body.metadata !== null && !isStringRecord(body.metadata))
  ) {
    logger.warning(`Ignoring malformed agent item for message '${messageId}'.`);
    return undefined;
  }
  const item = (envelope as unknown as MessageItemNotification).body;
  return {
    kind: "item",
    messageId,
    itemId: item.itemId,
    data: item.data,
    metadata: item.metadata,
  };
}

function toContentItemMetadata(
  metadata: Readonly<Record<string, string>> | null | undefined,
): { custom?: Record<string, string> | null } | undefined {
  return metadata === undefined
    ? undefined
    : { custom: metadata === null ? null : { ...metadata } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
