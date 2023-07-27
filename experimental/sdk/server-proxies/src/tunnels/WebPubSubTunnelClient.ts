import { WebPubSubClient, WebPubSubClientOptions, WebPubSubClientProtocol, WebPubSubMessage } from "@azure/web-pubsub-client";
import { TunnelMessageProtocol } from "./TunnelMessageProtocol";
import { TunnelMessage, TunnelMessageType, TunnelConnectionConnectedMessage } from "./messages";
import { TokenCredential } from "@azure/core-auth";
import { logger } from "../logger";
import EventEmitter from "events";
import { Guid, PromiseCompletionSource } from "../utils";
import { AbortSignalLike } from "@azure/abort-controller";

export class WebPubSubTunnelClient {
  private readonly _emitter: EventEmitter = new EventEmitter();
  private _client: WebPubSubClient;
  private _startedCts = new PromiseCompletionSource<string>();
  public id = Guid.newGuid();
  public currentConnectionId: string | undefined;
  public stopped = false;
  public messageQueue: TunnelMessage[] = [];
  public on(event: "message" | "stop", listener: (...args: any[]) => void): void {
    this._emitter.on(event, listener);
  }
  public off(event: "message" | "stop", listener: (...args: any[]) => void): void {
    this._emitter.removeListener(event, listener);
  }

  constructor(url: URL, credential: TokenCredential) {
    const options: WebPubSubClientOptions = {
      protocol: new TunnelServerProtocol(),
      autoReconnect: false,
    };
    const client = (this._client = new WebPubSubClient(
      {
        getClientAccessUrl: () => {
          return getAccessTokenUrl(url, credential);
        },
      },
      options
    ));
    client.on("connected", (connected) => {
      this.currentConnectionId = connected.connectionId;
      this._startedCts.resolve(connected.connectionId);
    });
    client.on("disconnected", () => {
      this.currentConnectionId = undefined;
    });
    client.on("stopped", () => {
      this.stopped = true;
      this._emitter.emit("stop");
    });

    client.on("server-message", (message) => {
      const bytes = message.message.data;
      let messageBytes: Uint8Array;

      if (bytes instanceof ArrayBuffer) {
        messageBytes = new Uint8Array(bytes);
      } else if (bytes instanceof Uint8Array) {
        messageBytes = bytes;
      } else {
        logger.error("Received non-arraybuffer message from server.");
        return;
      }
      var parsed = TunnelMessageProtocol.instance.parseMessage(new Uint8Array(bytes));
      if (parsed) {
        this.messageQueue.push(parsed);
        // use messageQueue instead of pass in through emit to gurantee message handle order
        this._emitter.emit("message");
      } else {
        logger.error("Received invalid message from server.");
      }
    });
  }

  public async startAsync(abortSignal?: AbortSignalLike): Promise<string> {
    await this._client.start({ abortSignal: abortSignal });
    return await this._startedCts.promise;
  }

  public stop(): void {
    this.stopped = true;
    this._client.stop();
  }

  public async sendAsync(message: TunnelMessage, abortSignal?: AbortSignalLike): Promise<void> {
    await this._client.sendEvent(message.Type.toString(), TunnelMessageProtocol.instance.getBytes(message), "binary", { fireAndForget: true, abortSignal: abortSignal });
  }
}

class TunnelServerProtocol implements WebPubSubClientProtocol {
  name = "";
  isReliableSubProtocol = false;
  private _protocol = TunnelMessageProtocol.instance;
  parseMessages(input: string | ArrayBuffer | Buffer): WebPubSubMessage | null {
    if (typeof input === "string") {
      throw new Error("Expecting ArrayBuffer or Buffer.");
    }
    const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
    const tunnel = this._protocol.parseMessage(buffer);
    if (!tunnel) {
      throw new Error("Expecting tunnel message");
    }
    if (tunnel.Type == TunnelMessageType.ConnectionConnected) {
      const connected = tunnel as TunnelConnectionConnectedMessage;
      return {
        connectionId: connected.ConnectionId,
        kind: "connected",
        userId: connected.UserId ?? "",
        reconnectionToken: connected.ReconnectionToken ?? "",
      };
    }

    return {
      kind: "serverData",
      dataType: "binary",
      data: buffer,
    };
  }

  writeMessage(message: WebPubSubMessage): string | ArrayBuffer {
    // Implement the logic to write the message to a string or ArrayBuffer
    // and return it
    if (message.kind === "sendEvent") {
      if (message.data instanceof ArrayBuffer) {
        return message.data;
      } else if (message.data instanceof Uint8Array) {
        return message.data.buffer;
      } else {
        throw new Error("Expecting ArrayBuffer or Buffer.");
      }
    }

    throw new Error("Expecting sendEvent.");
  }
}

async function getAccessTokenUrl(endpoint: URL, credential: TokenCredential): Promise<string> {
  const url = endpoint.toString();
  const tokenString = (
    await credential.getToken("https://webpubsub.azure.com/.default", {
      claims: url,
    })
  )?.token;
  return `${url}&access_token=${encodeURIComponent(tokenString!)}`;
}
