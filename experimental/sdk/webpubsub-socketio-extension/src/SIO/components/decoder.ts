import { debugModule } from "../../common/utils";
import { Packet, PacketType } from "socket.io-parser";

const debug = debugModule("wps-sio-ext:SIO:Decoder");

// Copied from https://github.com/socketio/socket.io-parser/blob/4.2.4/lib/index.ts#L11
/**
 * These strings must not be used as event names, as they have a special meaning.
 */
const RESERVED_EVENTS: string[] = [
  "connect", // used on the client side
  "connect_error", // used on the client side
  "disconnect", // used on both sides
  "disconnecting", // used on the server side
  "newListener", // used by the Node.js EventEmitter
  "removeListener", // used by the Node.js EventEmitter
];

// Modified from https://github.com/socketio/socket.io-parser/blob/4.2.4/lib/index.ts#L210
/**
 * Decode a packet String partially(JSON data). Only type and the number of attachements are decoded.
 *
 * @param {String} str - target string
 * @return {Object} packet
 */
export function decodeStringPartial(str: string): Packet {
  let i = 0;
  // look up type
  const p: Packet = {
    type: Number(str.charAt(0)),
    nsp: null,
  };

  if (PacketType[p.type] === undefined) {
    throw new Error("unknown packet type " + p.type);
  }

  // look up attachments if type binary
  if (p.type === PacketType.BINARY_EVENT || p.type === PacketType.BINARY_ACK) {
    const start = i + 1;
    // Add "i = i + 1 - 1" to pass eslint
    while (str.charAt(++i) !== "-" && i != str.length) {
      i = i + 1 - 1;
    }
    const buf = str.substring(start, i);
    // Native implementation is `buf != Number(buf) || ...`. string is always != number. Seems to be a bug.
    if (buf !== Number(buf).toString() || str.charAt(i) !== "-") {
      throw new Error("Illegal attachments");
    }
    p.attachments = Number(buf);
  }

  // Skip decoding `p.namespace`, `p.id` and `p.data`

  debug("decoded %s as %j", str, p);
  return p;
}
