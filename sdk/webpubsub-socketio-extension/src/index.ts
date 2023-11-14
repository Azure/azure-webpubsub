// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  addProperty,
  NegotiateOptions,
  NegotiateResponse,
  ConfigureNegotiateOptions,
  AzureSocketIOCommonOptions,
  AzureSocketIOOptions,
  AzureSocketIOCredentialOptions,
} from "./common/utils";
import { useAzureSocketIO, useAzureSocketIOChain } from "./SIO";
import { negotiate, usePassport, restorePassport } from "./SIO/components/negotiate";
import * as SIO from "socket.io";

declare module "socket.io" {
  interface Server {
    useAzureSocketIO(
      this: Server,
      webPubSubOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions
    ): Promise<Server>;
  }
}

addProperty(SIO.Server.prototype, "useAzureSocketIO", useAzureSocketIOChain);

export {
  useAzureSocketIO,
  negotiate,
  usePassport,
  restorePassport,
  NegotiateOptions,
  NegotiateResponse,
  ConfigureNegotiateOptions,
  AzureSocketIOCommonOptions,
  AzureSocketIOOptions,
  AzureSocketIOCredentialOptions,
};
