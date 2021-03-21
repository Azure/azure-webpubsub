// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import jwt from "jsonwebtoken";
import * as coreHttp from "@azure/core-http";

export class WebPubSubKeyCredentials implements coreHttp.ServiceClientCredentials {
  /**
   * Creates a new TokenCredentials object.
   *
   * @constructor
   * @param {string} key The key.
   */
  constructor(public key: string) {
    if (!key) {
      throw new Error("token cannot be null or undefined.");
    }
  }

  /**
   * Signs a request with the Authentication header.
   *
   * @param {WebResourceLike} webResource The WebResourceLike to be signed.
   * @return {Promise<WebResourceLike>} The signed request object.
   */
  signRequest(webResource: coreHttp.WebResourceLike) {
    if (!webResource.headers) webResource.headers = new coreHttp.HttpHeaders();
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
