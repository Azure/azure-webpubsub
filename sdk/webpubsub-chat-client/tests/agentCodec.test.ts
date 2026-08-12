import assert from "node:assert/strict";
import { test } from "node:test";
import { EventSchemas, EventType, type AGUIEvent } from "@ag-ui/core";
import type { GroupStreamMessage } from "@azure/web-pubsub-client";

import {
  AgUiMessageCodec,
  AgUiMessageDecoder,
  agUiCodecKind,
  type AgUiDecodedMessage,
} from "../src/agUiCodec.js";
import { AgentMessageReceiver } from "../src/agentMessageReceiver.js";
import { ChatClient } from "../src/chatClient.js";
import type { ChatMessage } from "../src/events.js";
import { logger } from "../src/logger.js";
import type {
  DecodedMessage,
  EmitChatMessage,
  MessageCodec,
  MessageDecoder,
  MessageDecoderInput,
} from "../src/messageCodec.js";
import type { MessageContentItem } from "../src/models.js";
import { ReceiverFactory } from "../src/receiverFactory.js";

const eventTypeTag = "ag-ui.eventType";
const toolCallNameTag = "ag-ui.toolCallName";
const streamingStatusTag = "x-ms-agent-streaming-status";

test("receiver factory selects the codec by codecKind", () => {
  const first = new RecordingCodec("codec-a");
  const second = new RecordingCodec("codec-b");
  const factory = new ReceiverFactory([first, second]);
  const message = createChatMessage([], second.codecKind);

  const received = factory.createReceiver(message, () => {})?.receiveHistory();

  assert.equal(first.messageIds.length, 0);
  assert.deepEqual(second.messageIds, [message.messageId]);
  assert.equal(received?.decodedMessage, undefined);
});

test("chat client injects AG-UI by default and supports replacing and clearing codecs", () => {
  const custom = new RecordingCodec("custom-codec");
  const client = new ChatClient(createFakeConnection(), [custom]);
  const factory = getReceiverFactory(client);

  assert.ok(factory.createReceiver(createChatMessage([]), () => {}));
  assert.ok(factory.createReceiver(createChatMessage([], custom.codecKind), () => {}));

  const replacement = new RecordingCodec(custom.codecKind);
  client.addCodec(replacement);
  factory.createReceiver(createChatMessage([], custom.codecKind), () => {});
  assert.equal(custom.messageIds.length, 1);
  assert.equal(replacement.messageIds.length, 1);

  client.clearCodec();
  const { result, warnings } = captureWarnings(() => ({
    agUi: factory.createReceiver(createChatMessage([]), () => {}),
    custom: factory.createReceiver(createChatMessage([], custom.codecKind), () => {}),
  }));
  assert.equal(result.agUi, undefined);
  assert.equal(result.custom, undefined);
  assert.equal(warnings.length, 2);

  client.addCodec(new AgUiMessageCodec());
  assert.ok(factory.createReceiver(createChatMessage([]), () => {}));
});

test("agent receiver logs and ignores unknown live message operations", () => {
  const receiver = createReceiver();
  const { warnings } = captureWarnings(() => receiver.receiveLive(
    {
      dataType: "json",
      data: { operation: "FutureOperation", body: {} },
    } as unknown as GroupStreamMessage,
  ));

  assert.ok(warnings.some((warning) => warning.includes("unknown operation 'FutureOperation'")));
});

test("agent receiver logs and ignores unknown history item types", () => {
  const message = createChatMessage([
    { type: "FutureContent", content: { text: "ignored" } },
    { type: "Text", content: { text: "accepted" } },
  ]);
  const inputs: MessageDecoderInput[] = [];
  const receiver = new AgentMessageReceiver(message, new RecordingDecoder(inputs), () => {});

  const { warnings } = captureWarnings(() => receiver.receiveHistory());

  assert.deepEqual(inputs, [{
    messageId: "42",
    itemId: 1,
    data: "accepted",
    metadata: undefined,
  }]);
  assert.ok(warnings.some((warning) => warning.includes("unknown content type 'FutureContent'")));
});

