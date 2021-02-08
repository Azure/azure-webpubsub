// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { HttpHeaders, WebResourceLike, ServiceClientCredentials } from "@azure/ms-rest-js";
import jwt from "jsonwebtoken";

export class WebPubSubKeyCredentials implements ServiceClientCredentials {
  key: string;
  
  /**
   * Creates a new TokenCredentials object.
   *
   * @constructor
   * @param {string} key The key.
   */
  constructor(key: string) {
    if (!key) {
      throw new Error("token cannot be null or undefined.");
    }
    this.key = key;
  }

  /**
   * Signs a request with the Authentication header.
   *
   * @param {WebResourceLike} webResource The WebResourceLike to be signed.
   * @return {Promise<WebResourceLike>} The signed request object.
   */
  signRequest(webResource: WebResourceLike) {
    if (!webResource.headers) webResource.headers = new HttpHeaders();
    var url = new URL(webResource.url + webResource.query ?? '');
    url.port = '';
    const audience = url.toString();
    webResource.headers.set(
      "Authorization",
      "Bearer " +
        jwt.sign({}, this.key, {
          audience: audience,
          expiresIn: "1h",
          algorithm: "HS256"
        })
    );
    return Promise.resolve(webResource);
  }
}
