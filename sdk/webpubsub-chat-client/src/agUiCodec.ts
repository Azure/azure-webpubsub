import {
  EventSchemas,
  EventType,
  type AGUIEvent,
  type TextMessageContentEvent,
  type ToolCallArgsEvent,
  type ReasoningMessageContentEvent,
} from "@ag-ui/core";

import type {
  DecodedMessage,
  MessageCodec,
  MessageDecoder,
  MessageDecoderInput,
} from "./messageCodec.js";
import { logger } from "./logger.js";

export const agUiCodecKind = "ag-ui-codec-v1";

const eventTypeMetadataKey = "ag-ui.eventType";
const toolCallNameMetadataKey = "ag-ui.toolCallName";
const streamingStatusMetadataKey = "x-ms-agent-streaming-status";
const streamingStatus = "streaming";
const completedStatus = "completed";
const textMessageKind = "text_message";
const toolCallKind = "tool_call";
const reasoningMessageKind = "reasoning_message";
const knownMetadataTags = new Set([
  eventTypeMetadataKey,
  toolCallNameMetadataKey,
  streamingStatusMetadataKey,
]);

export interface AgUiDecodedMessage extends DecodedMessage {
  readonly codecKind: "ag-ui-codec-v1";
  readonly delta: AGUIEvent | undefined;
  /** AG-UI events decoded for this chat message, in replay order. */
  readonly accumulated: readonly AGUIEvent[];
}

interface ItemTracker {
  emittedStart: boolean;
  emittedEnd: boolean;
  emittedDiscrete: boolean;
  ignored: boolean;
  meta?: Readonly<Record<string, string>> | null;
}

/** Creates message-scoped AG-UI decoders. */
export class AgUiMessageCodec implements MessageCodec {
  public readonly codecKind = agUiCodecKind;

  public createDecoder(messageId: string): MessageDecoder {
    return new AgUiMessageDecoder(messageId);
  }
}

/** Message-scoped decoder for the runtime's compact AG-UI storage codec. */
export class AgUiMessageDecoder implements MessageDecoder {
  public readonly codecKind = agUiCodecKind;
  private readonly _accumulatedEvents: AGUIEvent[] = [];
  private readonly _dataByItemId = new Map<number, string>();
  private readonly _trackers = new Map<number, ItemTracker>();

  public constructor(public readonly messageId: string) {}

  public decode(item: MessageDecoderInput): readonly AgUiDecodedMessage[] {
    if (item.messageId !== this.messageId) {
      throw new Error(
        `AG-UI decoder '${this.messageId}' cannot decode item for message '${item.messageId}'.`,
      );
    }

    const decoded: AgUiDecodedMessage[] = [];
    for (const event of this._decodeItem(item)) {
      this._accumulateEvent(event);
      decoded.push(this._createDecodedMessage(event));
    }
    return decoded;
  }

  private _decodeItem(item: MessageDecoderInput): AGUIEvent[] {
    const tracker = this._trackers.get(item.itemId) ?? {
      emittedStart: false,
      emittedEnd: false,
      emittedDiscrete: false,
      ignored: false,
    };
    this._trackers.set(item.itemId, tracker);

    const accumulatedData = (this._dataByItemId.get(item.itemId) ?? "") + item.data;
    this._dataByItemId.set(item.itemId, accumulatedData);
    if (item.metadata !== undefined) {
      tracker.meta = item.metadata;
      this._logUnknownMetadataTags(item);
    }

    if (tracker.ignored) {
      return [];
    }
    if (!tracker.meta) {
      return this._ignoreItem(item, tracker, "missing metadata");
    }
    const eventType = tracker.meta[eventTypeMetadataKey];
    if (!eventType) {
      return this._ignoreItem(
        item,
        tracker,
        `missing metadata tag '${eventTypeMetadataKey}'`,
      );
    }
    switch (eventType) {
      case EventType.RUN_STARTED:
      case EventType.RUN_FINISHED:
      case EventType.RUN_ERROR:
        if (tracker.emittedDiscrete) {
          throw new Error(`AG-UI discrete item '${item.itemId}' was received more than once.`);
        }
        tracker.emittedDiscrete = true;
        return [parseAgUiEvent(accumulatedData, eventType)];
      case textMessageKind:
      case toolCallKind:
      case reasoningMessageKind:
        return this._decodeStreamItem(item, tracker, eventType, tracker.meta);
      default:
        return this._ignoreItem(item, tracker, `unknown event type '${eventType}'`);
    }
  }

  private _decodeStreamItem(
    item: MessageDecoderInput,
    tracker: ItemTracker,
    kind: typeof textMessageKind | typeof toolCallKind | typeof reasoningMessageKind,
    meta: Readonly<Record<string, string>>,
  ): AGUIEvent[] {
    if (tracker.emittedEnd) {
      throw new Error(`AG-UI stream item '${item.itemId}' received data after completion.`);
    }
    const status = meta[streamingStatusMetadataKey];
    if (!status) {
      return this._ignoreItem(
        item,
        tracker,
        `missing metadata tag '${streamingStatusMetadataKey}'`,
      );
    }
    if (status !== streamingStatus && status !== completedStatus) {
      return this._ignoreItem(
        item,
        tracker,
        `unknown '${streamingStatusMetadataKey}' value '${status}'`,
      );
    }
    if (kind === toolCallKind && !meta[toolCallNameMetadataKey]) {
      return this._ignoreItem(
        item,
        tracker,
        `missing metadata tag '${toolCallNameMetadataKey}'`,
      );
    }

    const id = this._createItemId(item.itemId);
    const events: AGUIEvent[] = [];
    if (!tracker.emittedStart) {
      events.push(...createStreamStartEvents(kind, id, meta));
      tracker.emittedStart = true;
    }
    if (item.data.length > 0) {
      events.push(createStreamContentEvent(kind, id, item.data));
    }
    if (status === completedStatus) {
      events.push(...createStreamEndEvents(kind, id));
      tracker.emittedEnd = true;
    }
    return events;
  }

