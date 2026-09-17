import { once } from "events";
import { createServer, Server as HttpServer } from "http";
import { connect, Server as NetServer } from "net";
import { Server as NativeServer } from "socket.io";
import expect from "expect.js";
import { Server, enableFastClose, getPort, getServer, shutdown, success } from "./SIO/support/util";

function close(io: NativeServer): Promise<void> {
  return new Promise((resolve, reject) => shutdown(io, (err) => (err ? reject(err) : resolve())));
}

async function listen(server: NetServer): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener.");
  return address.port;
}

describe("Socket.IO HTTP shutdown helpers (local)", () => {
  it("accepts a supplied HTTP server before it starts listening", async () => {
    const httpServer = createServer();
    const setup = jest
      .spyOn(NativeServer.prototype, "useAzureSocketIO")
      .mockImplementation(async function (this: NativeServer) {
        return this;
      });
    let io: Server | undefined;
    try {
      io = await getServer(httpServer);
      expect(io.httpServer).to.be(httpServer);
      expect(httpServer.listening).to.be(false);
      expect(setup.mock.calls).to.have.length(1);
      expect(() => getPort(httpServer)).to.throwException(/not listening/);
      const port = await listen(httpServer);
      expect(getPort(io)).to.be(port);
    } finally {
      setup.mockRestore();
      if (io) await close(io);
    }
  });

  it("retains the wrapper and tracks idle connections across repeated enablement", async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    const port = await listen(httpServer);
    const first = enableFastClose(io);
    const connectionListeners = httpServer.listenerCount("connection");
    const accepted = once(httpServer, "connection");
    const client = connect(port, "127.0.0.1");
    try {
      const [serverSocket] = await accepted;
      expect(enableFastClose(io)).to.be(first);
      expect(io.httpServer).to.be(httpServer);
      expect(httpServer.listenerCount("connection")).to.be(connectionListeners);
      const closed = once(client, "close");
      await close(io);
      await closed;
      expect(serverSocket.destroyed).to.be(true);
      expect(httpServer.listening).to.be(false);
      expect(io.eventNames()).to.have.length(0);
    } finally {
      client.destroy();
      if (httpServer.listening) await close(io);
    }
  });

  it("supports enabling before a native server is attached", async () => {
    const io = new NativeServer();
    expect(enableFastClose(io)).to.be(undefined);
    const httpServer = createServer();
    io.attach(httpServer);
    await listen(httpServer);
    await close(io);
    expect(httpServer.listening).to.be(false);
  });

  it("allows cleanup after the server was already closed", async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    await listen(httpServer);
    await io.close();
    await close(io);
    await close(io);
  });

  it("passes shutdown errors through the success cleanup callback", async () => {
    const failure = new Error("Failed to close the HTTP listener.");
    class FailingCloseServer extends HttpServer {
      close(callback?: (err?: Error) => void): this {
        process.nextTick(() => callback?.(failure));
        return this;
      }
    }
    const io = new Server(new FailingCloseServer());
    const outcome = await new Promise<Error | undefined>((resolve) => success(resolve, io));
    expect(outcome).to.be(failure);
  });
});
