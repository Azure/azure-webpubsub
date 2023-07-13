// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceClientOptions } from "@azure/web-pubsub";
import debugModule from "debug";
import { BroadcastOptions } from "socket.io-adapter";

export const T = (now: Date): string => `${now.toLocaleString().replace(" AM", "").replace(" PM", "")}:${now.getMilliseconds().toString().padStart(3, '0')}`; // prettier-ignore

debugModule.log = (msg, ...args): void => {
  const timestamp = T(new Date());
  console.log(`[${timestamp}] ${msg}`, ...args);
};

export function addProperty(o: object, p: string, f: (...args: unknown[]) => unknown): void {
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
