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
import { PromiseCompletionSource, AckEntity, AsyncIterator } from "../utils";
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

export interface HttpRequestLike {
  method: string;
  url: string;
  content?: Uint8Array;
  contentType?: string;
}

export interface HttpResponseLike {
  statusCode: number;
  body: AsyncIterator<Uint8Array>;
}

export class TunnelConnection {
  private readonly _ackMap: Map<number, AckEntity<TunnelHttpResponseMessage>> = new Map<number, AckEntity<TunnelHttpResponseMessage>>();
  private readonly clients = new Map<string, WebPubSubTunnelClient>();
  private readonly lifetimeTcs: PromiseCompletionSource<void> = new PromiseCompletionSource<void>();
  private _ackId: number = 0;
  constructor(private readonly endpoint: string, private readonly credential: TokenCredential, private readonly hub: string, public requestHandler?: TunnelRequestHandler) {}

  private nextAckId(): number {
    this._ackId = this._ackId + 1;
    return this._ackId;
  }

  public async runAsync(abortSignal?: AbortSignalLike): Promise<void> {
    // Run the connection
    await this.startConnectionAsync({ endpoint: this.endpoint }, abortSignal);
  }

  public async invokeAsync(
    httpRequest: HttpRequestLike,
    abortSignal?: AbortSignalLike
  ): Promise<HttpResponseLike> {
    // TODO: what is the send balance strategy?
    const client = this.getClient();
    if (!client) {
      throw new Error("No connection started.");
    }
    const ackId = this.nextAckId();
    const pcs = new PromiseCompletionSource<HttpResponseLike>();

    let firstResponse = false;
    let ackMap = this._ackMap;
    let body = new AsyncIterator<Uint8Array>();

    let ackEntity = new AckEntity<TunnelHttpResponseMessage>(ackId, (data: TunnelHttpResponseMessage|undefined, error:string|null, done: boolean) => {
      // handle body
      if (error) {
        body.error(error);
      }

      if (data!.Content) {
        body.add(data!.Content);
      }
      
      if (done) {
        body.close();
      }

      if (!firstResponse) {
        firstResponse = true;
        pcs.resolve({
          statusCode: data!.StatusCode,
          body: body,
        } as HttpResponseLike)
      }
    }, abortSignal);
    ackMap.set(ackId, ackEntity);

    try {
      let headers = {};
      if (httpRequest.contentType) {
        headers = {"Content-Type": [httpRequest.contentType]};
      }
      await client.sendAsync(new TunnelHttpRequestMessage(ackId, true, "", httpRequest.method, httpRequest.url, headers, httpRequest.content), abortSignal);
      // Wait for the first response which contains status code / headers
      return pcs.promise;
    } catch (err) {
      this._ackMap.delete(ackId);
      throw err;
    }
  }

  public stop(): void {
    // Stop the connection
    this.lifetimeTcs.resolve();

    this.clients.forEach((element) => {
      this.stopConnection(element.id);
    });
  }

  private getClient(): WebPubSubTunnelClient | undefined {
    for (const [_, client] of this.clients) {
      return client;
    }
  }

  private async processMessage(client: WebPubSubTunnelClient, message: TunnelMessage, abortSignal?: AbortSignalLike): Promise<void> {
    switch (message.Type) {
      case TunnelMessageType.HttpResponse: {
        const tunnelResponse = message as TunnelHttpResponseMessage;
        logger.info(`Getting request ${tunnelResponse.TracingId ?? ""}: ackId: ${tunnelResponse.AckId}, statusCode: ${tunnelResponse.StatusCode}`);
        const ackId = tunnelResponse.AckId;
        if (this._ackMap.has(ackId)) {
          const entity = this._ackMap.get(ackId)!;
          entity.write(tunnelResponse, null, !tunnelResponse.NotCompleted);
          if (!tunnelResponse.NotCompleted) {
            this._ackMap.delete(ackId);
          }
        }
        break;
      }
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
            new TunnelHttpResponseMessage(tunnelRequest.AckId, tunnelRequest.LocalRouting, response.StatusCode, tunnelRequest.ChannelName, false, response.Headers, response.Content),
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
