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
import { TokenCredential, AzureKeyCredential } from "@azure/core-auth";
import { Guid, PromiseCompletionSource, AckEntity, AsyncIterator } from "../utils";
import { AbortSignalLike } from "@azure/abort-controller";
import { createLogger } from "../logger";

const logger = createLogger("TunnelConnection");

interface ConnectionTarget {
  endpoint: string;
  target?: string;
  reverseProxyEndpoint?: string;
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
  public id = Guid.newGuid();
  private readonly _ackMap: Map<number, AckEntity<TunnelHttpResponseMessage>> = new Map<number, AckEntity<TunnelHttpResponseMessage>>();
  private readonly clients = new Map<string, WebPubSubTunnelClient>();
  private readonly lifetimeTcs: PromiseCompletionSource<void> = new PromiseCompletionSource<void>();
  private _stopped = false;
  private _ackId: number = 0;
  private _keyMapping = new Map<string, {count: number, client: WebPubSubTunnelClient}>();

  constructor(
    private readonly endpoint: string,
    private readonly credential: AzureKeyCredential | TokenCredential,
    private readonly hub: string,
    public requestHandler?: TunnelRequestHandler,
    private readonly reverseProxyEndpoint?: string
  ) {}

  private nextAckId(): number {
    this._ackId = this._ackId + 1;
    return this._ackId;
  }

  public async runAsync(shouldRetry?: (e: unknown, retryCount: number) => boolean, abortSignal?: AbortSignalLike): Promise<void> {
    // Run the connection
    this._stopped = false;
    await this.startConnectionAsync(
      {
        endpoint: this.endpoint,
        reverseProxyEndpoint: this.reverseProxyEndpoint,
      },
      shouldRetry,
      abortSignal
    );
  }

  public async invokeAsync(httpRequest: HttpRequestLike, abortSignal?: AbortSignalLike, consistentKey?: string): Promise<HttpResponseLike> {
    const client = this.getClient(consistentKey);
    if (!client) {
      throw new Error("No connection available.");
    }
    const ackId = this.nextAckId();
    const pcs = new PromiseCompletionSource<HttpResponseLike>();

    let firstResponse = false;
    let ackMap = this._ackMap;
    let body = new AsyncIterator<Uint8Array>();

    let ackEntity = new AckEntity<TunnelHttpResponseMessage>(
      ackId,
      (data: TunnelHttpResponseMessage | undefined, error: string | null, done: boolean) => {
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
          if (consistentKey) {
            this.releaseClient(consistentKey, client.id);
          }
          pcs.resolve({
            statusCode: data!.StatusCode,
            body: body,
          } as HttpResponseLike);
        }
      },
      abortSignal
    );
    ackMap.set(ackId, ackEntity);

