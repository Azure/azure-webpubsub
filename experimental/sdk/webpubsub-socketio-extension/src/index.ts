// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { addProperty, WebPubSubExtensionOptions, WebPubSubExtensionCredentialOptions } from "./common/utils";
import { useAzureSocketIO } from "./SIO";
import * as SIO from "socket.io";

/**
 * User could call this empty method to ensure this package will be imported.
 * Under some circumstances, node skips importing this package for user's code has no explicit usage of this package.
 */
export function init(): void {
  // do nothing
}

declare module "socket.io" {
  interface Server {
    useAzureSocketIO(
      this: Server,
      webPubSubOptions: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions
    ): Server;
  }
}

addProperty(SIO.Server.prototype, "useAzureSocketIO", useAzureSocketIO);

export * from "./EIO";
export * from "./SIO";
export { WebPubSubExtensionOptions, WebPubSubExtensionCredentialOptions };
