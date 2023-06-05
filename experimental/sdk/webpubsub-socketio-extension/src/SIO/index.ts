// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule, WebPubSubExtensionOptions } from "../common/utils";
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io";

const debug = debugModule("wps-sio-ext:SIO:index");
debug("load");

export function useAzureWebPubSub(
  this: SIO.Server,
  webPubSubOptions: WebPubSubExtensionOptions,
  useDefaultAdapter: boolean = true
): SIO.Server {
  debug("use Azure Web PubSub For Socket.IO Server");

  const engine = new WebPubSubEioServer(this.engine.opts, webPubSubOptions);
  engine.attach((this as any).httpServer, (this as any).opts);
  this.bind(engine as any);

  if (!useDefaultAdapter) {
    debug("use webPubSub adatper");

    const adapterProxy = new WebPubSubAdapterProxy((this.engine as any).webPubSubConnectionManager.serviceClient)
    this.adapter(adapterProxy as any);
  }
  return this;
}

export { WebPubSubAdapterProxy };
