// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceClientOptions } from "@azure/web-pubsub";
import debugModule from "debug";

export const T = (now: Date): string => `${now.toLocaleString().replace(" AM", "").replace(" PM", "")}:${now.getMilliseconds().toString().padStart(3, '0')}`; // prettier-ignore

debugModule.log = (msg, ...args): void => {
  const timestamp = T(new Date());
  console.log(`[${timestamp}] ${msg}`, ...args);
};

export function addProperty(o: object, p: string, f: (...args: any[]) => any): void {
  Object.defineProperty(o, p, {
    value: f,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

export interface WebPubSubExtensionOptions {
  connectionString: string;
  hub: string;
  path: string;
  webPubSubServiceClientOptions?: WebPubSubServiceClientOptions;
}

export { debugModule };
