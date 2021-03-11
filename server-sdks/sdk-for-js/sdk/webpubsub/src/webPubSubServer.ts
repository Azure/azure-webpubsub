// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubHubConnectionManager, WebPubSubServiceRestClient, WebPubSubServiceRestClientOptions } from "./webPubSubServiceRestClient";
import { WebPubSubServiceEndpoint } from "./webPubSubServiceEndpoint";

import { ProtocolParser, ConnectRequest, ConnectResponse, UserEventResponse, UserEventRequest, ConnectedRequest, DisconnectedRequest, ProtocolParserEventHandler } from "./webPubSubEventProtocols"
import { IncomingMessage, ServerResponse } from "http";
import express from "express";
import { Message } from "cloudevents";

export interface WebPubSubHubContext {
  manager: WebPubSubHubConnectionManager;
}

export interface WebPubSubEventProcessor {
  onConnect?: (r: ConnectRequest, context: WebPubSubHubContext) => Promise<ConnectResponse>
  onUserEvent?: (r: UserEventRequest, context: WebPubSubHubContext) => Promise<UserEventResponse>
  onConnected?: (r: ConnectedRequest, context: WebPubSubHubContext) => Promise<void>;
  onDisconnected?: (r: DisconnectedRequest, context: WebPubSubHubContext) => Promise<void>;
}

export interface WebPubSubServerOptions extends WebPubSubServiceRestClientOptions {
  eventHandlerUrl?: string;
}

export interface EventRequest extends Message {
}

/**
 * Client for connecting to a SignalR hub
 */
export class WebPubSubHttpProtocolHandler {

  public readonly path: string;

  private _serverToServiceHandler: WebPubSubServiceRestClient;
  private _serviceToServerHandler: ProtocolParser;

  private _serviceHost: string;
  private _endpoint: WebPubSubServiceEndpoint;

  constructor(connectionString: string, private hub: string, eventProcessor?: WebPubSubEventProcessor, options?: WebPubSubServerOptions) {
    this._endpoint = new WebPubSubServiceEndpoint(connectionString);
    this._serverToServiceHandler = new WebPubSubServiceRestClient(this._endpoint, hub, options);
    this.path = (options?.eventHandlerUrl ?? `/api/webpubsub/hubs/${hub}`).toLowerCase();
    this.hub = hub;


    this._serviceHost = this._serverToServiceHandler.serviceUrl.host;

    this._serviceToServerHandler = new ProtocolParser(this.hub, this.getCloudEventHandler(eventProcessor), options?.dumpRequest);
  }

  private getCloudEventHandler(eventProcessor?: WebPubSubEventProcessor): ProtocolParserEventHandler {
    const context: WebPubSubHubContext = {
      manager: this._serverToServiceHandler
    };
    return {
      onConnect: eventProcessor?.onConnect !== undefined ? r => eventProcessor.onConnect!(r, context) : undefined,
      onUserEvent: eventProcessor?.onUserEvent !== undefined ? r => eventProcessor.onUserEvent!(r, context) : undefined,
      onConnected: eventProcessor?.onConnected !== undefined ? r => eventProcessor.onConnected!(r, context) : undefined,
      onDisconnected: eventProcessor?.onDisconnected !== undefined ? r => eventProcessor.onDisconnected!(r, context) : undefined,
    }
  }


  public async handleNodeRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
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
    if (request.headers['WebHook-Request-Origin'] === this._serviceHost) {
      response.setHeader("WebHook-Allowed-Origin", this._serviceHost);
    } else {
      response.statusCode = 400
    }
    response.end();
    return true;
  }

  private async tryHandleCloudEvents(request: IncomingMessage, response: ServerResponse, url: string): Promise<boolean> {
    console.log(url);
    if (url !== this.path) {
      return false;
    }
    if (request.method !== 'POST') {
      response.statusCode = 400;
      response.end();
      return true;
    }
    await this._serviceToServerHandler.processNodeHttpRequest(request, response);
    return true;
  }
}
