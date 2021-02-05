// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceRestClient, WebPubSubServiceRestClientOptions } from "./webPubSubServiceRestClient";

import { EventRequest, EventResponse, ProtocolParser, EventHandlerOptions, DefaultEventHandler } from "./webPubSubEventProtocols"
import { IncomingMessage, ServerResponse } from "http";
import express from "express";

export interface WebPubSubServerOptions extends WebPubSubServiceRestClientOptions, EventHandlerOptions {
  eventHandlerUrl?: string;
}

/**
 * Client for connecting to a SignalR hub
 */
export class WebPubSubServer extends WebPubSubServiceRestClient {

  /**
   * The name of the hub this client is connected to
   */
  public readonly hub?: string;
  /**
   * The SignalR API version being used by this client
   */
  public readonly apiVersion: string = "2020-10-01";

  public readonly eventHandlerUrl: string;

  /**
   * The SignalR endpoint this client is connected to
   */
  public endpoint!: string;

  private _parser: ProtocolParser;
  constructor(connectionString: string, options?: WebPubSubServerOptions) {
    super(connectionString, options);
    this.hub = options?.hub;
    this._parser = new ProtocolParser(new DefaultEventHandler(options));
    this.eventHandlerUrl = options?.eventHandlerUrl ?? '/api/webpubsub' + (this.hub? `/hubs/${this.hub}` : '');
  }

  public Process(req: EventRequest): EventResponse {
    var result = this._parser.getResponse(req);
    if (result === undefined) {
      return { body: undefined };
    }
    return result;
  }

  public async handleNodeRequest(request: IncomingMessage, response: ServerResponse) : Promise<boolean>{
    if (request.method !== 'POST'){
      return false;
    }

    if (request.url?.toLowerCase() !== this.eventHandlerUrl.toLowerCase() ){
      return false;
    }

    var result = await this._parser.processNodeHttpRequest(request);
    response.end(result?.body ?? '');
    return true;
  }

  public getMiddleware() : express.Router {
    const router = express.Router();
    router.use(this.eventHandlerUrl, (req, res, next) => {
      if (!this.handleNodeRequest(req, res)){
        return next();
      }
    });
    return router;
  }
}
