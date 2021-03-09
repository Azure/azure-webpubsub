// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceRestClient, WebPubSubServiceRestClientOptions } from "./webPubSubServiceRestClient";

import { UserEventResponse, ProtocolParser, EventHandlerOptions, DefaultEventHandler } from "./webPubSubEventProtocols"
import { IncomingMessage, ServerResponse } from "http";
import express from "express";
import { Message } from "cloudevents";
import { URL } from "url";
import { url } from "inspector";

export interface WebPubSubServerOptions extends WebPubSubServiceRestClientOptions, EventHandlerOptions {
  eventHandlerUrl?: string;
}

export interface EventRequest extends Message {
}

/**
 * Client for connecting to a SignalR hub
 */
export class WebPubSubServer extends WebPubSubServiceRestClient {

  /**
   * The name of the hub this client is connected to
   */
  public readonly hub: string;
  public readonly apiVersion: string = "2020-10-01";

  public readonly eventHandlerUrl: string;

  private _serviceHost: string;

  private _parser: ProtocolParser;
  constructor(connectionString: string, hub: string, options?: WebPubSubServerOptions) {
    super(connectionString, hub, options);
    this.hub = hub;
    this._serviceHost = this.serviceUrl.host;
    this._parser = new ProtocolParser(this.hub, new DefaultEventHandler(options), options?.dumpRequest);
    this.eventHandlerUrl = options?.eventHandlerUrl ?? `/api/webpubsub/hubs/${this.hub}`;
  }

  public async Process(req: EventRequest): Promise<UserEventResponse> {
    var result = await this._parser.getResponse(req);
    if (result === undefined) {
      return { body: undefined };
    }
    return result;
  }

  public async handleNodeRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    var abuseHost = this.tryHandleAbuseProtectionRequest(request);
    if (abuseHost){
      response.setHeader("WebHook-Allowed-Origin", abuseHost);
      response.end();
      return true;
    }

    if (request.method !== 'POST') {
      return false;
    }

    if (request.url?.toLowerCase() !== this.eventHandlerUrl.toLowerCase()) {
      return false;
    }

    var result = await this._parser.processNodeHttpRequest(request);
    if (result?.body) {
      if (typeof (result.body) === 'string') {
        response.setHeader("Content-Type", "text/plain");
      }
    }
    response.end(result?.body ?? '');
    return true;
  }

  public getMiddleware(): express.Router {
    const router = express.Router();
    router.use(this.eventHandlerUrl, async (req, res) => {
      var abuseHost = this.tryHandleAbuseProtectionRequest(req);
      if (abuseHost){
        res.setHeader("WebHook-Allowed-Origin", abuseHost);
        res.end();
        return;
      }
      
      if (req.method !== 'POST') {
        res.status(400).send('Invalid method ' + req.method);
        return;
      }

      var result = await this._parser.processNodeHttpRequest(req);
      if (result?.body) {
        if (typeof (result.body) === 'string') {
          res.type('text');
        }
      }
      res.end(result?.body ?? '');
    });
    return router;
  }

  private tryHandleAbuseProtectionRequest(req: IncomingMessage) : string | undefined {
    if (req.method === 'OPTIONS') {
      if (req.headers['WebHook-Request-Origin'] === this._serviceHost ){
        return this._serviceHost;
      }
    }

    return undefined;
  }
}
