// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceEndpoint } from "./webPubSubServiceEndpoint";

import { ProtocolParser, WebPubSubEventHandler } from "./webPubSubEventProtocols"
import { IncomingMessage, ServerResponse } from "http";
import express from "express";
import { Message } from "cloudevents";
import { WebPubSubServiceRestClient, WebPubSubServiceRestClientOptions } from "./webPubSubServiceRestClient";

export interface WebPubSubEventHandlerOptions extends WebPubSubEventHandler {
  path?: string;
  dumpRequest?: boolean;
}

export interface EventRequest extends Message {
}

export class WebPubSubServer {
  public endpoint: WebPubSubServiceEndpoint;
  constructor(conn: string, private hub: string) {
    this.endpoint = new WebPubSubServiceEndpoint(conn);
  }

  public createCloudEventsHandler(options?: WebPubSubEventHandlerOptions): WebPubSubCloudEventsHandler {
    return new WebPubSubCloudEventsHandler(this.endpoint, this.hub, options);
  }

  public createServiceClient(options?: WebPubSubServiceRestClientOptions): WebPubSubServiceRestClient {
    return new WebPubSubServiceRestClient(this.endpoint, this.hub, options);
  }
}

export class WebPubSubCloudEventsHandler {

  public readonly path: string;

  private _cloudEventsHandler: ProtocolParser;

  private _serviceHost: string;
  private _endpoint: WebPubSubServiceEndpoint;

  constructor(connectionStringOrEndpoint: string | WebPubSubServiceEndpoint, private hub: string, options?: WebPubSubEventHandlerOptions) {
    if (typeof connectionStringOrEndpoint === 'string') {
      this._endpoint = new WebPubSubServiceEndpoint(connectionStringOrEndpoint);
    } else {
      this._endpoint = connectionStringOrEndpoint;
    }

    this.path = (options?.path ?? `/api/webpubsub/hubs/${hub}`).toLowerCase();
    this.hub = hub;


    this._serviceHost = this._endpoint.endpoint.serviceUrl.hostname;

    this._cloudEventsHandler = new ProtocolParser(this.hub, options, options?.dumpRequest);
  }

  public async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    var normalizedUrl = request.url?.toLowerCase();
    if (!normalizedUrl) {
      throw new Error("invalid url");
    }
    if (!(normalizedUrl === this.path || normalizedUrl.startsWith(this.path))) {
      return false;
    }

    if (this.tryHandleAbuseProtectionRequests(request, response, normalizedUrl)) {
      return true;
    }

    return await this.tryHandleCloudEvents(request, response, normalizedUrl);
  }

  public getMiddleware(): express.Router {
    const router = express.Router();
    router.use(this.path, async (request, response) => {
      var normalizedUrl = (this.path + request.url).toLowerCase();

      if (this.tryHandleAbuseProtectionRequests(request, response, normalizedUrl)) {
        return true;
      }

      await this.tryHandleCloudEvents(request, response, normalizedUrl);
    });
    return router;
  }

  private tryHandleAbuseProtectionRequests(request: IncomingMessage, response: ServerResponse, url: string): boolean {
    if (url !== this.path || request.method !== 'OPTIONS') {
      return false;
    }
    if (request.headers['webhook-request-origin'] === this._serviceHost) {
      response.setHeader("WebHook-Allowed-Origin", this._serviceHost);
    } else {
      console.log(`Invalid abuse protection request ${request}`);
      response.statusCode = 400
    }
    response.end();
    return true;
  }

  private async tryHandleCloudEvents(request: IncomingMessage, response: ServerResponse, url: string): Promise<boolean> {
    if (url !== this.path) {
      console.warn(`Url ${url} does not match ${this.path}`);
      return false;
    }
    if (request.method !== 'POST') {
      response.statusCode = 400;
      response.end();
      return true;
    }
    await this._cloudEventsHandler.processNodeHttpRequest(request, response);
    return true;
  }
}