test("agent receiver normalizes live and history into the same decoder input", () => {
  const metadata = {
    [eventTypeTag]: "text_message",
    [streamingStatusTag]: "completed",
  };
  const historyInputs: MessageDecoderInput[] = [];
  const liveInputs: MessageDecoderInput[] = [];
  const historyMessage = createChatMessage([createTextItem("hello", metadata)]);

  new AgentMessageReceiver(
    historyMessage,
    new RecordingDecoder(historyInputs),
    () => {},
  ).receiveHistory();
  new AgentMessageReceiver(
    createChatMessage([]),
    new RecordingDecoder(liveInputs),
    () => {},
  ).receiveLive(createLiveItem(0, "hello", metadata));

  assert.deepEqual(liveInputs, historyInputs);
});

test("agent receiver logs and ignores unimplemented checkpoints", () => {
  const emissions: ChatMessage[] = [];
  const receiver = createReceiver(createChatMessage([]), (message) => {
    emissions.push(message);
  });

  receiver.receiveLive(createLiveItem(0, "hello", {
    [eventTypeTag]: "text_message",
    [streamingStatusTag]: "completed",
  }));
  const emissionCount = emissions.length;

  const { warnings } = captureWarnings(() => receiver.receiveLive({
      dataType: "json",
      data: { operation: "MessageCheckPoint", body: { etag: "etag-1" } },
    } as unknown as GroupStreamMessage));

  assert.equal(emissions.length, emissionCount);
  assert.ok(warnings.some((warning) => warning.includes(
    "Ignoring unimplemented checkpoint for message '42'.",
  )));
});

test("AG-UI codec logs and ignores unknown event types while decoding known items", () => {
  const message = createChatMessage([
    createTextItem("ignored", { [eventTypeTag]: "FUTURE_EVENT" }),
    createTextItem("hello", {
      [eventTypeTag]: "text_message",
      [streamingStatusTag]: "completed",
    }),
  ]);
  const receiver = createReceiver(message);

  const { result, warnings } = captureWarnings(() => receiver.receiveHistory());
  const decoded = result.decodedMessage as AgUiDecodedMessage;

  assert.deepEqual(decoded.accumulated, [
    { type: EventType.TEXT_MESSAGE_START, messageId: "42:1", role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "42:1", delta: "hello" },
    { type: EventType.TEXT_MESSAGE_END, messageId: "42:1" },
  ]);
  assert.ok(warnings.some((warning) => warning.includes("unknown event type 'FUTURE_EVENT'")));
});

test("AG-UI codec logs and ignores unknown metadata without rejecting known items", () => {
  const message = createChatMessage([
    createTextItem("ignored", {
      [eventTypeTag]: "text_message",
      [streamingStatusTag]: "future-status",
    }),
    createTextItem("accepted", {
      [eventTypeTag]: "text_message",
      [streamingStatusTag]: "completed",
      "ag-ui.future-tag": "future-value",
    }),
  ]);
  const receiver = createReceiver(message);

  const { result, warnings } = captureWarnings(() => receiver.receiveHistory());
  const decoded = result.decodedMessage as AgUiDecodedMessage;

  assert.deepEqual(decoded.accumulated, [
    { type: EventType.TEXT_MESSAGE_START, messageId: "42:1", role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "42:1", delta: "accepted" },
    { type: EventType.TEXT_MESSAGE_END, messageId: "42:1" },
  ]);
  assert.ok(warnings.some((warning) => warning.includes("future-status")));
  assert.ok(warnings.some((warning) => warning.includes("unknown AG-UI metadata tag 'ag-ui.future-tag'")));
});

test("AG-UI codec logs unknown metadata whenever it is received", () => {
  const receiver = createReceiver();
  const metadata = {
    [eventTypeTag]: "text_message",
    [streamingStatusTag]: "streaming",
    "ag-ui.future-tag": "future-value",
  };

  const { warnings } = captureWarnings(() => {
    receiver.receiveLive(createLiveItem(0, "hello", metadata));
    receiver.receiveLive(createLiveItem(0, " world", {
      ...metadata,
      [streamingStatusTag]: "completed",
    }));
  });

  assert.equal(
    warnings.filter((warning) => warning.includes("unknown AG-UI metadata tag 'ag-ui.future-tag'")).length,
    2,
  );
});

