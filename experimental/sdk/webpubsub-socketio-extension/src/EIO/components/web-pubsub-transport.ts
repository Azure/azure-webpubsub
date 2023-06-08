// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule, toAsync } from "../../common/utils";
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

    this._encodePacketAsync = toAsync<string>(this.parser.encodePacket);
    this._encodePayloadAsync = toAsync<string>(this.parser.encodePayload);
  }

  public override supportsFraming = (): boolean => false;

  public override name = (): string => WEBPUBSUB_TRANSPORT_NAME;

  /**
   * sends an array of `Packet` to the client.
   * @param packets - An array of `Packet` to send
   */
  public override async send(packets: Packet[]): Promise<void> {
    debug(`send packets, number = ${packets.length}`);
    this.writable = false;
  
    if (packets.length > 0 && !this._onceSent) {
      const firstPacket = packets.shift();
      if (firstPacket.type === "open") {
        const payload = await this._encodePacketAsync(firstPacket, false);
        debug(`first packet is 'open' packet, payload = ${payload}`);
        this.clientConnectionContext.onAcceptEioConnection(payload.substring(1));
        this._onceSent = true;
      } else {
        const errorMessage = `First packet must be 'open' packet, but got packet type = ${firstPacket.type}.`;
        debug(errorMessage);
        this.clientConnectionContext.onRefuseEioConnection(errorMessage);
      }
    }

    if (packets.length > 0) {
      // Clone queue and clear it immediately in case of `webPubSend` throws a exception without clearing queue.
      const queue = packets.slice();
      packets = [];
      const payloads = await this._encodePayloadAsync(queue);
      await this._webPubSubSend(payloads);
    }
    debug(`send, finish, ${packets.length}`);

    this.writable = true;
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
}
