import { Packet } from "engine.io-parser";
import { Transport } from "engine.io";
import { WEBPUBSUB_TRANSPORT_NAME } from "./constants";

/**
 * A class inherited from Engine.IO Transport class, it acts the same role with `Polling` Transport and `WebSocket` Transport.
 * Compared with the other two transports, this transport always does batch receive and optional batch send (default true).
 *
 * TODO: Batch receive is implemented in web-pubsub-translator. It should be moved here later.
 **/
export class WebPubSubTransport extends Transport {
  public override supportsFraming = () => false;

  public override name = () => WEBPUBSUB_TRANSPORT_NAME;

  public override async send(packets: Packet[]) {}

  public override doClose(fn) {}
}
