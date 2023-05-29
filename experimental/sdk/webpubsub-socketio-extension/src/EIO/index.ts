import { WebPubSubExtensionOptions } from "../common/utils";
import * as engine from "engine.io";

/**
 * In the design of Engine.IO package, the EIO server has its own middlewares rather than sharing with http server.
 * And EIO middlewares is put in the first place when receiving HTTP request. Http server listeners is behind EIO middlewares
 *
 *                         .---------------.   Yes
 *     a HTTP request ---> |  check(req)?  | -------->  `handleRequest(req)` (passed into Engine.IO middlewares)
 *                         |               | -------->  HttpServer.listeners
 *                         .---------------.    No
 *
 * And the Engine.IO handshake behaviour is inside `handleRequest`
 * Web PubSub handshake handler is inside its express middleware.
 *
 * TODO: implment BaseServer rather than extends Server
 **/
export class WebPubSubEioServer extends engine.Server {
  constructor(
    options: engine.ServerOptions,
    webPubSubOptions: WebPubSubExtensionOptions
  ) {
    super();
  }
}
