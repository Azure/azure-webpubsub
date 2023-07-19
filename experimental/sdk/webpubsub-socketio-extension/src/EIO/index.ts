// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubExtensionOptions, WebPubSubExtensionCredentialOptions, debugModule } from "../common/utils";
import { WebPubSubTransport } from "./components/web-pubsub-transport";
import { WebPubSubConnectionManager } from "./components/web-pubsub-connection-manager";
import * as engine from "engine.io";
import { InprocessServerProxy } from "awps-tunnel-proxies";
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
  public webPubSubOptions: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions;
  public webPubSubConnectionManager: WebPubSubConnectionManager;
  private _tunnel: InprocessServerProxy;
  private _setuped: Promise<void>;

  constructor(
    options: engine.ServerOptions,
    webPubSubOptions: WebPubSubExtensionOptions | WebPubSubExtensionCredentialOptions,
    tunnel? : InprocessServerProxy
  ) {
    super(options);
    debug("create Engine.IO Server with AWPS");
    this.webPubSubOptions = webPubSubOptions;
    this.webPubSubConnectionManager = new WebPubSubConnectionManager(this, webPubSubOptions);

    if (tunnel) {
      this._tunnel = tunnel;
      this._tunnel.use(this.webPubSubConnectionManager.getEventHandlerExpressMiddleware());
      this._setuped = this._tunnel.runAsync();
      /**
       * After close EIO server, internal tunnel should be closed as well.
       * Force override `cleanup`, which is executed when closing EIO server.
       * In native implementation, it close internal WebSocket server, which makes nno sense in AWPS.
       */
      this["cleanup"] = () => {
        this._tunnel.stop();
      };
    } else {
      const webPubSubEioMiddleware = this.webPubSubConnectionManager.getEventHandlerEioMiddleware();
      this.use(webPubSubEioMiddleware);
    }
  }

  public async setup(): Promise<void> {
    await this._setuped;
  }

  protected override createTransport(transportName: string, req: unknown): engine.Transport {
    debug(`create transport, transportName=${transportName}, force redirect to ${WebPubSubTransport.name}`);
    return new WebPubSubTransport(req);
  }

  /**
   *
   * @param req - handshake request
   * @returns socket id for EIO connection built from handshake request `req`
   */
  public override generateId = (req: unknown): string | undefined => this.webPubSubConnectionManager.getNextSid();

  /**
   *
   * @param transport - transport name
   * @returns a list of available transports for upgrade given a certain Transport `transport`
   */
  public override upgrades = (transport: string): Array<string> => [];
}
