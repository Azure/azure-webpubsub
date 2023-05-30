import { WebPubSubExtensionOptions, debugModule } from "../../common/utils";
import { ClientConnectionContext } from "./client-connection-context";
import { WEBPUBSUB_TRANSPORT_NAME } from "./constants";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import type { BaseServer } from "engine.io";
import {
  ConnectRequest as WebPubSubConnectRequest,
  ConnectResponse as WebPubSubConnectResponse,
  WebPubSubEventHandler,
} from "@azure/web-pubsub-express";
import { Server as HttpServer } from "http";
import express from "express";

const debug = debugModule("wps-sio-ext:EIO:WebPubSubTranslator");

/**
 * A `WebPubSubTranslator` instance is created for each Engine.IO server instance. It's designed to:
 * 1. Manages all Azure Web PubSub client connections and keep them consistent with corresponding EIO clients.
 * 2. Handle upstream invoke requests from AWPS and then translate them into Engine.IO behaviours.
 * 3. Translates Engine.IO behaviours to AWPS behaviours like REST API calls.
 * 4. Makes the EIO `sid` same as its corresponding Azure Web PubSub client connection id.
 */
export class WebPubSubTranslator {
  /**
   * Each `WebPubSubTranslator` instance is bound to a Engine.IO server instance and vice versa.
   */
  public linkedEioServer: BaseServer;

  /**
   * Client for connecting to a Web PubSub hub
   */
  public serviceClient: WebPubSubServiceClient;

  /**
   * Map from the `connectionId` of each client to its corresponding logical `ClientConnectionContext`.
   */
  private _clientConnections: Map<string, ClientConnectionContext> = new Map();

  /**
   * Handle upstream invoke requests from AWPS.
   */
  private _webPubSubEventHandler: WebPubSubEventHandler;

  /**
   * Options for Azure Web PubSub service.
   */
  private _webPubSubOptions: WebPubSubExtensionOptions;

  /**
   * In native Engine.IO, the `sid` of each EIO connnection is generated by server randomly.
   * As for AWPS, it generates `ConnectionId` for each client.
   * For each EIO connection, the extension enforces its `sid` in server side is same as the ConnectionId assigned by service.
   * This array stores all `ConnectionId` which is generated by AWPS and is prepared to be assigned to EIO connection.
   */
  private _candidateSids: Array<string> = new Array();

