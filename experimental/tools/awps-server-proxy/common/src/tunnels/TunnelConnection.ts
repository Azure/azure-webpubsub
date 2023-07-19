import { WebPubSubTunnelClient } from "./WebPubSubTunnelClient";
import {
  TunnelConnectionCloseMessage,
  TunnelConnectionRebalanceMessage,
  TunnelConnectionReconnectMessage,
  TunnelHttpRequestMessage,
  TunnelHttpResponseMessage,
  TunnelMessage,
  TunnelMessageType,
} from "./messages";
import { TokenCredential } from "@azure/core-auth";
import { PromiseCompletionSource } from "../utils";
import { AbortSignalLike } from "@azure/abort-controller";
import { createLogger } from "../logger";

const logger = createLogger("TunnelConnection");

interface ConnectionTarget {
  endpoint: string;
  target?: string;
}

export interface TunnelIncomingMessage {
  Url: string;
  HttpMethod: string;
  Headers?: Record<string, string[]>;
  Content?: Uint8Array;
}

export interface TunnelOutgoingMessage {
  StatusCode: number;
  Headers: Record<string, string[]>;
  Content: Uint8Array;
}

export interface TunnelRequestHandler {
  (request: TunnelIncomingMessage, abortSignal?: AbortSignalLike): Promise<TunnelOutgoingMessage | undefined>;
}

export class TunnelConnection {
  private readonly clients = new Map<string, WebPubSubTunnelClient>();
  private readonly lifetimeTcs: PromiseCompletionSource<void> = new PromiseCompletionSource<void>();
  constructor(
    private readonly endpoint: string,
    private readonly credential: TokenCredential,
    private readonly hub: string,
    public requestHandler?: TunnelRequestHandler
  ) {}

  public async runAsync(abortSignal?: AbortSignalLike): Promise<void> {
    // Run the connection
    await this.startConnectionAsync({ endpoint: this.endpoint }, abortSignal);
  }

  public stop(): void {
    // Stop the connection
    this.lifetimeTcs.resolve();

    this.clients.forEach((element) => {
      this.stopConnection(element.id);
    });
  }

  private async processMessage(client: WebPubSubTunnelClient, message: TunnelMessage, abortSignal?: AbortSignalLike): Promise<void> {
    switch (message.Type) {
      case TunnelMessageType.HttpRequest: {
        const tunnelRequest = message as TunnelHttpRequestMessage;
        logger.info(`Getting request ${tunnelRequest.TracingId ?? ""}: ${tunnelRequest.HttpMethod} ${tunnelRequest.Url}`);
        if (!this.requestHandler) {
          throw new Error("Request handler not configured");
        }

        const response = await this.requestHandler(tunnelRequest, abortSignal);
        if (response) {
          logger.info(`Sending response back: ${response.StatusCode}, content-length: ${response.Content.length}`);
          await client.sendAsync(
            new TunnelHttpResponseMessage(tunnelRequest.AckId, tunnelRequest.LocalRouting, response.StatusCode, tunnelRequest.ChannelName, response.Headers, response.Content),
            abortSignal
          );
        }
        break;
      }
      case TunnelMessageType.ConnectionReconnect: {
        const reconnect = message as TunnelConnectionReconnectMessage;
        logger.info(`Reconnect the connection: ${reconnect.Message}`);
        await this.stopConnection(client.id);
        await this.startConnectionAsync(
          {
            endpoint: reconnect.Endpoint,
            target: reconnect.TargetId,
          },
          abortSignal
        );
        break;
      }
      case TunnelMessageType.ConnectionClose: {
        const close = message as TunnelConnectionCloseMessage;
        logger.info(`Close the connection: ${close.Message}`);
        this.stopConnection(client.id);
        break;
      }
      case TunnelMessageType.ConnectionRebalance: {
        const rebalance = message as TunnelConnectionRebalanceMessage;
        logger.info(`Start another rebalance connection ${rebalance.Endpoint} -> ${rebalance.TargetId}`);
        await this.startConnectionAsync(
          {
            endpoint: rebalance.Endpoint,
            target: rebalance.TargetId,
          },
          abortSignal
        );
        break;
      }
      default: {
        logger.info(`[TunnelConnection] Not Support TBD message type: ${message.Type}`);
        break;
      }
    }
  }

  public stopConnection(id: string): void {
    this.clients.get(id)?.stop();
  }

  public async startConnectionAsync(target: ConnectionTarget, abortSignal?: AbortSignalLike): Promise<string> {
    const client = new WebPubSubTunnelClient(getUrl(target.endpoint, this.hub, target.target), this.credential);
    client.on("stop", () => {
      logger.warning(`Client ${client.id} stopped`);
      this.tryEndLife(client.id);
    });
    client.on("message", () => {
      while (client.messageQueue.length > 0) {
        const message = client.messageQueue.shift();
        if (message) {
          this.processMessage(client, message, abortSignal);
        }
      }
    });
    this.clients.set(client.id, client);

    await client.startAsync(abortSignal);
    logger.info(`Connected connections: (${this.clients.size})\n` + Array.from(this.printClientLines()).join("\n"));
    return client.id;
  }

  private tryEndLife(clientId: string) {
    if (this.clients.get(clientId)?.stopped) {
      this.clients.delete(clientId);
    }
    if (this.clients.size === 0) {
      this.lifetimeTcs.resolve();
    }
  }

  private *printClientLines(): IterableIterator<string> {
    for (const [clientId, client] of this.clients) {
      yield `${clientId}: [${client.currentConnectionId}] ended? ${client.stopped}`;
    }
  }
}

function getUrl(endpoint: string, hub: string, target?: string): URL {
  const HttpTunnelPath = "server/tunnel";
  const uriBuilder = new URL(endpoint);
  uriBuilder.protocol = uriBuilder.protocol === "http:" ? "ws:" : "wss:";
  uriBuilder.pathname = uriBuilder.pathname + HttpTunnelPath;
  const hubQuery = `hub=${encodeURIComponent(hub)}`;
  if (!uriBuilder.search) {
    uriBuilder.search = `?${hubQuery}`;
  } else {
    uriBuilder.search = `${uriBuilder.search}&${hubQuery}`;
  }
  if (!target) {
    return uriBuilder;
  }

  uriBuilder.search = `${uriBuilder.search}&${encodeURIComponent(target)}`;
  return uriBuilder;
}
