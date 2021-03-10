// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import jwt from "jsonwebtoken";
import { URL } from "url";

export interface NegotiateResponse {
  url: string;
  token: string;
}

interface ServiceEndpoint {
  serviceUrl: URL;
  websocketHost: string;
  audience: string;
  key: string;
}

interface NegotiateOptions {
  userId?: string;
  claims?: { [key: string]: string[] };
}

export class WebPubSubServiceEndpoint {
  conn: string;
  endpoint: ServiceEndpoint;

  /**
   * Creates a new WebPubSubServiceEndpoint object.
   *
   * @constructor
   * @param {string} conn The Connection String.
   */
  constructor(conn: string) {
    this.conn = conn;
    this.endpoint = this.getServiceEndpoint(conn);
  }

  clientNegotiate(hub: string, options?: NegotiateOptions): NegotiateResponse {
    var clientUrl = `${this.endpoint.websocketHost}client/hubs/${hub}`;
    const audience = `${this.endpoint.audience}client/hubs/${hub}`;
    var key = this.endpoint.key;
    var payload = options?.claims ?? {};
    var signOptions: jwt.SignOptions = {
      audience: audience,
      expiresIn: "1h",
      algorithm: "HS256",
    };
    if (options?.userId) {
      signOptions.subject = options?.userId;
    }

    return {
      url: clientUrl,
      token: jwt.sign(payload, key, signOptions),
    };
  }

  private getServiceEndpoint(conn: string): ServiceEndpoint {
    var endpoint = this.parseConnectionString(conn);

    if (!endpoint) {
      throw new Error("Invalid connection string: " + conn);
    }

    return endpoint as ServiceEndpoint;
  }

  private parseConnectionString(conn: string): ServiceEndpoint | null {
    const em = /Endpoint=(.*?)(;|$)/g.exec(conn);
    if (!em) return null;
    const endpoint = em[1];
    const km = /AccessKey=(.*?)(;|$)/g.exec(conn);
    if (!km) return null;
    const key = km[1];
    if (!endpoint || !key) return null;
    const pm = /Port=(.*?)(;|$)/g.exec(conn);
    const port = pm == null ? '' : pm[1];
    var url = new URL(endpoint);
    var originalProtocol = url.protocol;
    url.protocol = originalProtocol === 'http:' ? 'ws:' : 'wss:';
    const audience = url.toString();
    url.port = port;
    var websocketHost = url.toString();
    url.protocol = originalProtocol;
    return {
      websocketHost: websocketHost, 
      serviceUrl: url,
      audience: audience,
      key: key,
    };
  }
}