test("AG-UI codec emits the outer reasoning lifecycle around a reasoning message", () => {
  const deltas: AGUIEvent[] = [];
  const accumulated: Array<readonly AGUIEvent[]> = [];
  const receiver = createReceiver(createChatMessage([]), (message) => {
    const decoded = message.decodedMessage as AgUiDecodedMessage;
    const delta = decoded.delta;
    if (delta) {
      deltas.push(delta);
      accumulated.push(decoded.accumulated);
    }
  });

  receiver.receiveLive(createLiveItem(0, "thinking", {
    [eventTypeTag]: "reasoning_message",
    [streamingStatusTag]: "completed",
  }));

  assert.deepEqual(deltas.map((event) => event.type), [
    EventType.REASONING_START,
    EventType.REASONING_MESSAGE_START,
    EventType.REASONING_MESSAGE_CONTENT,
    EventType.REASONING_MESSAGE_END,
    EventType.REASONING_END,
  ]);
  assert.ok(deltas.every((event) => "messageId" in event && event.messageId === "42:0"));
  assert.deepEqual(accumulated.at(-1), deltas);
  assert.deepEqual(accumulated.map((events) => events.length), [1, 2, 3, 4, 5]);
});

test("AG-UI codec combines live deltas in the accumulated event stream", () => {
  const emissions: AgUiDecodedMessage[] = [];
  const receiver = createReceiver(createChatMessage([]), (message) => {
    emissions.push(message.decodedMessage as AgUiDecodedMessage);
  });
  const metadata = {
    [eventTypeTag]: "text_message",
    [streamingStatusTag]: "streaming",
  };

  receiver.receiveLive(createLiveItem(0, "hel", metadata));
  receiver.receiveLive(createLiveItem(0, "lo", {
    ...metadata,
    [streamingStatusTag]: "completed",
  }));

  const contentEmissions = emissions.filter(
    (decoded) => decoded.delta?.type === EventType.TEXT_MESSAGE_CONTENT,
  );
  assert.deepEqual(contentEmissions.map((decoded) => decoded.delta), [
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "42:0", delta: "hel" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "42:0", delta: "lo" },
  ]);
  assert.deepEqual(emissions.at(-1)?.accumulated, [
    { type: EventType.TEXT_MESSAGE_START, messageId: "42:0", role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "42:0", delta: "hello" },
    { type: EventType.TEXT_MESSAGE_END, messageId: "42:0" },
  ]);
  assert.deepEqual(contentEmissions[0]?.accumulated[1], {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: "42:0",
    delta: "hel",
  });
});

test("AG-UI codec combines tool-call and reasoning deltas in accumulation", () => {
  const emissions: AgUiDecodedMessage[] = [];
  const receiver = createReceiver(createChatMessage([]), (message) => {
    emissions.push(message.decodedMessage as AgUiDecodedMessage);
  });
  const toolMetadata = {
    [eventTypeTag]: "tool_call",
    [toolCallNameTag]: "search",
    [streamingStatusTag]: "streaming",
  };
  const reasoningMetadata = {
    [eventTypeTag]: "reasoning_message",
    [streamingStatusTag]: "streaming",
  };

  receiver.receiveLive(createLiveItem(0, '{"query":', toolMetadata));
  receiver.receiveLive(createLiveItem(1, "think", reasoningMetadata));
  receiver.receiveLive(createLiveItem(0, '"azure"}', {
    ...toolMetadata,
    [streamingStatusTag]: "completed",
  }));
  receiver.receiveLive(createLiveItem(1, "ing", {
    ...reasoningMetadata,
    [streamingStatusTag]: "completed",
  }));

  const accumulated = emissions.at(-1)?.accumulated ?? [];
  assert.deepEqual(
    accumulated.find((event) => event.type === EventType.TOOL_CALL_ARGS),
    { type: EventType.TOOL_CALL_ARGS, toolCallId: "42:0", delta: '{"query":"azure"}' },
  );
  assert.deepEqual(
    accumulated.find((event) => event.type === EventType.REASONING_MESSAGE_CONTENT),
    { type: EventType.REASONING_MESSAGE_CONTENT, messageId: "42:1", delta: "thinking" },
  );
  assert.ok(accumulated.every((event) => EventSchemas.safeParse(event).success));
});

