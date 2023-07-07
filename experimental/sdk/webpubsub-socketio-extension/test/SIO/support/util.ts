// Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/support/util.ts

import { Server as _Server, ServerOptions } from "socket.io";
import { io as ioc, ManagerOptions, Socket as ClientSocket, SocketOptions } from "socket.io-client";
import { debugModule } from "../../../src/common/utils";
import { init, WebPubSubExtensionOptions } from "../../../src";

const debug = debugModule("wps-sio-ext:ut:sio:util");
const expect = require("expect.js");
const i = expect.stringify;

init();

const wpsOptions = {
  hub: process.env.WebPubSubHub,
  path: process.env.WebPubSubPath,
  connectionString: process.env.WebPubSubConnectionString,
  webPubSubServiceClientOptions: { allowInsecureConnection: true },
} as WebPubSubExtensionOptions;

const serverPort = Number(process.env.SocketIoPort);
debug(`SocketIO Server Port = ${serverPort}`);

export class Server extends _Server {
  constructor(port: number = serverPort, extraOpts: Partial<ServerOptions> = {}) {
    const opts = extraOpts ? { ...extraOpts, path: wpsOptions.path } : { path: wpsOptions.path };
    debug(`Server, port = ${port}, opts = ${JSON.stringify(opts)}`);
    super(port, opts);
    this.useAzureWebPubSub(wpsOptions);
    // `Server.close()` will trigger `HttpServer.close()`, which costs a lot of time
    // This is a trick to shutdown http server in a short time
    this["httpServer"] = require("http-shutdown")(this["httpServer"]);
  }
}

// add support for Set/Map
const contain = expect.Assertion.prototype.contain;
expect.Assertion.prototype.contain = function (...args) {
  if (this.obj instanceof Set || this.obj instanceof Map) {
    args.forEach((obj) => {
      this.assert(
        this.obj.has(obj),
        function () {
          return "expected " + i(this.obj) + " to contain " + i(obj);
        },
        function () {
          return "expected " + i(this.obj) + " to not contain " + i(obj);
        }
      );
    });
    return this;
  }
  return contain.apply(this, args);
};

export function getEndpointFullPath(connectionString: string): string {
  const keyValuePairs = connectionString.split(";");
  var endpoint = "",
    port = -1;
  for (const pair of keyValuePairs) {
    const [key, value] = pair.split("=");
    if (key.trim().toLowerCase() === "port") {
      port = Number(value.trim());
    }
    if (key.trim().toLowerCase() === "endpoint") {
      endpoint = value.trim();
    }
  }
  if (port === -1) {
    port = endpoint.indexOf("https://") === 0 || endpoint.indexOf("wss://") === 0 ? 443 : 80;
  }
  return `${endpoint}:${port}`;
}

export function createClient(
  io: Server,
  nsp: string = "/",
  opts?: Partial<ManagerOptions & SocketOptions>
): ClientSocket {
  const endpointFullPath = getEndpointFullPath(process.env.WebPubSubConnectionString ?? "");
  opts = { path: `/clients/socketio/hubs/${process.env.WebPubSubHub}`, ...opts };
  let uri = `${endpointFullPath}${nsp}`;
  debug(`createClient, opts = ${JSON.stringify(opts)}, endpointFullPath = ${endpointFullPath}, uri = ${uri}`);

  return ioc(uri, opts);
}

export function shutdown(io: Server, cb?: (err?: Error) => void) {
  io["httpServer"].shutdown((err) => {
    if (err) {
      console.log(`Http Server shutdown failed: ${err.message}`);
    }
    debug("httpServer closed");
    io.close(() => {
      io.removeAllListeners();
      debug("SIO Server closed");
      cb && cb();
    });
  });
}

export async function success(done: Function, io: Server, ...clients: ClientSocket[]) {
  clients.forEach((client) => client.disconnect());
  debug("start cleanup for success");
  shutdown(io, () => {
    done();
  });
}

export function successFn(done: Function, sio: Server, ...clientSockets: ClientSocket[]) {
  return () => success(done, sio, ...clientSockets);
}

export function getPort(io: Server): number {
  // @ts-ignore
  return io.httpServer.address().port;
}

export function createPartialDone(count: number, done: (err?: Error) => void) {
  let i = 0;
  return () => {
    debug(`createPartialDone, i = ${i}`);
    if (++i === count) {
      done();
    } else if (i > count) {
      done(new Error(`partialDone() called too many times: ${i} > ${count}`));
    }
  };
}
