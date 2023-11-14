// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AzureSocketIOOptions, AzureSocketIOCredentialOptions, debugModule } from "../common/utils";
import { WebPubSubTransport } from "./components/web-pubsub-transport";
import { WebPubSubConnectionManager } from "./components/web-pubsub-connection-manager";
import * as engine from "engine.io";
import { InprocessServerProxy } from "../serverProxies";
import { EIO_CONNECTION_ERROR, WEBPUBSUB_TRANSPORT_NAME } from "./components/constants";
import { ClientConnectionContext } from "./components/client-connection-context";

const debug = debugModule("wps-sio-ext:EIO:index");
debug("load");

/**
 * In the design of Engine.IO package, the EIO server has its own middlewares rather than sharing with http server.
 * And EIO middlewares is put in the first place when receiving HTTP request. Http server listeners is behind EIO middlewares
 *
 *                          .---------------.   Yes
 *     a HTTP request ---\> |  check(req)?  | --------\>  `handleRequest(req)` (passed into Engine.IO middlewares)
 *                          |               | --------\>  HttpServer.listeners
 *                          .---------------.    No
 *
 * And the Engine.IO handshake behaviour is inside `handleRequest`
 * Web PubSub handshake handler is inside its express middleware.
 *
 * TODO: implment BaseServer rather than extends Server
 **/
export class WebPubSubEioServer extends engine.Server {
  public webPubSubOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions;
  public webPubSubConnectionManager: WebPubSubConnectionManager;
  private _setuped: Promise<void>;

  constructor(options: engine.ServerOptions, webPubSubOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions) {
    debug(`constructor, options: ${JSON.stringify(options)}, webPubSubOptions: ${JSON.stringify(webPubSubOptions)}`);
    super(options);
    this.webPubSubOptions = webPubSubOptions;
    this.webPubSubConnectionManager = new WebPubSubConnectionManager(this, webPubSubOptions);

    // Using tunnel
    if (this.webPubSubConnectionManager.service instanceof InprocessServerProxy) {
      debug("constructor, use InprocessServerProxy");
      const tunnel: InprocessServerProxy = this.webPubSubConnectionManager.service;
      tunnel.use(this.webPubSubConnectionManager.getEventHandlerExpressMiddleware());
      this._setuped = tunnel.runAsync();
      /**
       * After closing the EIO server, internal tunnel should be closed as well.
       * Force override `cleanup`, which is executed when closing EIO server.
       * In native implementation, it close internal WebSocket server, this is not needed when using Azure Web PubSub.
       */
      this["cleanup"] = async () => {
        // TODO: Find the optimal time to close the tunnel
        debug("cleanup, stop internal tunnel");
        await this.webPubSubConnectionManager.close();
        tunnel.stop();
      };
    } else {
      debug("constructor, use RestApiServiceCaller");
      const webPubSubEioMiddleware = this.webPubSubConnectionManager.getEventHandlerEioMiddleware();
      this.use(webPubSubEioMiddleware);
    }
    debug(`constructor, finish`);
  }

  public async setup(): Promise<void> {
    if (this.webPubSubConnectionManager.service instanceof InprocessServerProxy) {
      await this._setuped;
    }
  }

  protected override createTransport(transportName: string, req: unknown): engine.Transport {
    debug(`create transport, transportName=${transportName}, force redirect to ${WebPubSubTransport.name}`);
    return new WebPubSubTransport(req);
  }

  /**
   *
   * @param _req - handshake request
   * @returns socket id for EIO connection built from handshake request `req`
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public override generateId = (_req: unknown): string | undefined => this.webPubSubConnectionManager.getNextSid();

  /**
   *
   * @param _transport - transport name
   * @returns a list of available transports for upgrade given a certain Transport `transport`
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public override upgrades = (_transport: string): Array<string> => [];

  public async onConnect(connectionId: string, connectReq: unknown, context: ClientConnectionContext): Promise<void> {
    await this.handshake(WEBPUBSUB_TRANSPORT_NAME, connectReq, (errorCode: number, errorContext: unknown) => {
      const message =
        errorContext && errorContext["message"] ? errorContext["message"] : EIO_CONNECTION_ERROR[errorCode];
      context.onRefuseEioConnection(message);
    });

    context.transport = this.clients[connectionId].transport;
  }

  public async onUserEvent(connectionId: string, content: unknown): Promise<void> {
    const client = this.clients[connectionId];
    const packets = await client.transport.parser.decodePayload(content);

    for (const packet of packets) {
      client.onPacket(packet);
    }
  }

  public async onDisconnected(connectionId: string): Promise<void> {
    this.clients[connectionId].transport.onClose();
  }
}
