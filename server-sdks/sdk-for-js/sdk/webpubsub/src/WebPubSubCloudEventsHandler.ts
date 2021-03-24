// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { URL } from "url";
import { CloudEventsDispatcher, WebPubSubEventHandler } from "./webPubSubCloudEventsDispatcher";
import { IncomingMessage, ServerResponse } from "http";
import express from "express";

/**
 * The options for the CloudEvents handler
 */
export interface WebPubSubEventHandlerOptions extends WebPubSubEventHandler {
  /**
   * Custom serving path for the path of the CloudEvents handler
   */
  path?: string;

  /**
   * Configures if you'd like to dump the incoming HTTP request
   */
  dumpRequest?: boolean;
}

/**
 * The handler to handle incoming CloudEvents messages
 */
export class WebPubSubCloudEventsHandler {
  /**
   * The path this CloudEvents handler listens to
   */
  public readonly path: string;

  private _cloudEventsHandler: CloudEventsDispatcher;

  private _allowedOrigins: string[];

  /**
   * Creates an instance of a WebPubSubCloudEventsHandler for handling incoming CloudEvents messages.
   *
   * Example usage:
   * ```ts
   * import express from "express";
   * import { WebPubSubCloudEventsHandler } from "@azure/web-pubsub-express";
   * const endpoint = "https://xxxx.webpubsubdev.azure.com"
   * const handler = new WebPubSubCloudEventsHandler('chat', [ endpoint ] {
   *   handleConnect: async (req, res) => {
   *     console.log(JSON.stringify(req));
   *     return {};
   *   },
   *   onConnected: async req => {
   *     console.log(JSON.stringify(req));
   *   },
   *   handleUserEvent: async (req, res) => {
   *     console.log(JSON.stringify(req));
   *     res.success("Hey " + userRequest.payload.data, req.dataType);
   *    };
   *  },
   * });
   * ```
   *
   * @param hub The name of the hub to listen to
   * @param allowedEndpoints The allowed endpoints for the incoming CloudEvents request
   * @param options Options to configure the event handler
   */
  constructor(
    private hub: string,
    allowedEndpoints: string[],
    options?: WebPubSubEventHandlerOptions
  ) {
    const path = options?.path ?? `/api/webpubsub/hubs/${hub}`;
    this.path = path.endsWith("/") ? path : path + "/";
    this._allowedOrigins = allowedEndpoints.map((endpoint) => endpoint === "*" ? "*" : (new URL(endpoint).host));
    this._cloudEventsHandler = new CloudEventsDispatcher(this.hub, options, options?.dumpRequest);
  }

  /**
   * Get the middleware to be used in express
   */
  public getMiddleware(): express.Router {
    const router = express.Router();
    router.options(this.path, (request, response, next) => {
      if (!this.handleAbuseProtectionRequests(request, response)) {
        next();
      }
    });
    router.post(this.path, async (request, response, next) => {
      try {
        if (!await this._cloudEventsHandler.processRequest(request, response)) {
        next();
        }
      } catch (err) {
        next(err);
      }
    });
    return router;
  }

  private handleAbuseProtectionRequests(
    request: IncomingMessage,
    response: ServerResponse
  ): boolean {
    if (request.headers["webhook-request-origin"]) {
      response.setHeader("WebHook-Allowed-Origin", this._allowedOrigins);
      response.end();
      return true;
    }
    return false;
  }
}
