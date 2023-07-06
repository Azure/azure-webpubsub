// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule, toAsync } from "../../common/utils";
import { ClientConnectionContext } from "./client-connection-context";
import { decodeStringPartial, PartialSioPacket } from "../../SIO/components/decoder";
import { WEBPUBSUB_CLIENT_CONNECTION_FILED_NAME, WEBPUBSUB_TRANSPORT_NAME } from "./constants";
import { Transport, Socket as EioSocket } from "engine.io";
import { Packet as EioPacket, RawData } from "engine.io-parser";
import { Packet as SioPacket, PacketType as SioPacketType } from "socket.io-parser";

const debug = debugModule("wps-sio-ext:EIO:WebPubSubTransport");

/**
 * A class inherited from Engine.IO Transport class, it plays the same role as `Polling` Transport and `WebSocket` Transport.
 * Similar with `Polling`, this transport always does batch send (send mulitple packets at once) and batch receive.
 * Reference: https://github.com/socketio/engine.io/tree/6.4.2/lib/transports
 **/
export class WebPubSubTransport extends Transport {
  public clientConnectionContext: ClientConnectionContext;

  // `socket` is the one which manages this transport. This property enables tranposrt call `flush` method of its manager Socket.
  // Reference: https://github.com/socketio/engine.io/blob/6.4.2/lib/socket.ts
  public socket: EioSocket = null;

  // Reference: https://github.com/socketio/engine.io-parser/blob/5.0.7/lib/encodePacket.ts#L3
  private _encodeEioPacketAsync: (packet: EioPacket, supportsBinary: boolean) => Promise<RawData>;
  // Reference: https://github.com/socketio/engine.io-parser/blob/5.0.7/lib/index.ts#L7
  private _encodeEioPayloadAsync: (packets: EioPacket[]) => Promise<string>;

  /**
   * Indicate whether any packet have been actually sent through AWPS or not.
   */
  private _opened: boolean;
  /**
   * A buffer to store packets which are waiting to be sent designed for resolving SIO binary attachments problem.
   */
  private _buffer: EioPacket[] = [];

  /**
   * Indicate whether the transport is underlying Socket.IO or a pure Engine.IO transport.
   */
  private _sioMode: boolean;

  constructor(req: unknown, sioMode = true) {
    debug("constructor");
    super(req);
    this.clientConnectionContext = req[WEBPUBSUB_CLIENT_CONNECTION_FILED_NAME];
    this._opened = false;

    // `Socket` places packets in its own buffer if `writable` == false. Otherwise, it calls `send` with buffer directly.
    // Reference: https://github.com/socketio/engine.io/blob/6.4.2/lib/socket.ts#L510
    this.writable = true;
    this._sioMode = sioMode;
    this._encodeEioPacketAsync = toAsync<string>(this.parser.encodePacket);
    this._encodeEioPayloadAsync = toAsync<string>(this.parser.encodePayload);
  }

  public override supportsFraming = (): boolean => false;

  public override name = (): string => WEBPUBSUB_TRANSPORT_NAME;

  /**
   * sends an array of `Packet` to the client.
   * @param packets - An array of `Packet` to send
   */
  public override async send(packets: EioPacket[]): Promise<void> {
    debug(
      `send packets, packets.length = ${packets.length}, packets = ${JSON.stringify(packets)},\
_buffer.length=${this._buffer.length}, _buffer=${JSON.stringify(this._buffer)}`
    );
    this.writable = false;

    this._buffer.push(...packets);
    packets = [];

    if (this._buffer.length > 0 && !this._opened) {
      const firstPacket = this._buffer.shift();

      if (firstPacket.type === "open") {
        const payload = await this._encodeEioPacketAsync(firstPacket, false);
        debug(`first packet is 'open' packet, payload = ${payload}`);
        this.clientConnectionContext.onAcceptEioConnection(payload.substring(1));
        this._opened = true;
      } else {
        const errorMessage = `First packet must be a valid packet whose type is 'open', got packet = ${firstPacket}.`;
        debug(errorMessage);
        this.clientConnectionContext.onRefuseEioConnection(errorMessage);
      }
    }

    while (this._buffer.length > 0) {
      let sentNumber = 0;
      try {
        sentNumber = this._getPacketNumberForNextSend(this._buffer);
      } catch (error) {
        debug(`send, internal error, inside _getPacketNumberForNextSend, error = ${error.message},\
_buffer=${JSON.stringify(this._buffer)}`);
        sentNumber = this._buffer.length;
      }
      if (sentNumber <= 0) break;
      const payloads = await this._encodeEioPayloadAsync(this._buffer.splice(0, sentNumber));
      await this._webPubSubSend(payloads);
    }

    this.writable = true;
    if (this.socket) {
      debug(`send, call method flush of transport's father socket`);
      this.socket["flush"]();
    } else {
      debug(`send, not stored transport's father socket`);
    }

    debug(`send, finish, _buffer.length=${this._buffer.length}, _buffer=${JSON.stringify(this._buffer)}`);
  }

