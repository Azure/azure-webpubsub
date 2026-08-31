import { AgentMessageReceiver } from "./agentMessageReceiver.js";
import type { ChatMessage } from "./events.js";
import { logger } from "./logger.js";
import type { EmitChatMessage, MessageCodec } from "./messageCodec.js";

/** Creates a message receiver and its message-scoped decoder. */
export class ReceiverFactory {
  public constructor(private readonly _codecs: readonly MessageCodec[]) {}

  public createReceiver(
    message: ChatMessage,
    emit: EmitChatMessage,
  ): AgentMessageReceiver | undefined {
    const codecKind = message.metadata?.codecKind;
    if (!codecKind) {
      logger.warning(
        `Cannot create a receiver for message '${message.messageId}' without codec metadata.`,
      );
      return undefined;
    }

    const codec = this._codecs.find((candidate) => candidate.codecKind === codecKind);
    if (!codec) {
      logger.warning(
        `No receiver registered for codec '${codecKind}' on message '${message.messageId}'.`,
      );
      return undefined;
    }

    const decoder = codec.createDecoder(message.messageId);
    if (decoder.codecKind !== codecKind) {
      logger.warning(
        `Receiver decoder '${decoder.codecKind}' does not match codec '${codecKind}' on message '${message.messageId}'.`,
      );
      return undefined;
    }

    return new AgentMessageReceiver(message, decoder, emit);
  }
}
