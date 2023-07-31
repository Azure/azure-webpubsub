// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  addProperty,
  GenerateClientTokenOptions,
  WebPubSubExtensionCommonOptions,
  WebPubSubExtensionOptions,
  WebPubSubExtensionCredentialOptions,
} from "./common/utils";
import { useAzureSocketIO, useAzureSocketIOChain } from "./SIO";
import * as SIO from "socket.io";

declare module "socket.io" {
  interface Server {
    useAzureSocketIO(
      this: Server,
      webPubSubOptions: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions
    ): Server;
  }
}

addProperty(SIO.Server.prototype, "useAzureSocketIO", useAzureSocketIOChain);

export {
  useAzureSocketIO,
  GenerateClientTokenOptions,
  WebPubSubExtensionCommonOptions,
  WebPubSubExtensionOptions,
  WebPubSubExtensionCredentialOptions,
};