  public override doClose(fn?: () => void): void {
    debug("close");
    this.send([{ type: "close" }]);
    if (fn) {
      fn();
    }
  }

  /**
   * Send `data` to client via AWPS asynchronously.
   * @param data - The data to be sent.
   * @param autoRetry - If true, wait for a certain time and retry sending when the first response status is 429.
   */
  private async _webPubSubSend(data: string, autoRetry = false): Promise<void> {
    debug(`webPubSubSend ${data}`);
    try {
      await this.clientConnectionContext.send(data);
    } catch (error) {
      debug(error);
      if (autoRetry && error.response && error.response.status === 429) {
        const retryAfterSeconds = error.response.headers.get("retry-after");
        await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
        await this.clientConnectionContext.send(data);
      } else {
        throw error;
      }
    }
    debug(`webPubSubSend, finish`);
  }

  private _isMessageWithBinary(packet: EioPacket): boolean {
    return packet.data instanceof ArrayBuffer || ArrayBuffer.isView(packet.data);
  }

  private _isTypeWithBinary(packet: PartialSioPacket): boolean {
    return packet.type === SioPacketType.BINARY_EVENT || packet.type === SioPacketType.BINARY_ACK;
  }

  /**
   * For SIO mode:
   *  returns the largest `n` satisfying `packets[0 .. n - 1]` doesn't contain any incomplete binary-related EIO packet sequence.
   *  A complete binary-related EIO packet sequence = [BINARY_EVENT/BINARY_ACK SIO payload, ...(all its binary attachments)]
   * For EIO mode:
   *  The number of binary attachments cannot be inferred. This method returns `packets.length` directly.
   * @param packets - EIO packets
   * @returns the number of packets that can be sent in the next REST API call
   */
  private _getPacketNumberForNextSend(packets: EioPacket[]): number {
    if (!this._sioMode) return packets.length;

    /**
     * Binary Packet = an EIO packet whose data is BINARY_EVENT or BINARY_ACK SIO packet.
     * Binary Attachment Packet = an EIO packet whose data is binary attachment of a binary packet.
     */
    let attachmentCount = 0, // the number of binary attachment packets found for the latest binary packet.
      expectedAttachments = 0, // the expected number of binary attachment packets for the latest binary packet.
      lastBinaryMessagePacketIdx = -1, // the index of the latest binary packet.
      lastSentPacketIdx = -1, // the largest index of EIO packet that can be sent in the next REST API call
      shouldBeAttachment = false; // whether the current packet should be a binary attachment packet

    for (let i = 0; i < packets.length; i++) {
      const eioPacket = packets[i];

      // Condition 0: a pure EIO packet without data related to SIO packet.
      if (eioPacket.type !== "message") {
        lastSentPacketIdx++;
        continue;
      }

      // Condition 1: A binary attachment packet
      if (this._isMessageWithBinary(eioPacket)) {
        if (!shouldBeAttachment)
          throw new Error(
            `Expect a packet whose data is binary attachment but not found, packets[${i}] = ${eioPacket}`
          );

        attachmentCount++;
        if (attachmentCount === expectedAttachments) {
          if (lastBinaryMessagePacketIdx < 0 || lastBinaryMessagePacketIdx >= i)
            throw new Error(
              `Invalid lastBinaryMessagePacketIdx = ${lastBinaryMessagePacketIdx}, packets[${i}] = ${eioPacket}`
            );
          attachmentCount = 0;
          shouldBeAttachment = false;
          lastSentPacketIdx = i;
        } else {
          shouldBeAttachment = true;
        }
        continue;
      }

      const sioPacket: PartialSioPacket = decodeStringPartial(eioPacket.data);

      // Condition 2: A binary packet
      if (this._isTypeWithBinary(sioPacket)) {
        if (shouldBeAttachment)
          throw new Error(
            `Expect a packet with binary content, but got a regular packet, packets[${i}] = ${eioPacket}`
          );
        if (attachmentCount !== 0)
          throw new Error(`Exepect attachmentCount = 0 but got ${attachmentCount}, packets[${i}] = ${eioPacket}`);

        attachmentCount = 0;
        expectedAttachments = sioPacket.attachments;
        lastBinaryMessagePacketIdx = i;
        shouldBeAttachment = true;
        continue;
      }

      // Condition 3: A EIO packet whose data is related to SIO packet. But it is neither a binary packet nor a binary attachment packet
      if (shouldBeAttachment) {
        throw new Error(`Expect a packet whose data is binary attachment but not found, packets[${i}] = ${eioPacket}`);
      }
      shouldBeAttachment = false;
      lastSentPacketIdx++;
    }
    return lastSentPacketIdx + 1;
  }
}
