// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceRestClient, WebPubSubServiceRestClientOptions } from "./webPubSubServiceRestClient";

import { EventResponse, ProtocolParser, EventHandlerOptions, DefaultEventHandler } from "./webPubSubEventProtocols"
import { IncomingMessage, ServerResponse } from "http";
import express from "express";
import { Message } from "cloudevents";

export interface WebPubSubServerOptions extends WebPubSubServiceRestClientOptions, EventHandlerOptions {
  eventHandlerUrl?: string;
}

export interface EventRequest extends Message{
}

/**
 * Client for connecting to a SignalR hub
 */
export class WebPubSubServer extends WebPubSubServiceRestClient {

  /**
   * The name of the hub this client is connected to
   */
  public readonly hub: string;
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
    this.hub = options?.hub ?? "_default";
    this._parser = new ProtocolParser(this.hub, new DefaultEventHandler(options));
    this.eventHandlerUrl = options?.eventHandlerUrl ?? '/api/webpubsub' + (this.hub? `/hubs/${this.hub}` : '');
  }

  public async Process(req: EventRequest): Promise<EventResponse> {
    var result = await this._parser.getResponse(req);
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