  private _logUnknownMetadataTags(item: MessageDecoderInput): void {
    for (const tag of Object.keys(item.metadata ?? {})) {
      if (knownMetadataTags.has(tag)) {
        continue;
      }
      logger.warning(
        `Ignoring unknown AG-UI metadata tag '${tag}' on item '${item.itemId}' for message '${this.messageId}'.`,
      );
    }
  }

  private _ignoreItem(
    item: MessageDecoderInput,
    tracker: ItemTracker,
    reason: string,
  ): AGUIEvent[] {
    tracker.ignored = true;
    logger.warning(
      `Ignoring AG-UI item '${item.itemId}' for message '${this.messageId}': ${reason}.`,
    );
    return [];
  }

  private _createItemId(itemId: number): string {
    return `${this.messageId}:${itemId}`;
  }

  private _accumulateEvent(event: AGUIEvent): void {
    const index = this._findAccumulatedDelta(event);
    if (index === -1) {
      this._accumulatedEvents.push(event);
      return;
    }

    const accumulated = this._accumulatedEvents[index];
    if (
      !accumulated
      || !("delta" in accumulated)
      || typeof accumulated.delta !== "string"
      || !("delta" in event)
      || typeof event.delta !== "string"
    ) {
      this._accumulatedEvents.push(event);
      return;
    }
    this._accumulatedEvents[index] = {
      ...accumulated,
      delta: accumulated.delta + event.delta,
    } as AGUIEvent;
  }

  private _findAccumulatedDelta(event: AGUIEvent): number {
    for (let index = this._accumulatedEvents.length - 1; index >= 0; index--) {
      const candidate = this._accumulatedEvents[index];
      if (!candidate) {
        continue;
      }
      switch (event.type) {
        case EventType.TEXT_MESSAGE_CONTENT:
          if (
            candidate.type === EventType.TEXT_MESSAGE_CONTENT
            && candidate.messageId === event.messageId
          ) {
            return index;
          }
          break;
        case EventType.TOOL_CALL_ARGS:
          if (
            candidate.type === EventType.TOOL_CALL_ARGS
            && candidate.toolCallId === event.toolCallId
          ) {
            return index;
          }
          break;
        case EventType.REASONING_MESSAGE_CONTENT:
          if (
            candidate.type === EventType.REASONING_MESSAGE_CONTENT
            && candidate.messageId === event.messageId
          ) {
            return index;
          }
          break;
        default:
          return -1;
      }
    }
    return -1;
  }

  private _createDecodedMessage(delta: AGUIEvent | undefined): AgUiDecodedMessage {
    return {
      codecKind: agUiCodecKind,
      delta,
      accumulated: [...this._accumulatedEvents],
    };
  }
}

function createStreamStartEvents(
  kind: typeof textMessageKind | typeof toolCallKind | typeof reasoningMessageKind,
  id: string,
  meta: Readonly<Record<string, string>>,
): AGUIEvent[] {
  switch (kind) {
    case textMessageKind:
      return [{ type: EventType.TEXT_MESSAGE_START, messageId: id, role: "assistant" }];
    case toolCallKind:
      return [{
        type: EventType.TOOL_CALL_START,
        toolCallId: id,
        toolCallName: meta[toolCallNameMetadataKey]!,
      }];
    case reasoningMessageKind:
      return [
        { type: EventType.REASONING_START, messageId: id },
        { type: EventType.REASONING_MESSAGE_START, messageId: id, role: "reasoning" },
      ];
  }
}

function createStreamContentEvent(
  kind: typeof textMessageKind | typeof toolCallKind | typeof reasoningMessageKind,
  id: string,
  delta: string,
): TextMessageContentEvent | ToolCallArgsEvent | ReasoningMessageContentEvent {
  switch (kind) {
    case textMessageKind:
      return { type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta };
    case toolCallKind:
      return { type: EventType.TOOL_CALL_ARGS, toolCallId: id, delta };
    case reasoningMessageKind:
      return { type: EventType.REASONING_MESSAGE_CONTENT, messageId: id, delta };
  }
}

function createStreamEndEvents(
  kind: typeof textMessageKind | typeof toolCallKind | typeof reasoningMessageKind,
  id: string,
): AGUIEvent[] {
  switch (kind) {
    case textMessageKind:
      return [{ type: EventType.TEXT_MESSAGE_END, messageId: id }];
    case toolCallKind:
      return [{ type: EventType.TOOL_CALL_END, toolCallId: id }];
    case reasoningMessageKind:
      return [
        { type: EventType.REASONING_MESSAGE_END, messageId: id },
        { type: EventType.REASONING_END, messageId: id },
      ];
  }
}

function parseAgUiEvent(value: string, expectedType: string): AGUIEvent {
  let json: unknown;
  try {
    json = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Agent item contains invalid AG-UI event JSON.");
  }
  const parsed = EventSchemas.safeParse(json);
  if (!parsed.success || parsed.data.type !== expectedType) {
    throw new Error(`Agent item contains an invalid AG-UI '${expectedType}' event.`);
  }
  return parsed.data;
}

export type { AGUIEvent };
