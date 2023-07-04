import { toAsync } from "../../common/utils";
import { Packet as SioPacket } from "socket.io-parser";
import { Packet as EioPacket, encodePayload as encodeEioPayload, PacketType as EioPacketType } from "engine.io-parser";
import { Encoder as SioEncoder } from "socket.io-parser";

const encodeEioPayloadAsync = toAsync<string>(encodeEioPayload);
const sioEncoder: SioEncoder = new SioEncoder();

// Modified from https://github.com/socketio/socket.io-adapter/blob/2.5.2/lib/index.ts#L233
export function getSingleEioEncodedPayload(packet: SioPacket): Promise<string> {
  // if `packet` owns binary attachements, `sioEncoder.encode` returns [string, ...buffers].
  // Otherwise, it returns a single element of string which is the encoded SIO packet.
  let encodedSioPackets = sioEncoder.encode(packet);

  // Ensure `encodedSioPackets` is an array
  encodedSioPackets = Array.isArray(encodedSioPackets) ? encodedSioPackets : [encodedSioPackets];

  const eioPackets: EioPacket[] = encodedSioPackets.map((item) => {
    return { type: "message" as EioPacketType, data: item } as EioPacket;
  });

  return encodeEioPayloadAsync(eioPackets);
}
