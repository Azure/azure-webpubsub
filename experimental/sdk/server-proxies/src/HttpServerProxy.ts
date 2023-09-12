import { AbortSignal } from "@azure/abort-controller";
import { TokenCredential, AzureKeyCredential, isTokenCredential } from "@azure/core-auth";
import { AbortSignalLike } from "@azure/abort-controller";
import { parseConnectionString } from "./utils";
import http from "http";
import { HttpRequestLike, HttpResponseLike, TunnelConnection, TunnelIncomingMessage, TunnelOutgoingMessage, TunnelRequestHandler } from "./tunnels/TunnelConnection";
import { logger } from "./logger";
import jwt from "jsonwebtoken";

export interface HttpServerProxyOptions {
  /**
   * The target HTTP server base url, e.g. https://localhost:8080
   */
  target: string;
}

export interface RunOptions {
  onProxiedRequestEnd?: (request: TunnelIncomingMessage, arrivedAt: number, proxiedUrl: URL, response: TunnelOutgoingMessage, err?: Error) => void;
}

const apiVersion = "2023-07-01";

export class HttpServerProxy {
  private _tunnel: TunnelConnection;

  static fromConnectionString(connectionString: string, hub: string, options: HttpServerProxyOptions, reverseProxyEndpoint?: string): HttpServerProxy {
    const { credential, endpoint } = parseConnectionString(connectionString);
    return new HttpServerProxy(endpoint, credential, hub, options, reverseProxyEndpoint);
  }

  constructor(public endpoint: string, public credential: AzureKeyCredential | TokenCredential, public hub: string, private _options: HttpServerProxyOptions, reverseProxyEndpoint?: string) {
    this.endpoint = this.endpoint.endsWith("/") ? this.endpoint : this.endpoint + "/";
    const tunnel = (this._tunnel = new TunnelConnection(endpoint, credential, hub, undefined, reverseProxyEndpoint));
  }

  public runAsync(options: RunOptions, abortSignal?: AbortSignal): Promise<void> {
    this._tunnel.requestHandler = (r, a) => this.sendHttpRequest(r, options, a);
    return this._tunnel.runAsync(abortSignal);
  }

  public async getClientAccessUrl(userId?: string, roles?: string[], groups?: string[]): Promise<string> {
    let token : string | undefined;
    if (isTokenCredential(this.credential)) {
      let request = {
        method: "POST",
        url: this._getUrl(`/api/hubs/${this.hub}/:generateToken`),
        // todo: append query to the url
      } as HttpRequestLike;
      let response = await this._tunnel.invokeAsync(request);
      if (response.statusCode !== 200) {
        throw new Error(`addConnectionsToGroups got unexpected status code ${response.statusCode}`);
      }
      async function readBody(response: HttpResponseLike) : Promise<Uint8Array> {
        const data = [];
        
        // Iterate over the async iterator
        for await (const chunk of response.body) {
          data.push(chunk);
        }
        const totalLength = data.reduce((length, array) => length + array.length, 0);

        const mergedArray = new Uint8Array(totalLength);
      
        let offset = 0;
        for (const array of data) {
          mergedArray.set(array, offset);
          offset += array.length;
        }
        return mergedArray;
      }

      const decoder = new TextDecoder();
      token = JSON.parse(decoder.decode(await(readBody(response)))).token;
    } else {
      const credential = this.credential;
      const key = credential.key;
      const audience = `${this.endpoint}client/hubs/${this.hub}`;
      const payload = { role: roles, "webpubsub.group": groups };
      const signOptions: jwt.SignOptions = {
        audience: audience,
        expiresIn: "1h",
        algorithm: "HS256",
      };
      if (userId) {
        signOptions.subject = userId;
      }
      token = jwt.sign(payload, key, signOptions);
    }
    return `${this.endpoint.replace(/^http/i, "ws")}client/hubs/${this.hub}?access_token=${token}`;
  }

  public async getLiveTraceUrl(): Promise<string> {
    let url = new URL(this.endpoint);
    let token: string | undefined;
    let toolToken:string | undefined;
    if (isTokenCredential(this.credential)) {
      toolToken = token = (await this.credential.getToken("https://webpubsub.azure.com"))?.token;
    } else {
      token = jwt.sign({}, this.credential.key,  {
        audience:  `${this.endpoint}livetrace`,
        expiresIn: "1h",
        algorithm: "HS256",
      });
      toolToken = jwt.sign({}, this.credential.key,  {
        audience:  `${this.endpoint}livetrace/tool`,
        expiresIn: "1h",
        algorithm: "HS256",
      });
    }

    return `${this.endpoint}livetrace/tool?livetrace_access_token=${token}&access_token=${toolToken}`;
  }

  private _getUrl(path: string, query?: Record<string, string> | undefined): string {
    const baseUrl = "https://host";
    const url = new URL(baseUrl);
    url.pathname = path;
    url.searchParams.append("api-version", apiVersion);
    if (query) {
      for (const key in query) {
        url.searchParams.append(key, query[key]);
      }
    }
    return url.toString();
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
      const url = new URL(new URL(request.Url).pathname, this._options.target);
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
