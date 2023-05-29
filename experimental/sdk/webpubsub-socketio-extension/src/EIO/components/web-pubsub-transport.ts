import { Packet } from "engine.io-parser";
import { Transport } from "engine.io";

/**
 * A class inherited from Engine.IO Transport class, it acts the same role with `Polling` Transport and `WebSocket` Transport.
 * Compared with the other two transports, this transport always does batch receive and optional batch send (default true).
 *
 * TODO: Batch receive is implemented in web-pubsub-translator. It should be moved here later.
 **/
export class WebPubSubTransport extends Transport {
	override supportsFraming = () => false;

	override name = () => "webpubsub";

	public override async send(packets: Packet[]) {}

	public override doClose(fn) {}
}
