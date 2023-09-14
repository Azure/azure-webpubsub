// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  debugModule,
  AzureSocketIOOptions,
  AzureSocketIOCredentialOptions,
  getSioMiddlewareFromExpress,
} from "../common/utils";
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import { DEFAULT_SIO_PATH, WEB_PUBSUB_OPTIONS_PROPERY_NAME } from "./components/constants";
import { restoreClaims } from "./components/negotiate";
import * as SIO from "socket.io";
import { Adapter } from "socket.io-adapter";
import { IncomingMessage, ServerResponse } from "http";

const debug = debugModule("wps-sio-ext:SIO:index");
debug("load");

declare type AdapterConstructor = typeof Adapter | ((nsp: SIO.Namespace) => Adapter);

export async function useAzureSocketIOChain(
  this: SIO.Server,
  webPubSubOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions
): Promise<SIO.Server> {
  debug(`useAzureSocketIOChain, webPubSubOptions: ${JSON.stringify(webPubSubOptions)}`);
  const engine = new WebPubSubEioServer(this.engine.opts, webPubSubOptions);
  const httpServer = this["httpServer"];
  engine.attach(httpServer, this["opts"]);

  // Add negotiate handler
  debug("add negotiate handler");
  const path = this._opts.path || DEFAULT_SIO_PATH;

  // current listeners = EIO handleRequest listeners (e.g. /socket.io) + other listeners from user
  const listeners = httpServer.listeners("request").slice(0);
  httpServer.removeAllListeners("request");

  this[WEB_PUBSUB_OPTIONS_PROPERY_NAME] = webPubSubOptions;

  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    // EIO handleRequest listener handler should be skipped, but other listeners should be handled.
    for (let i = 0; i < listeners.length; i++) {
      // Follow the same logic as Engine.IO
      // Reference: https://github.com/socketio/engine.io/blob/6.4.2/lib/server.ts#L804
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

  // If using tunnel, wait until connected. `engine.setup` does no nothing when using REST API.
  await engine.setup();

  this.use(getSioMiddlewareFromExpress(restoreClaims()));
  return this;
}

/**
 * This method returns a Socket.IO server using Web PubSub for Socket.IO.
 *
 * @param io - the Socket.IO server instance
 * @param azureSocketIOOptions - the options of Web PubSub for Socket.IO
 * @returns a Socket.IO server instance using Web PubSub for Socket.IO
 *
 * @public
 */
export async function useAzureSocketIO(
  io: SIO.Server,
  azureSocketIOOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions
): Promise<SIO.Server> {
  debug(`useAzureSocketIO, azureSocketIOOptions: ${JSON.stringify(azureSocketIOOptions)}`);
  return useAzureSocketIOChain.call(io, azureSocketIOOptions);
}

export { WebPubSubAdapterProxy };
