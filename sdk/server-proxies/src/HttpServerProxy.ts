import { AbortSignal } from "@azure/abort-controller";
import { TokenCredential, AzureKeyCredential, isTokenCredential } from "@azure/core-auth";
import { AbortSignalLike } from "@azure/abort-controller";
import { parseConnectionString } from "./utils";
import http from "http";
import { TunnelConnection, TunnelIncomingMessage, TunnelOutgoingMessage } from "./tunnels/TunnelConnection";
import { logger } from "./logger";
import jwt from "jsonwebtoken";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

export interface HttpServerProxyOptions {
  /**
   * The target HTTP server base url, e.g. https://localhost:8080
   */
  target: string;
}

export interface RunOptions {
  handleProxiedRequest?: (request: TunnelIncomingMessage, time: number, proxiedUrl: URL, invoke: () => Promise<TunnelOutgoingMessage>) => Promise<TunnelOutgoingMessage>;
}

const apiVersion = "2023-07-01";

export class HttpServerProxy {
  private _tunnel: TunnelConnection;
  private _client: WebPubSubServiceClient;
  public id: string;
  static fromConnectionString(connectionString: string, hub: string, options: HttpServerProxyOptions, reverseProxyEndpoint?: string): HttpServerProxy {
    const { credential, endpoint } = parseConnectionString(connectionString);
    return new HttpServerProxy(endpoint, credential, hub, options, reverseProxyEndpoint);
  }

  constructor(public endpoint: string, public credential: AzureKeyCredential | TokenCredential, public hub: string, private _options: HttpServerProxyOptions, reverseProxyEndpoint?: string) {
    this.endpoint = this.endpoint.endsWith("/") ? this.endpoint : this.endpoint + "/";
    this._tunnel = new TunnelConnection(endpoint, credential, hub, undefined, reverseProxyEndpoint);
    this._client = new WebPubSubServiceClient(endpoint, credential as any, hub);
    this.id = this._tunnel.id;
  }

  public runAsync(options: RunOptions, shouldRetry?: (e: unknown, retryCount: number) => boolean, abortSignal?: AbortSignal): Promise<void> {
    this._tunnel.requestHandler = (r, a) => this.sendHttpRequest(r, options, a);
    return this._tunnel.runAsync(shouldRetry, abortSignal);
  }

  // still doing the real REST API call to get the token
  public async getClientAccessUrl(userId?: string, roles?: string[], groups?: string[]): Promise<string> {
    const cat = await this._client.getClientAccessToken({ userId, roles, groups });
    return cat.url;
  }

  public getLiveTraceUrl() : string {
    return `${this.endpoint}livetrace`;
  }

  public async getLiveTraceToken(): Promise<string> {
    let token: string;
    if (isTokenCredential(this.credential)) {
      return (await this.credential.getToken("https://webpubsub.azure.com"))!.token;
    } else {
      return jwt.sign({}, this.credential.key, {
        audience: `${this.endpoint}livetrace`,
        expiresIn: "1h",
        algorithm: "HS256",
      });
    }
  }
  
  public async getRestApiToken(url: string): Promise<string> {
    if (isTokenCredential(this.credential)) {
      return (await this.credential.getToken("https://webpubsub.azure.com"))!.token;
    }else{
      return jwt.sign({}, this.credential.key, {
        audience: url,
        expiresIn: "1h",
        algorithm: "HS256",
      });
    }
  }

  private async sendHttpRequest(request: TunnelIncomingMessage, options?: RunOptions, abortSignal?: AbortSignalLike): Promise<TunnelOutgoingMessage> {
    function convertHeaders(headers: http.IncomingHttpHeaders): Record<string, string[]> {
      const result: Record<string, string[]> = {};
      for (const key in headers) {
        const value = headers[key];
        if (value !== undefined) {
          if (Array.isArray(value)) {
            result[key] = value;
          } else {
            result[key] = [value];
          }
        }
      }
      return result;
    }

    function getDisplayUrl(url: URL): string {
      return `${request.HttpMethod} ${url} ${request.Content?.byteLength ?? 0}`;
    }

    function httpInvoke(url: URL, request: TunnelIncomingMessage, abortSignal?: AbortSignalLike): Promise<TunnelOutgoingMessage> {
      // always resolve, never reject
      function errorResponse(message: string) {
        return {
          StatusCode: 500,
          Headers: {},
          Content: new TextEncoder().encode(message),
        };
      }

      return new Promise<TunnelOutgoingMessage>((resolve, reject) => {
        const req = http.request(
          url,
          {
            method: request.HttpMethod,
            headers: request.Headers,
          },
          (res) => {
            const chunks: Uint8Array[] = [];
            res.on("data", (chunk) => {
              chunks.push(chunk);
            });
            res.on("end", () => {
              logger.info(`Received proxied response for '${getDisplayUrl(url)}: status code:${res.statusCode ?? 0}'`);
              const tunnelResponse = {
                StatusCode: res.statusCode ?? 0,
                Headers: convertHeaders(res.headers),
                Content: new Uint8Array(Buffer.concat(chunks)),
              };
              resolve(tunnelResponse);
            });
          },
        );
        req.on("error", (err) => {
          logger.error(`Error forwarding request '${getDisplayUrl(url)}': ${err}`);
          resolve(errorResponse(err.message));
        });

        abortSignal?.addEventListener("abort", () => resolve(errorResponse("Request cancelled")));

        if (request.Content) {
          // Java getBody() relies on Content-Length header
          req.setHeader("Content-Length", request.Content.byteLength.toString());
          req.write(Buffer.from(request.Content));
        }
        req.end();
      });
    }

    const arrivedAt = Date.now();
    logger.info(`Received request from: '${request.HttpMethod} ${request.Url} , content-length: ${request.Content?.byteLength ?? 0}`);
    const url = new URL(new URL(request.Url).pathname, this._options.target);
    logger.info(`Proxied request to ${getDisplayUrl(url)}`);
    if (options?.handleProxiedRequest) {
      return await options.handleProxiedRequest(request, arrivedAt, url, () => httpInvoke(url, request, abortSignal));
    } else return await httpInvoke(url, request, abortSignal);
  }
}
