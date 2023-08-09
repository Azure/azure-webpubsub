import { createServer, Server as HttpServer } from "http";
import expect from "expect.js";
import {
  Server,
  createClient,
  eioHandshake,
  eioPoll,
  eioPush,
  getPort,
  getServer,
  success,
  baseServerPort,
} from "./support/util";
const net = require("net");

const serverPort = baseServerPort;

describe("close", () => {
  it("should be able to close sio sending a srv (1)", (done) => {
    const httpServer = createServer().listen(serverPort);
    const ioPromise = getServer(httpServer);
    ioPromise.then((io) => {
      const port = getPort(io);
      expect(port).to.equal(serverPort);

      const server = net.createServer();

      const clientSocket = createClient("/", { reconnection: false });

      clientSocket.on("disconnect", () => {
        expect(io.sockets.sockets.size).to.equal(0);
        server.listen(port);
      });

      clientSocket.on("connect", () => {
        expect(io.sockets.sockets.size).to.equal(1);
        io.close();
      });

      server.once("listening", () => {
        // PORT should be free
        server.close((error) => {
          expect(error).to.be(undefined);
          success(done, io, clientSocket);
        });
      });
    });
  });

  it("should be able to close sio sending a srv (2)", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const port = getPort(io);
      const server = net.createServer();

      const clientSocket = createClient("/", { transports: ["websocket"], reconnection: false });
      clientSocket.on("disconnect", () => {
        expect(io.sockets.sockets.size).to.equal(0);
        server.listen(port);
      });

      clientSocket.on("connect", () => {
        expect(io.sockets.sockets.size).to.equal(1);
        io.close();
      });

      server.once("listening", () => {
        // PORT should be free
        server.close((error) => {
          expect(error).to.be(undefined);
          success(done, io, clientSocket);
        });
      });
    });
  });

  /* TODO: fix this. This test cannot be run due to compliation issue.
  describe("graceful close", () => {
    function fixture(filename) {
      return '"' + process.execPath + '" "' + join(__dirname, "fixtures", filename) + '"';
    }

    it("should stop socket and timers", (done) => {
      exec(fixture("server-close.ts"), done);
    });
  });
  */

  describe("protocol violations", () => {
    it("should close the connection when receiving several CONNECT packets", async () => {
      const httpServer = createServer();
      const ioPromise = getServer(httpServer);
      ioPromise.then(async (io) => {
        httpServer.listen(serverPort);

        const sid = await eioHandshake();

        // send a first CONNECT packet
        await eioPush(sid, "40");

        // send another CONNECT packet
        await eioPush(sid, "40");

        // session is cleanly closed (not discarded, see 'client.close()')
        // first, we receive the Socket.IO handshake response
        await eioPoll(sid);

        // then a close packet
        const body = await eioPoll(sid);
        expect(body).to.be("6\u001e1");
        io.close();
      });
    });

    it("should close the connection when receiving an EVENT packet while not connected", async () => {
      const httpServer = createServer();
      const ioPromise = getServer(httpServer);
      ioPromise.then(async (io) => {
        httpServer.listen(serverPort);

        const sid = await eioHandshake();
        // send an EVENT packet
        await eioPush(sid, '42["some event"]');
        // session is cleanly closed, we receive a close packet
        const body = await eioPoll(sid);
        expect(body).to.be("6\u001e1");

        io.close();
      });
    });

    it("should close the connection when receiving an invalid packet", async () => {
      const httpServer = createServer();
      const ioPromise = getServer(httpServer);

      ioPromise.then(async (io) => {
        httpServer.listen(serverPort);

        const sid = await eioHandshake();
        // send a CONNECT packet
        await eioPush(sid, "40");
        // send an invalid packet
        await eioPush(sid, "4abc");
        // session is cleanly closed (not discarded, see 'client.close()')
        // first, we receive the Socket.IO handshake response
        await eioPoll(sid);
        // then a close packet
        const body = await eioPoll(sid);
        expect(body).to.be("6\u001e1");

        io.close();
      });
    });
  });
});