    try {
      if (consistentKey) {
        this.lockClient(consistentKey, client);
      }
      
      let headers = {};
      if (httpRequest.contentType) {
        headers = { "Content-Type": [httpRequest.contentType] };
      }
      await client.sendAsync(
        new TunnelHttpRequestMessage(ackId, true, "", httpRequest.method, httpRequest.url, headers, httpRequest.content),
        abortSignal
      );
      logger.info(`Sent http request: ackId: ${ackId}, method: ${httpRequest.method}, url: ${httpRequest.url}, hub: ${this.hub}`);
      // Wait for the first response which contains status code / headers
      return pcs.promise;
    } catch (err) {
      this._ackMap.delete(ackId);
      if (consistentKey) {
        this.releaseClient(consistentKey, client.id);
      }
      throw err;
    }
  }

  public stop(): void {
    logger.warning(`Stop the lifetime. Start to close all connections, hub: ${this.hub}`);

    if (this._stopped) {
      return;
    }
    this._stopped = true;
    // Stop the connection
    this.lifetimeTcs.resolve();

    this.clients.forEach((element) => {
      this.stopConnection(element.id);
    });
  }

  private getRandomKey() : string | undefined {
    const keys = Array.from(this.clients.keys());
    if (keys.length === 0) {
      return undefined;
    }

    return keys[Math.floor(Math.random() * keys.length)];
  }

  private getClient(key?: string): WebPubSubTunnelClient | undefined {
    if (key) {
      const tuple = this._keyMapping.get(key);
  
      if (tuple && tuple.client.stopped) {
        this._keyMapping.delete(key);
      }
  
      return tuple?.client || this.getRandomClient();
    }
  
    return this.getRandomClient();
  }

  private getRandomClient(): WebPubSubTunnelClient | undefined {
    let client: WebPubSubTunnelClient | undefined;
    let i = 0;
    do {
      const key = this.getRandomKey();
      if (!key) return undefined;
      client = this.clients.get(key);
      i++;
    } while (i <= 5 && (!client || client.stopped));
    
    return client;
  }

  private lockClient(key: string, client: WebPubSubTunnelClient): void {
    let tuple = this._keyMapping.get(key);
    if (tuple) {
      tuple = {count: tuple.count+1, client};
    } else {
      tuple = {count: 1, client};
    }
    
    this._keyMapping.set(key, tuple);
  }

  private releaseClient(key: string, clientId: string): void {
    let tuple = this._keyMapping.get(key);
    if (!tuple || tuple.client.id != clientId) {
      return;
    }
    let newCount = tuple.count - 1;
    if (newCount === 0) {
      this._keyMapping.delete(key);
    } else {
      this._keyMapping.set(key, {count: newCount, client: tuple.client});
    }
  }

  private async processMessage(client: WebPubSubTunnelClient, message: TunnelMessage, abortSignal?: AbortSignalLike): Promise<void> {
    try {
      switch (message.Type) {
        case TunnelMessageType.HttpResponse: {
          const tunnelResponse = message as TunnelHttpResponseMessage;
          logger.info(`Getting http response ${tunnelResponse.TracingId ?? ""}: ackId: ${tunnelResponse.AckId}, statusCode: ${tunnelResponse.StatusCode}, notComplete: ${tunnelResponse.NotCompleted}, hub: ${this.hub}`);
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
          logger.info(`Getting http request ${tunnelRequest.TracingId ?? ""}: ackId: ${tunnelRequest.AckId}, method: ${tunnelRequest.HttpMethod}, url: ${tunnelRequest.Url}, hub: ${this.hub}`);
          if (!this.requestHandler) {
            throw new Error("Request handler not configured");
          }
  
          const response = await this.requestHandler(tunnelRequest, abortSignal);
          if (response) {
            logger.info(`Sending response back ${tunnelRequest.TracingId ?? ""}: ackId:${tunnelRequest.AckId}, statusCode: ${response.StatusCode}, content-length: ${response.Content.length}, hub: ${this.hub}`);
            await client.sendAsync(
              new TunnelHttpResponseMessage(
                tunnelRequest.AckId,
                tunnelRequest.LocalRouting,
                response.StatusCode,
                tunnelRequest.ChannelName,
                false,
                response.Headers,
                response.Content
              ),
              abortSignal
            );
          }
          break;
        }
        case TunnelMessageType.ConnectionReconnect: {
          const reconnect = message as TunnelConnectionReconnectMessage;
          logger.info(`Reconnect the connection ${client.getPrintableIdentifier()}: ${reconnect.Message}, hub: ${this.hub}`);
          await this.stopConnection(client.id);
          await this.startConnectionAsync(
            {
              endpoint: reconnect.Endpoint,
              target: reconnect.TargetId,
            },
            ()=>true, // keep it retry forever
            abortSignal
          );
          break;
        }
        case TunnelMessageType.ConnectionClose: {
          const close = message as TunnelConnectionCloseMessage;
          logger.info(`Close the connection ${client.getPrintableIdentifier()}: ${close.Message}, hub: ${this.hub}`);
          this.stopConnection(client.id);
          break;
        }
        case TunnelMessageType.ConnectionRebalance: {
          const rebalance = message as TunnelConnectionRebalanceMessage;
          logger.info(`Start another rebalance connection ${rebalance.Endpoint} -> ${rebalance.TargetId}, via connection: ${client.getPrintableIdentifier()}, hub: ${this.hub}`);
          await this.startConnectionAsync(
            {
              endpoint: rebalance.Endpoint,
              target: rebalance.TargetId,
            },
            () => true, // retry forever to be consistent with current logic
            abortSignal
          );
          break;
        }
        default: {
          logger.info(`[TunnelConnection] Not Support TBD message type: ${message.Type}, hub: ${this.hub}`);
          break;
        }
      }
    } catch (err) {
      logger.warning(`Error processing message: ${err}, hub: ${this.hub}`); 
    }
  }

  public stopConnection(id: string): void {
    logger.warning(`Stopping connection: ${id}, hub: ${this.hub}`);
    this.clients.get(id)?.stop();
  }

  public async startConnectionAsync(target: ConnectionTarget, shouldRetry?: (e: unknown, retryCount: number) => boolean, abortSignal?: AbortSignalLike): Promise<string> {
    if (this._stopped) {
      throw new Error(`Lifetime has stopped, hub: ${this.hub}`);
    }
    const url = this.getUrl(target, this.hub);
    const client = new WebPubSubTunnelClient(url, this.credential, this.id, target.target);
    logger.info(`Starting connection: ${client.id}, hub: ${this.hub}`);
    client.on("stop", () => {
      logger.warning(`Client ${client.getPrintableIdentifier()} stopped, hub: ${this.hub}`);
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
    let retryAttempt = 0;
    let retry = false;
    do {
      if (abortSignal?.aborted || this._stopped) {
        throw new Error(`Stop starting new client for aborted or stopped`);
      }
      try {
        await client.startAsync(abortSignal);
        logger.info(`Connected connections: (${this.clients.size})\n` + Array.from(this.printClientLines()).join("\n"));
        return client.id;
      } catch (err) {
        retryAttempt++;
        retry = shouldRetry !== undefined && shouldRetry(err, retryAttempt);
        if (retry){
          logger.info(`Error starting client ${client.getPrintableIdentifier()}: ${err}, retry ${retryAttempt} in 2 seconds, hub: ${this.hub}`);
          await delay(2000);
        } else {
          throw err;
        }
      }
    } while(retry);
    throw "Unexpected";
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
      yield `${client.getPrintableIdentifier()}: connectionId: ${client.currentConnectionId}; userId: ${client.userId}; ended: ${
        client.stopped
      }; target: ${client.target ?? "<random>"}; `;
    }
  }

  private getUrl(target: ConnectionTarget, hub: string): { endpoint: URL; reverseProxyEndpoint: URL | undefined } {
    const HttpTunnelPath = "server/tunnel";
    let endpoint;
    if (target.endpoint) {
      endpoint = target.endpoint;
    } else {
      logger.info(`No endpoint specified, use original endpoint ${this.endpoint}`);
      endpoint = this.endpoint;
    }
    const uriBuilder = new URL(endpoint);
    uriBuilder.protocol = uriBuilder.protocol.toLowerCase() === "http:" ? "ws:" : "wss:";

    uriBuilder.pathname = appendPath(uriBuilder.pathname, HttpTunnelPath);
    const hubQuery = `hub=${encodeURIComponent(hub)}`;
    if (!uriBuilder.search) {
      uriBuilder.search = `?${hubQuery}`;
    } else {
      uriBuilder.search = `${uriBuilder.search}&${hubQuery}`;
    }

    if (target.target) {
      uriBuilder.search = `${uriBuilder.search}&target=${encodeURIComponent(target.target)}`;
    }

    let reverseProxy: URL | undefined = undefined;
    if (target.reverseProxyEndpoint) {
      reverseProxy = new URL(target.reverseProxyEndpoint);
      reverseProxy.protocol = reverseProxy.protocol.toLowerCase() === "http:" ? "ws:" : "wss:";
      reverseProxy.pathname = appendPath(reverseProxy.pathname, HttpTunnelPath);
      reverseProxy.search = uriBuilder.search;
    }
    return { endpoint: uriBuilder, reverseProxyEndpoint: reverseProxy };
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendPath(pathname: string, append: string): string {
  return pathname.endsWith("/") ? `${pathname}${append}` : `${pathname}/${append}`;
}
