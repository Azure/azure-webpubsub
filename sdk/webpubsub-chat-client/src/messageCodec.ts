import type { ChatMessage } from "./events.js";

/** Base result produced by a message codec. */
export interface DecodedMessage {
  readonly codecKind: string;
  /** The latest decoded value emitted by the codec, if any. */
  readonly delta: unknown;
  /** All decoded values for this message in codec-defined replay order. */
  readonly accumulated: unknown;
}

export type EmitChatMessage = (message: ChatMessage) => void;

/** One protocol-neutral message item normalized by the message receiver. */
export interface MessageDecoderInput {
  readonly messageId: string;
  readonly itemId: number;
  readonly data: string;
  readonly metadata?: Readonly<Record<string, string>> | null;
}

/** Decodes normalized message items without depending on their delivery source. */
export interface MessageDecoder {
  readonly codecKind: string;
  decode(item: MessageDecoderInput): readonly DecodedMessage[];
}

/** Creates message-scoped decoders for one codec kind. */
export interface MessageCodec {
  readonly codecKind: string;
  createDecoder(messageId: string): MessageDecoder;
}