  constructor(server: BaseServer, options: WebPubSubExtensionOptions) {
    debug("constructor");

    this.linkedEioServer = server;
    this._webPubSubOptions = options;
    this.serviceClient = new WebPubSubServiceClient(
      this._webPubSubOptions.connectionString,
      this._webPubSubOptions.hub,
      this._webPubSubOptions.webPubSubServiceClientOptions
    );

    this._webPubSubEventHandler = new WebPubSubEventHandler(this._webPubSubOptions.hub, {
      path: this._webPubSubOptions.path,
      handleConnect: async (req, res) => {
        try {
          var connectionId = req.context.connectionId;
          debug(`onConnect, connectionId = ${connectionId}`);

          var context = new ClientConnectionContext(this.serviceClient, connectionId, res);

          /**
           * Two conditions lead to returning reponse for connect event:
           *   1. The connection is accepted or refused by EIO Server and the corresponding events are triggered.
           *   2. Exception is thrown in following code
           * As a defensive measure, a timeout is set to return response in 1000ms in case of both conditions don't happen.
           */
          var timeout = setTimeout( () => { if (!context.connectResponded) { res.fail(500, `EIO server cannot handle connect request with error: Timeout 1000ms`); }}, 1000);

          var connectReq = this.convertWebPubsubConnectReqToEioHandshakeReq(req, context);

          this._candidateSids.push(connectionId);
          this._clientConnections.set(connectionId, context);
          // @ts-ignore to access private `handshake` method
          await this.linkedEioServer.handshake(WEBPUBSUB_TRANSPORT_NAME, connectReq);
        } catch (error) {
          debug(`onConnect, req = ${req}, err = ${error}`);
          res.fail(500, `EIO server cannot handle connect request with error: ${error}`);
          clearTimeout(timeout);
        }
      },

      onConnected: async (req) => {},

      handleUserEvent: async (req, res) => {
        try{
          var connectionId = req.context.connectionId;

          debug(`onUserEvent, connectionId = ${connectionId}, req.data = ${req.data}`);

          if (this._clientConnections.has(connectionId)) {
            const handlePayload = (payload: string) => {
              debug(`onUserEvent, connectionId = ${connectionId}, handle payload = ${payload}`);

              // @ts-ignore to access private `clients` property
              var packet = this.linkedEioServer.clients[connectionId].transport.parser.decodePacket(payload); // prettier-ignore

              // @ts-ignore to access private `clients` property
              this.linkedEioServer.clients[connectionId].onPacket(packet);
            };

            var payloads = (req.data as string).split(String.fromCharCode(30));
            for (var i = 0; i < payloads.length; i++) {
              handlePayload(payloads[i]);
            }
            return res.success();
          } else {
            // `UserEventResponseHandler.fail(code, ...)` cannot set `code` with 404. Only 400, 401 and 500 are available.
            return res.fail(400, `EIO server cannot find ConnectionId ${connectionId}`);
          }
        }
        catch(err){
          debug(`onUserEvent, req = ${req}, err = ${err}`);
          return res.fail(500, `EIO server cannot handle user event with error: ${err}`);
        }
      },

      onDisconnected: async (req) => {
        var connectionId = req.context.connectionId;
        debug(`onDisconnected, connectionId = ${connectionId}`);
        if (!this._clientConnections.delete(connectionId)) {
          debug(`onDisconnected, Failed to delete non-existing connectionId = ${connectionId}`);
        }
      },
    });
  }

  /**
   * @returns AWPS event handler middleware for EIO Server.
   */
  public getEventHandlerEioMiddleware() {
    /**
     * AWPS package provides Express middleware for event handlers.
     * However Express middleware is not compatiable to be directly used by EIO Server.
     * So a temporary Express App and HttpServer are created as bridges to convert Express middleware to EIO middleware.
     */
    const expressMiddleware = this._webPubSubEventHandler.getMiddleware();
    
    // Pass Web PubSub Express middlewares into Engine.IO middlewares
    let bridgeApp = express();
    bridgeApp.use(expressMiddleware);
    const bridgeHttpServer = new HttpServer(bridgeApp);

    return bridgeHttpServer.listeners("request")[0];
  } 

  public getNextSid = () => this._candidateSids.shift();

  /**
   * Convert an AWPS `connect` request to an Engine.IO `handshake` request.
   * @param req AWPS `connect` request.
   * @param context Corrsponding `ClientConnectionContext` for the connecting client. It will be used in `createTransport` to bind each transport to the correct AWPS client connection.
   */
  private convertWebPubsubConnectReqToEioHandshakeReq(
    req: WebPubSubConnectRequest,
    context: ClientConnectionContext
  ) {
    /**
     * Properties inside `handshakeRequest` are used in Engine.IO `handshake` method in `Server` class.
     * src: https://github.com/socketio/engine.io/blob/6.0.x/lib/server.ts#L396
     */
    var handshakeRequest: any = {
      method: "GET", 
      headers: req.headers,
      connection: {},
      url: this._webPubSubOptions.path,
      _query: { EIO: req.queries.EIO[0], transport: WEBPUBSUB_TRANSPORT_NAME },
      webPubSubContext: context,
    };
    // Preserve all queires. Each value of `req.queries` is an one-element array which is wrapped by AWPS. Just pick out the first element.
    // Example: req.queries = { EIO:['4'], t: ['OXhVRj0'], transport: ['polling'] }. 
    for (var key in req.queries) {
      handshakeRequest._query[key] = req.queries[key][0];
    }
    handshakeRequest._query["transport"] = WEBPUBSUB_TRANSPORT_NAME;
    return handshakeRequest;
  }
}
