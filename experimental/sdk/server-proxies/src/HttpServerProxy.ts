import { AbortSignal } from "@azure/abort-controller";
import { TokenCredential, AzureKeyCredential } from "@azure/core-auth";
import { AbortSignalLike } from "@azure/abort-controller";
import { parseConnectionString } from "./utils";
import http from "http";
import { TunnelConnection, TunnelIncomingMessage, TunnelOutgoingMessage, TunnelRequestHandler } from "./tunnels/TunnelConnection";
import { logger } from "./logger";
export interface HttpServerProxyOptions {
  /**
   * The target HTTP server base url, e.g. https://localhost:8080
   */
  target: string;
}

export interface RunOptions {
  onProxiedRequestEnd?: (request: TunnelIncomingMessage, arrivedAt: number, proxiedUrl: URL, response: TunnelOutgoingMessage, err?: Error) => void;
}

export class HttpServerProxy {
  private _tunnel: TunnelConnection;

  static fromConnectionString(connectionString: string, hub: string, options: HttpServerProxyOptions, reverseProxyEndpoint?: string): HttpServerProxy {
    const { credential, endpoint } = parseConnectionString(connectionString);
    return new HttpServerProxy(endpoint, credential, hub, options, reverseProxyEndpoint);
  }

  constructor(public endpoint: string, credential: AzureKeyCredential | TokenCredential, public hub: string, private _options: HttpServerProxyOptions, reverseProxyEndpoint?: string) {
    const tunnel = (this._tunnel = new TunnelConnection(endpoint, credential, hub, undefined, reverseProxyEndpoint));
  }

  public runAsync(options: RunOptions, abortSignal?: AbortSignal): Promise<void> {
    this._tunnel.requestHandler = (r,a) => this.sendHttpRequest(r, options, a);
    return this._tunnel.runAsync(abortSignal);
  }

  private sendHttpRequest(request: TunnelIncomingMessage, options?: RunOptions, abortSignal?: AbortSignalLike): Promise<TunnelOutgoingMessage> {
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
    return new Promise<TunnelOutgoingMessage>((resolve, reject) => {
      abortSignal?.addEventListener("abort", () => reject("aborted"));
      const arrivedAt = Date.now();
      logger.info(`Received request from: '${request.HttpMethod} ${request.Url} ${request.Content?.byteLength ?? 0}`);
      const url = new URL(this._options.target, new URL(request.Url).pathname);
      logger.info(`Proxied request to ${getDisplayUrl(url)}`);
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
            logger.info(`Received proxied response for '${getDisplayUrl(url)}: ${res.statusCode ?? 0}'`);
            const tunnelResponse = {
              StatusCode: res.statusCode ?? 0,
              Headers: convertHeaders(res.headers),
              Content: new Uint8Array(Buffer.concat(chunks)),
            };
            options?.onProxiedRequestEnd?.(request, arrivedAt, url, tunnelResponse);
            resolve(tunnelResponse);
          });
        },
      );
      req.on("error", (err) => {
        logger.error(`Error forwarding request '${getDisplayUrl(url)}': ${err}`);
        
        const tunnelResponse = {
          StatusCode: 500,
          Headers: {},
          Content: new TextEncoder().encode(err.message),
        };
        options?.onProxiedRequestEnd?.(request, arrivedAt, url, tunnelResponse, err);
        resolve(tunnelResponse);
      });
      if (request.Content) {
        req.write(request.Content);
      }
      req.end();
    });
  }
}
