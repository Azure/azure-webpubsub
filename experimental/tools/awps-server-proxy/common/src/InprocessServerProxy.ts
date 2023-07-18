import { TunnelConnection, TunnelOutgoingMessage, TunnelIncomingMessage } from "./tunnels/TunnelConnection";
import { Request, Response, RequestHandler } from "express-serve-static-core";
import * as http from "http";
import { Socket } from "net";
import { AbortSignalLike } from "@azure/abort-controller";
import { TokenCredential } from "@azure/core-auth";
import { createLogger } from "./logger";
import { parseConnectionString } from "./utils";

const logger = createLogger("InprocessServerProxy");

export class InprocessServerProxy {
  private _tunnel: TunnelConnection;
  static fromConnectionString(connectionString: string, hub: string, handler: RequestHandler) : InprocessServerProxy{
    const { credential, endpoint } = parseConnectionString(connectionString);
    return new InprocessServerProxy(endpoint, credential, hub, handler);
  }
  constructor(endpoint: string, credential: TokenCredential, hub: string, handler: RequestHandler) {
    this._tunnel = new TunnelConnection(endpoint, credential, hub, function (request, abortSignal) {
      const req = buildRequest(request) as Request;
      const res = new ContentInterpreteResponse(req);

      var url = new URL(request.Url);
      req.baseUrl = "";
      req.path = url.pathname;
      const responseReader = readResponse(res, abortSignal);
      handler(req, res as unknown as Response, (err?: any) => {
        // end the response
        err = "Not correctly handled. " + err ?? "";
        logger.error(err);
        res.statusCode = 500;
        res.end(err);
      });
      // make sure request content is set after request emit is registered in handler
      if (request.Content) {
        req.emit("data", request.Content);
      }
      req.emit("end");
      return responseReader;
    });
  }

  public runAsync(abortSignal?: AbortSignalLike): Promise<void> {
    return this._tunnel.runAsync(abortSignal);
  }

  public stop(): void {
    this._tunnel.stop();
  }
}

function buildRequest(tunnelRequest: TunnelIncomingMessage): http.IncomingMessage {
  const req = new http.IncomingMessage(new Socket());

  if (tunnelRequest.Headers) {
    for (const header in tunnelRequest.Headers) {
      req.headers[header.toLowerCase()] = tunnelRequest.Headers[header];
    }
  }
  req.url = tunnelRequest.Url;
  req.method = tunnelRequest.HttpMethod;
  return req;
}

/* Highly depends on current web-pubsub-express's implementation that only end is called when sending body back */
class ContentInterpreteResponse extends http.ServerResponse {
  constructor(req: http.IncomingMessage) {
    super(req);
  }

  end(cb?: (() => void) | undefined): this;
  end(chunk: any, cb?: (() => void) | undefined): this;
  end(chunk: any, encoding: BufferEncoding, cb?: (() => void) | undefined): this;
  end(chunkOrCb?: unknown, encodingOrCb?: unknown, cb?: unknown): this {
    if (chunkOrCb === undefined) {
      super.end();
    }
    if (typeof chunkOrCb === "function") {
      super.end(chunkOrCb);
    } else {
      const chunk = chunkOrCb as string | Buffer | ArrayBuffer;
      if (chunk === undefined) {
        throw new Error("Not supported data type!");
      }
      if (typeof chunk === "string") {
        // only supports utf8
        const bytes = new TextEncoder().encode(chunk);
        this.emit("data", bytes);
      } else if (ArrayBuffer.isView(chunk)) {
        this.emit("data", new Uint8Array(chunk));
      } else {
        this.emit("data", chunk);
      }
      if (encodingOrCb === undefined) {
        super.end(chunk);
      } else {
        if (typeof encodingOrCb === "function") {
          super.end(chunk, encodingOrCb as () => void);
        } else {
          super.end(chunk, encodingOrCb as BufferEncoding, cb as (() => void) | undefined);
        }
      }
    }
    this.emit("end");
    return this;
  }
  public id = ContentInterpreteResponse.name;
}

function convertHeaders(headers: http.OutgoingHttpHeaders): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const key in headers) {
    const header = headers[key];
    if (header !== undefined) {
      if (typeof header === "string") {
        result[key] = [header];
      } else if (Array.isArray(header)) {
        result[key] = header;
      }
    }
  }
  return result;
}

function readResponse(res: http.ServerResponse, abortSignal?: AbortSignalLike): Promise<TunnelOutgoingMessage> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    abortSignal?.addEventListener("abort", () => reject("cancelled"));
    res.on("data", (chunk) => {
      chunks.push(chunk);
    });
    res.on("end", () => {
      resolve({
        StatusCode: res.statusCode ?? 0,
        Headers: convertHeaders(res.getHeaders()),
        Content: new Uint8Array(Buffer.concat(chunks)),
      });
    });
    res.on("error", (err) => {
      reject(err);
    });
  });
}
