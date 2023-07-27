// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceClientOptions } from "@azure/web-pubsub";
import { AzureKeyCredential, TokenCredential } from "@azure/core-auth";
import debugModule from "debug";
import { BroadcastOptions } from "socket.io-adapter";
import { RestServiceClient } from "./rest-service-client";
import { InprocessServerProxy, WebPubSubServiceCaller } from "../serverProxies";

export const T = (now: Date): string => `${now.toLocaleString().replace(" AM", "").replace(" PM", "")}:${now.getMilliseconds().toString().padStart(3, '0')}`; // prettier-ignore

debugModule.log = (msg, ...args): void => {
  const timestamp = T(new Date());
  console.log(`[${timestamp}] ${msg}`, ...args);
};

const debug = debugModule("wps-sio-ext:common:utils");

export function addProperty(o: object, p: string, f: (...args: unknown[]) => unknown): void {
  Object.defineProperty(o, p, {
    value: f,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// 2 option definitions refer to https://github.com/Azure/azure-sdk-for-js/blob/%40azure/web-pubsub_1.1.1/sdk/web-pubsub/web-pubsub/review/web-pubsub.api.md?plain=1#L173
export interface WebPubSubExtensionOptions {
  connectionString: string;
  hub: string;
  webPubSubServiceClientOptions?: WebPubSubServiceClientOptions;
}

export interface WebPubSubExtensionCredentialOptions {
  endpoint: string;
  credential: AzureKeyCredential | TokenCredential;
  hub: string;
  webPubSubServiceClientOptions?: WebPubSubServiceClientOptions;
}

export function getWebPubSubServiceCaller(
  options: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions,
  useTunnel = true
): WebPubSubServiceCaller {
  debug(`getWebPubSubServiceCaller, ${JSON.stringify(options)}, useTunnel: ${useTunnel}`);
  // if owns connection string, handle as `WebPubSubExtensionOptions`
  if (Object.keys(options).indexOf("connectionString") !== -1) {
    debug(`getWebPubSubServiceCaller, use connection string`);

    const requiredKeys = ["connectionString", "hub"];

    for (const key of requiredKeys) {
      if (!options[key] || options[key] === "")
        throw new Error(`Expect valid ${key} is required, got null or empty value.`);
    }
    return useTunnel
      ? InprocessServerProxy.fromConnectionString(options["connectionString"], options.hub)
      : new RestServiceClient(options["connectionString"], options.hub, options.webPubSubServiceClientOptions);
  } else {
    debug(`getWebPubSubServiceCaller, use credential`);

    const requiredKeys = ["endpoint", "credential", "hub"];
    for (const key of requiredKeys) {
      if (!options[key] || options[key] === "")
        throw new Error(`Expect valid ${key} is required, got null or empty value.`);
    }
    return useTunnel
      ? new InprocessServerProxy(options["endpoint"], options["credential"], options.hub)
      : new RestServiceClient(
          options["endpoint"],
          options["credential"],
          options.hub,
          options.webPubSubServiceClientOptions
        );
  }
}

/**
 * Convert a sync function with callback parameter to its async form.
 * @param syncFunc - a sync function with callback as its last parameter
 * @returns the async function converted from sync function `syncFunc`
 */
export function toAsync<T>(syncFunc: (...args: unknown[]) => unknown): (...args: unknown[]) => Promise<T> {
  return (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      try {
        syncFunc(...args, (ret: T) => {
          resolve(ret);
        });
      } catch (error) {
        reject(error);
      }
    });
}

/**
 * Stringify a set or list of string .
 * @param set - a set or list of string. Example: Set\<string\>{"a", "b"}
 * @returns the stringified set. Example: "{ "a", "b" }"
 */
export function toString(set: Set<string> | string[] | IterableIterator<string>): string {
  // if (set.rooms) return `${{toString(set.rooms)}}`
  return set ? `{ "${[...set].join('", "')}" }` : "{}";
}

// `JSON.stringify` cannot stringify `BroadcastOptions` completely. `rooms` and `except` detail will be lost.
export function toOptionsString(option: BroadcastOptions): string {
  return `{rooms: ${toString(option.rooms)}, except: ${toString(option.except)},\
flags: ${JSON.stringify(option.flags)}}`;
}

export { debugModule };
