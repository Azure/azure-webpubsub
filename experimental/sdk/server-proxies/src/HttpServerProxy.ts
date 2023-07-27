import { AbortSignal } from "@azure/abort-controller";
import { TokenCredential } from "@azure/core-auth";
import { AbortSignalLike } from "@azure/abort-controller";
import http from "http";
import { TunnelConnection, TunnelIncomingMessage, TunnelOutgoingMessage } from "./tunnels/TunnelConnection";

export class HttpServerProxy {
  private _tunnel: TunnelConnection;

  constructor(endpoint: string, credential: TokenCredential, hub: string) {
    const tunnel = (this._tunnel = new TunnelConnection(endpoint, credential, hub, this.sendHttpRequest));
  }

  public runAsync(abortSignal: AbortSignal): Promise<void> {
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
      const req = http.request(
        request.Url,
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
        }
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
