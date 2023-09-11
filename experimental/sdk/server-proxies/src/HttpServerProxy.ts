import { AbortSignal } from "@azure/abort-controller";
import { TokenCredential, AzureKeyCredential } from "@azure/core-auth";
import { AbortSignalLike } from "@azure/abort-controller";
import { parseConnectionString } from "./utils";
import http from "http";
import { TunnelConnection, TunnelIncomingMessage, TunnelOutgoingMessage } from "./tunnels/TunnelConnection";

export interface HttpServerProxyOptions {
  /**
   * The target HTTP server base url, e.g. https://localhost:8080
   */
  target: string;
}

export class HttpServerProxy {
  private _tunnel: TunnelConnection;

  static fromConnectionString(connectionString: string, hub: string, options: HttpServerProxyOptions, reverseProxyEndpoint?: string): HttpServerProxy {
    const { credential, endpoint } = parseConnectionString(connectionString);
    return new HttpServerProxy(endpoint, credential, hub, options, reverseProxyEndpoint);
  }

  constructor(public endpoint: string, credential: AzureKeyCredential | TokenCredential, public hub: string, private _options: HttpServerProxyOptions, reverseProxyEndpoint?: string) {
    const tunnel = (this._tunnel = new TunnelConnection(endpoint, credential, hub, this.sendHttpRequest, reverseProxyEndpoint));
  }

  public runAsync(abortSignal?: AbortSignal): Promise<void> {
    return this._tunnel.runAsync(abortSignal);
  }

  private sendHttpRequest(request: TunnelIncomingMessage, abortSignal?: AbortSignalLike): Promise<TunnelOutgoingMessage> {
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

    return new Promise<TunnelOutgoingMessage>((resolve, reject) => {
      abortSignal?.addEventListener("abort", () => reject("aborted"));
      console.log(request.Url);
      const url = new URL(this._options.target, new URL(request.Url).pathname);
      
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
            resolve({
              StatusCode: res.statusCode ?? 0,
              Headers: convertHeaders(res.headers),
              Content: new Uint8Array(Buffer.concat(chunks)),
            });
          });
        },
      );
      req.on("error", (err) => {
        reject(err);
      });
      if (request.Content) {
        req.write(request.Content);
      }
      req.end();
    });
  }
}
