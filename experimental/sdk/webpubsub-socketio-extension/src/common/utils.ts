// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceClient, WebPubSubServiceClientOptions } from "@azure/web-pubsub";
import { AzureKeyCredential, TokenCredential } from "@azure/core-auth";
import debugModule from "debug";

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

// 2 option definitions refer to https://github.com/Azure/azure-sdk-for-js/blob/%40azure/web-pubsub_1.1.1/sdk/web-pubsub/web-pubsub/review/web-pubsub.api.md?plain=1#L173
export interface WebPubSubExtensionOptions {
  connectionString: string;
  hub: string;
  path: string;
  webPubSubServiceClientOptions?: WebPubSubServiceClientOptions;
}

export interface WebPubSubExtensionCredentialOptions {
  endpoint: string;
  credential: AzureKeyCredential | TokenCredential;
  hub: string;
  path: string;
  webPubSubServiceClientOptions?: WebPubSubServiceClientOptions;
}

export function getWebPubSubServiceClient(options: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions) {
  // if owns connection string, handle as `WebPubSubExtensionOptions`
  if (Object.keys(options).indexOf("connectionString") !== -1) {
    const requiredKeys = ["connectionString", "hub", "path"];

    for (const key in requiredKeys) {
      if (!options[key] || options[key] === "")
        throw new Error(`Expect valid ${key} is required, got null or empty value.`);
    }

    return new WebPubSubServiceClient(
      this._webPubSubOptions["connectionString"],
      this._webPubSubOptions["hub"],
      this._webPubSubOptions["webPubSubServiceClientOption"]
    );
  } else {
    const requiredKeys = ["endpoint", "credential", "hub", "path"];
    for (const key in requiredKeys) {
      if (!options[key] || options[key] === "")
        throw new Error(`Expect valid ${key} is required, got null or empty value.`);
    }
    return new WebPubSubServiceClient(
      options["endpoint"],
      options["credential"],
      options["hub"],
      options["webPubSubServiceClientOption"]
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

export { debugModule };
