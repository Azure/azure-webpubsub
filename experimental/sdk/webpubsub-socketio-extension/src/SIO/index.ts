// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule, WebPubSubExtensionOptions, WebPubSubExtensionCredentialOptions } from "../common/utils";
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io";
import { Adapter } from "socket.io-adapter";
import { IncomingMessage, ServerResponse } from "http";
import { GenerateClientTokenOptions } from "@azure/web-pubsub";
import { InprocessServerProxy } from "../serverProxies";
import { parse } from "url";

const debug = debugModule("wps-sio-ext:SIO:index");
debug("load");

declare type AdapterConstructor = typeof Adapter | ((nsp: SIO.Namespace) => Adapter);

export async function useAzureSocketIO(
  this: SIO.Server,
  webPubSubOptions: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions,
  useDefaultAdapter = false
): Promise<SIO.Server> {
  debug(
    `useAzureSocketIO, webPubSubOptions: ${JSON.stringify(webPubSubOptions)}, useDefaultAdapter: ${useDefaultAdapter}`
  );
  const engine = new WebPubSubEioServer(this.engine.opts, webPubSubOptions);
  const httpServer = this["httpServer"];
  engine.attach(httpServer, this["opts"]);

  // Using Tunnel
  if (engine.webPubSubConnectionManager.service instanceof InprocessServerProxy) {
    await engine.setup();
  }

  // `attachServe` is a Socket.IO design which attachs static file serving to internal http server.
  // Creating new engine makes previous `attachServe` execution invalid.
  // Reference: https://github.com/socketio/socket.io/blob/4.6.2/lib/index.ts#L518
  debug("serve static file");
  if (this["_serveClient"]) {
    this["attachServe"](httpServer);
  }

  // Add negotiate handler
  debug("add negotiate handler");

  const path = this._opts.path || "/socket.io";
  const negotiatePathPrefix = path + (path.endsWith("/") ? "" : "/") + "negotiate";

  const listeners = httpServer.listeners("request").slice(0);
  httpServer.removeAllListeners("request");
  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    if (negotiatePathPrefix === req.url.slice(0, negotiatePathPrefix.length)) {
      if (!webPubSubOptions.negotiate) {
        webPubSubOptions.negotiate = getDefaultNegotiateHandler(engine);
      }
      webPubSubOptions.negotiate(req, res, engine.webPubSubConnectionManager.service.getClientAccessTokenUrl);
    } else {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i].call(httpServer, req, res);
      }
    }
  });

  this.bind(engine);

  if (!useDefaultAdapter) {
    debug("use webPubSub adatper");

    // TODO: change undefined to serverProxy to enable server to service side tunneling
    const adapterProxy = new WebPubSubAdapterProxy(
      (this.engine as WebPubSubEioServer).webPubSubConnectionManager.service
    );
    this.adapter(adapterProxy as unknown as AdapterConstructor);
  }
  return this;
}

function getDefaultNegotiateHandler(
  engine: WebPubSubEioServer
): (
  req: IncomingMessage,
  res: ServerResponse,
  getClientAccessTokenUrl: (options?: GenerateClientTokenOptions) => Promise<string>
) => Promise<void> {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    getClientAccessTokenUrl: (options?: GenerateClientTokenOptions) => Promise<string>
  ): Promise<void> => {
    let statusCode = 400,
      message = "Bad Request";
    try {
      const username = parse(req.url || "", true).query["username"] as string;
      const endpointWithToken = await getClientAccessTokenUrl({ userId: username ?? "" });
      statusCode = 200;
      message = endpointWithToken;
    } catch (e) {
      statusCode = 400;
      message = e.message;
    } finally {
      res.writeHead(statusCode, { "Content-Type": "text/plain" });
      res.end(message);
    }
  };
}

export { WebPubSubAdapterProxy };
