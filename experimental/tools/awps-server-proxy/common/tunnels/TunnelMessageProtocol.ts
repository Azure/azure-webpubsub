import { Buffer } from "buffer";
import { encode, decode } from "@msgpack/msgpack";
import {
  TunnelByteContentMessage,
  TunnelConnectionCloseMessage,
  TunnelConnectionConnectedMessage,
  TunnelConnectionRebalanceMessage,
  TunnelConnectionReconnectMessage,
  TunnelHttpRequestMessage,
  TunnelHttpResponseMessage,
  TunnelMessage,
  TunnelMessageType,
  TunnelServiceStatusMessage,
} from "./messages";

export class TunnelMessageProtocol {
  private static readonly messageLengthSize = 4;
  private static readonly maxLength = 1024 * 1024; // 1M

  public static readonly instance = new TunnelMessageProtocol();

  public getBytes<T extends TunnelMessage>(message: T): Uint8Array {
    let content = undefined;
    if (message instanceof TunnelByteContentMessage) {
      content = message.Content;
    }
    const bytes = [message.Type, JSON.stringify(message, (key, value) => {
      if (key === "Content") {
        // exclude the byte Content
        return undefined;
      }
      return value;
    }), content];
    const encodedMessage = encode(bytes);
    const messageLength = encodedMessage.byteLength;
    const buffer = new ArrayBuffer(
      TunnelMessageProtocol.messageLengthSize + messageLength
    );
    const view = new DataView(buffer);
    view.setUint32(0, messageLength, true);
    const dataView = new Uint8Array(buffer);
    dataView.set(encodedMessage, TunnelMessageProtocol.messageLengthSize);
    return dataView;
  }

  public parseMessage(data: Uint8Array): TunnelMessage | undefined {
    const lengthHeader = data.slice(0, 4);
    const view = new DataView(lengthHeader.buffer);
    const length = view.getInt32(0, true);
    const content = data.slice(4, length + 4);
    const array = decode(content) as Array<any>;
    const type: number = array[0];
    const json: string = array[1];
    const body: Uint8Array = array[2];
    switch (type) {
      case TunnelMessageType.HttpRequest:
        const request = JSON.parse(json) as TunnelHttpRequestMessage;
        request.Content = body;
        return request;
      case TunnelMessageType.HttpResponse:
        const response = JSON.parse(json) as TunnelHttpResponseMessage;
        response.Content = body;
        return response;

      case TunnelMessageType.ServiceStatus: {
        return JSON.parse(json) as TunnelServiceStatusMessage;
      }
      case TunnelMessageType.ConnectionReconnect: {
        return JSON.parse(json) as TunnelConnectionReconnectMessage;
      }
      case TunnelMessageType.ConnectionClose: {
        return JSON.parse(json) as TunnelConnectionCloseMessage;
      }
      case TunnelMessageType.ConnectionConnected: {
        return JSON.parse(json) as TunnelConnectionConnectedMessage;
      }
      case TunnelMessageType.ConnectionRebalance: {
        return JSON.parse(json) as TunnelConnectionRebalanceMessage;
      }
      default: {
        return undefined;
      }
    }
  }
}