test("AG-UI codec accumulates a replayable event stream for history", () => {
  const message = createChatMessage([
    createTextItem(JSON.stringify({
      type: EventType.RUN_STARTED,
      threadId: "thread-1",
      runId: "run-1",
    }), { [eventTypeTag]: EventType.RUN_STARTED }),
    createTextItem("hello", {
      [eventTypeTag]: "text_message",
      [streamingStatusTag]: "completed",
    }),
    createTextItem('{"query":"azure"}', {
      [eventTypeTag]: "tool_call",
      [toolCallNameTag]: "search",
      [streamingStatusTag]: "completed",
    }),
    createTextItem("thinking", {
      [eventTypeTag]: "reasoning_message",
      [streamingStatusTag]: "completed",
    }),
    createTextItem(JSON.stringify({
      type: EventType.RUN_FINISHED,
      threadId: "thread-1",
      runId: "run-1",
    }), { [eventTypeTag]: EventType.RUN_FINISHED }),
  ]);
  const receiver = createReceiver(message);

  const decoded = receiver.receiveHistory().decodedMessage as AgUiDecodedMessage;

  assert.equal(decoded.delta, undefined);
  assert.deepEqual(decoded.accumulated.map((event) => event.type), [
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END,
    EventType.REASONING_START,
    EventType.REASONING_MESSAGE_START,
    EventType.REASONING_MESSAGE_CONTENT,
    EventType.REASONING_MESSAGE_END,
    EventType.REASONING_END,
    EventType.RUN_FINISHED,
  ]);
  assert.ok(decoded.accumulated.every((event) => EventSchemas.safeParse(event).success));
});

function createChatMessage(
  items: MessageContentItem[],
  codecKind: string = agUiCodecKind,
): ChatMessage {
  return {
    messageId: "42",
    messageBodyType: "ContentItems",
    content: { items },
    metadata: { codecKind },
  };
}

function createFakeConnection(): any {
  return {
    start: () => {},
    stop: () => {},
    on: () => {},
    onGroupStream: () => {},
  };
}

function getReceiverFactory(client: ChatClient): ReceiverFactory {
  return (client as unknown as { _receiverFactory: ReceiverFactory })._receiverFactory;
}

function createReceiver(
  message: ChatMessage = createChatMessage([]),
  emit: EmitChatMessage = () => {},
): AgentMessageReceiver {
  return new AgentMessageReceiver(
    message,
    new AgUiMessageDecoder(message.messageId),
    emit,
  );
}

class RecordingDecoder implements MessageDecoder {
  public constructor(
    private readonly _inputs: MessageDecoderInput[],
    public readonly codecKind: string = agUiCodecKind,
  ) {}

  public decode(item: MessageDecoderInput): readonly DecodedMessage[] {
    this._inputs.push(item);
    return [];
  }
}

class RecordingCodec implements MessageCodec {
  public readonly messageIds: string[] = [];

  public constructor(public readonly codecKind: string) {}

  public createDecoder(messageId: string): MessageDecoder {
    this.messageIds.push(messageId);
    return new RecordingDecoder([], this.codecKind);
  }
}

function createTextItem(
  text: string,
  custom: Record<string, string>,
): MessageContentItem {
  return {
    type: "Text",
    content: { text },
    metadata: { custom },
  };
}

function createLiveItem(
  itemId: number,
  data: string,
  metadata: Record<string, string>,
): GroupStreamMessage {
  return {
    dataType: "json",
    data: { operation: "MessageItem", body: { itemId, data, metadata } },
  } as unknown as GroupStreamMessage;
}

function captureWarnings<T>(action: () => T): { result: T; warnings: string[] } {
  const mutableLogger = logger as unknown as { warning: (...args: unknown[]) => void };
  const originalWarning = mutableLogger.warning;
  const warnings: string[] = [];
  mutableLogger.warning = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    return { result: action(), warnings };
  } finally {
    mutableLogger.warning = originalWarning;
  }
}
