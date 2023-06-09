// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubExtensionOptions } from "../common/utils";
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io";

export function useAzureWebPubSub(
  this: SIO.Server,
  webPubSubOptions: WebPubSubExtensionOptions,
  useDefaultAdapter = true
): SIO.Server {
  const engine = new WebPubSubEioServer(this.engine.opts, webPubSubOptions);

  engine.attach((this as any).httpServer, (this as any).opts);

  this.bind(engine as any);

  if (!useDefaultAdapter) {
    const adapterProxy = new WebPubSubAdapterProxy("NotImplementedArg");

    this.adapter(adapterProxy as any);
  }
  return this;
}

export { WebPubSubAdapterProxy };
