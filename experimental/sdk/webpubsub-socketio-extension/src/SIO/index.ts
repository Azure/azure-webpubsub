// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  debugModule,
  WebPubSubExtensionOptions,
  WebPubSubExtensionCredentialOptions,
  GenerateClientTokenOptions,
  getWebPubSubServiceCaller,
} from "../common/utils";
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io";
import { Adapter } from "socket.io-adapter";
import { IncomingMessage, ServerResponse } from "http";
import { InprocessServerProxy } from "../serverProxies";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { RestServiceClient } from "../common/rest-service-client";

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

  // Add negotiate handler
  debug("add negotiate handler");
  const path = this._opts.path || "/socket.io";
  const negotiatePathPrefix = path + (path.endsWith("/") ? "" : "/") + "negotiate/";

  // current listeners = EIO handleRequest listeners (e.g. /socket.io) + other listeners from user
  const listeners = httpServer.listeners("request").slice(0);
  httpServer.removeAllListeners("request");
  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    req.url;
    if (negotiatePathPrefix === req.url.slice(0, negotiatePathPrefix.length)) {
      const nativeServiceClient = getWebPubSubServiceCaller(webPubSubOptions, false) as unknown as WebPubSubServiceClient;
      const negotiateHandler = getDefaultNegotiateHandler();
      negotiateHandler(
        req,
        res,
        webPubSubOptions.getGenerateClientTokenOptions,
        nativeServiceClient
      );
    } else {
      // EIO handleRequest listener handler should be skipped, but other listeners should be handled.
      for (let i = 0; i < listeners.length; i++) {
        if (path !== req.url.slice(0, path.length)) {
          listeners[i].call(httpServer, req, res);
        }
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

function getDefaultNegotiateHandler(): (
  req: IncomingMessage,
  res: ServerResponse,
  getGenerateClientTokenOptions: (req: IncomingMessage) => Promise<GenerateClientTokenOptions>,
  serviceClient: WebPubSubServiceClient
) => Promise<void> {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    getGenerateClientTokenOptions: (req: IncomingMessage) => Promise<GenerateClientTokenOptions>,
    serviceClient: WebPubSubServiceClient
  ): Promise<void> => {
    let statusCode = 500;
    let message = "Internal Server Error";
    try {
      const generateClientTokenOptions = await getGenerateClientTokenOptions(req);
      // Example: https://<web-pubsub-endpoint>?access_token=ABC.EFG.HIJ
      const endpointWithToken = (await serviceClient.getClientAccessToken(generateClientTokenOptions))
                                  .url
                                  .replace("ws://", "http://")
                                  .replace("wss://", "https://")
                                  .replace(`/client/hubs/${serviceClient.hubName}`, "");
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
