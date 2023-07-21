// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  debugModule,
  WebPubSubExtensionOptions,
  WebPubSubExtensionCredentialOptions,
  getWebPubSubServiceCaller,
} from "../common/utils";
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io";
import { Adapter } from "socket.io-adapter";
import { InprocessServerProxy } from "awps-tunnel-proxies";

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
  engine.attach(this["httpServer"], this["opts"]);

  // Using Tunnel
  if (engine.webPubSubConnectionManager.service instanceof InprocessServerProxy) {
    await engine.setup();
  }

  // `attachServe` is a Socket.IO design which attachs static file serving to internal http server.
  // Creating new engine makes previous `attachServe` execution invalid.
  // Reference: https://github.com/socketio/socket.io/blob/4.6.2/lib/index.ts#L518
  if (this["_serveClient"]) {
    this["attachServe"](this["httpServer"]);
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

export { WebPubSubAdapterProxy };
