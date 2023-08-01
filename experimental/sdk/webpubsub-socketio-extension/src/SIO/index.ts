// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  debugModule,
  WebPubSubExtensionOptions,
  WebPubSubExtensionCredentialOptions,
  NegotiateOptions,
  getWebPubSubServiceCaller,
} from "../common/utils";
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io";
import { Adapter } from "socket.io-adapter";
import { IncomingMessage, ServerResponse } from "http";
import { InprocessServerProxy } from "../serverProxies";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

const debug = debugModule("wps-sio-ext:SIO:index");
debug("load");

declare type AdapterConstructor = typeof Adapter | ((nsp: SIO.Namespace) => Adapter);

export async function useAzureSocketIOChain(
  this: SIO.Server,
  webPubSubOptions: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions
): Promise<SIO.Server> {
  debug(`useAzureSocketIOChain, webPubSubOptions: ${JSON.stringify(webPubSubOptions)}`);
  const engine = new WebPubSubEioServer(this.engine.opts, webPubSubOptions);
  const httpServer = this["httpServer"];
  engine.attach(httpServer, this["opts"]);

  // Using Tunnel
  if (engine.webPubSubConnectionManager.service instanceof InprocessServerProxy) {
    await engine.setup();
  }

  // Add negotiate handler
  debug("add negotiate handler");
  const path = this._opts.path || "/socket.io";
  const negotiatePathPrefix = path + (path.endsWith("/") ? "" : "/") + "negotiate";
  const checkNegotiate = (url: string): boolean =>
    url === negotiatePathPrefix || // url is "/socket.io/negotiate" without any extra string.
    url.startsWith(negotiatePathPrefix + "/") ||
    url.startsWith(negotiatePathPrefix + "?");

  // current listeners = EIO handleRequest listeners (e.g. /socket.io) + other listeners from user
  const listeners = httpServer.listeners("request").slice(0);
  httpServer.removeAllListeners("request");
  let nativeServiceClient: WebPubSubServiceClient;
  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    // negotiate handler
    if (webPubSubOptions.configureNegotiateOptions && checkNegotiate(req.url)) {
      nativeServiceClient = getWebPubSubServiceCaller(webPubSubOptions, false) as unknown as WebPubSubServiceClient;
      const negotiateHandler = getNegotiateHandler();
      negotiateHandler(req, res, webPubSubOptions.configureNegotiateOptions, nativeServiceClient);
      return;
    }
    // EIO handleRequest listener handler should be skipped, but other listeners should be handled.
    for (let i = 0; i < listeners.length; i++) {
      if (path !== req.url.slice(0, path.length)) {
        listeners[i].call(httpServer, req, res);
      }
    }
  });

  // `attachServe` is a Socket.IO design which attachs static file serving to internal http server.
  // Creating new engine makes previous `attachServe` execution invalid.
  // Reference: https://github.com/socketio/socket.io/blob/4.6.2/lib/index.ts#L518
  debug("serve static file");
  if (this["_serveClient"]) {
    this["attachServe"](httpServer);
  }

  this.bind(engine);

  debug("use webPubSub adatper");
  const adapterProxy = new WebPubSubAdapterProxy(
    (this.engine as WebPubSubEioServer).webPubSubConnectionManager.service
  );
  this.adapter(adapterProxy as unknown as AdapterConstructor);
  return this;
}

function getNegotiateHandler(): (
  req: IncomingMessage,
  res: ServerResponse,
  configureNegotiateOptions: (req: IncomingMessage) => Promise<NegotiateOptions>,
  serviceClient: WebPubSubServiceClient
) => Promise<void> {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    configureNegotiateOptions: (req: IncomingMessage) => Promise<NegotiateOptions>,
    serviceClient: WebPubSubServiceClient
  ): Promise<void> => {
    let statusCode = 500;
    let message = {};
    try {
      const negotiateOptions = await configureNegotiateOptions(req);

      // Example: https://<web-pubsub-endpoint>?access_token=ABC.EFG.HIJ
      const tokenResponse = await serviceClient.getClientAccessToken(negotiateOptions);
      const url = new URL(req.url, tokenResponse.baseUrl);
      const protocol = url.protocol.replace("wss", "https").replace("ws", "http");
      const endpointWithToken = `${protocol}//${url.host}?access_token=${tokenResponse.token}`;

      statusCode = 200;
      message = { endpoint: endpointWithToken };
    } catch (e) {
      statusCode = 500;
      message = { message: e.message };
    } finally {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(message));
    }
  };
}

export async function useAzureSocketIO(
  io: SIO.Server,
  webPubSubOptions: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions
): Promise<SIO.Server> {
  debug(`useAzureSocketIO, webPubSubOptions: ${JSON.stringify(webPubSubOptions)}`);
  return useAzureSocketIOChain.call(io, webPubSubOptions);
}

export { WebPubSubAdapterProxy };
