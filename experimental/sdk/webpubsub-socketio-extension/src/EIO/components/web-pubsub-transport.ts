// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule } from "../../common/utils";
import { ClientConnectionContext } from "./client-connection-context";
import { WEBPUBSUB_CLIENT_CONNECTION_FILED_NAME, WEBPUBSUB_TRANSPORT_NAME } from "./constants";
import { Transport } from "engine.io";
import { Packet, RawData } from "engine.io-parser";

const debug = debugModule("wps-sio-ext:EIO:WebPubSubTransport");

/**
 * A class inherited from Engine.IO Transport class, it plays the same role as `Polling` Transport and `WebSocket` Transport.
 * Similar with `Polling`, this transport always does batch send (send mulitple packets at once) and batch receive.
 * Reference: https://github.com/socketio/engine.io/tree/6.4.2/lib/transports
 **/
export class WebPubSubTransport extends Transport {
  public clientConnectionContext: ClientConnectionContext;
  /**
   * Queue for storing packets to be sent. This design is to ensure packets are sent in order with send action in async manner.
   */
  public _queue: Packet[] = [];

  // Reference: https://github.com/socketio/engine.io-parser/blob/5.0.7/lib/encodePacket.ts#L3
  private _encodePacketAsync: (packet: Packet, supportsBinary: boolean) => Promise<RawData>;
  // Reference: https://github.com/socketio/engine.io-parser/blob/5.0.7/lib/index.ts#L7
  private _encodePayloadAsync: (packets: Packet[]) => Promise<string>;

  /**
   * Indicate whether any packet have been actually sent through AWPS or not.
   */
  private _onceSent: boolean;

  constructor(req: unknown) {
    debug("constructor");
    super(req);
    this.clientConnectionContext = req[WEBPUBSUB_CLIENT_CONNECTION_FILED_NAME];
    this._onceSent = false;

    // `Socket` places packets in its own buffer if `writable` == false. Otherwise, it calls `send` with buffer directly.
    // Reference: https://github.com/socketio/engine.io/blob/6.4.2/lib/socket.ts#L510
    this.writable = true;

    this._encodePacketAsync = ({ type, data }: Packet, supportsBinary: boolean): Promise<string> => {
      return new Promise((resolve, reject) => {
        this.parser.encodePacket({ type, data }, supportsBinary, (encodedPacket) => {
          resolve(encodedPacket);
        });
      });
    };

    this._encodePayloadAsync = (packets: Packet[]): Promise<string> => {
      return new Promise((resolve, reject) => {
        this.parser.encodePayload(packets, (encodedPackets) => {
          resolve(encodedPackets);
        });
      });
    };
  }

  public override supportsFraming = (): boolean => false;

  public override name = (): string => WEBPUBSUB_TRANSPORT_NAME;

  /**
   * In native Engine.IO, this method sends an array of `Packet` to client.
   * In this class, it doesn't take the send action directly, but stores the packets in queue.
   * @param packets - An array of `Packet` to send
   */
  public override async send(packets: Packet[]): Promise<void> {
    debug(`send packets, number = ${packets.length}`);
    this.writable = false;
    try {
      this._queue = this._queue.concat(packets);
      await this._sendPacketsQueue();
    } catch (error) {
      debug(error);
    } finally {
      this.writable = true;
    }
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
  private async _webPubSubSend(data: string, autoRetry: boolean = false): Promise<void> {
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
  }

  /**
   * Send packets stored in queue to client via AWPS.
   * Special handling for the `open` packet, for it should be delivered to service as the response for `connect` event request.
   */
  private async _sendPacketsQueue(): Promise<void> {
    debug(`sendPacketsQueue, number = ${this._queue.length}, onceSent = ${this._onceSent}`);

    if (this._queue.length === 0) return;

    if (!this._onceSent) {
      const firstPacket = this._queue.shift();
      if (firstPacket.type === "open") {
        const payload = await this._encodePacketAsync(firstPacket, false);
        this.clientConnectionContext.onAcceptEioConnection(payload.substring(1));
      } else {
        const errorMessage = `First packet must be 'open' packet, but got packet type = ${firstPacket.type}.`;
        this.clientConnectionContext.onRefuseEioConnection(errorMessage);
        throw new Error(errorMessage);
      }

      this._onceSent = true;
    }

    if (this._queue.length > 0) {
      // Clone queue and clear it immediately in case of `webPubSend` throws a exception without clearing queue.
      const queue = this._queue.slice();
      this._queue = [];
      const payloads = await this._encodePayloadAsync(queue);
      await this._webPubSubSend(payloads);
    }
    debug(`sendPacketsQueue, finish, ${this._queue.length}`);
  }
}
