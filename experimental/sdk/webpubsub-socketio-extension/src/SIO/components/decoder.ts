import { debugModule } from "../../common/utils";
import { Packet, PacketType } from "socket.io-parser";

const debug = debugModule("wps-sio-ext:SIO:Decoder");

export interface PartialSioPacket {
  type: PacketType;
  attachments: number;
}

/**
 * Decode a packet String partially(JSON data). Only type and the number of attachements are decoded.
 * Modified from https://github.com/socketio/socket.io-parser/blob/4.2.4/lib/index.ts#L210
 *
 * @param {String} str - target string
 * @return {Object} packet
 */
export function decodeStringPartial(str: string): PartialSioPacket {
  let i = 0;
  // look up type
  var p: PartialSioPacket = {
    type: Number(str.charAt(0)),
    attachments: 0
  };

  if (PacketType[p.type] === undefined) {
    throw new Error("unknown packet type " + p.type);
  }

  // look up attachments if type binary
  if (p.type === PacketType.BINARY_EVENT || p.type === PacketType.BINARY_ACK) {
    const start = i + 1;
    // eslint-disable-next-line no-empty
    while (str.charAt(++i) !== "-" && i != str.length) {}
    const buf = str.substring(start, i);
    // Native implementation is `buf != Number(buf) || ...`. Modify it to pass typescript compilation check
    if (buf !== Number(buf).toString() || str.charAt(i) !== "-") {
      throw new Error("Illegal attachments");
    }
    p.attachments = Number(buf);
  }

  // Skip decoding `p.namespace`, `p.id` and `p.data`

  debug("decoded %s as %j", str, p);
  return p;
}
