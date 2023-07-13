import { createServer, Server as HttpServer } from "http";
import expect from "expect.js";
import { Server, createClient, eioHandshake, eioPoll, eioPush, getPort, success } from "./support/util";

const serverPort = Number(process.env.SocketIoPort);

describe("close", () => {
  it("should be able to close sio sending a srv", (done) => {
    const httpServer = createServer().listen(serverPort);
    const io = new Server(httpServer);
    const port = getPort(io);
    const net = require("net");
    const server = net.createServer();

    const clientSocket = createClient(io, "/", { reconnection: false });

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

  it("should be able to close sio sending a srv", (done) => {
    const io = new Server(serverPort);
    const port = getPort(io);
    const net = require("net");
    const server = net.createServer();
    const clientSocket = createClient(io, "/", { transports: ["websocket"], reconnection: false });
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
      const io = new Server(httpServer);

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

    it("should close the connection when receiving an EVENT packet while not connected", async () => {
      const httpServer = createServer();
      const io = new Server(httpServer);

      httpServer.listen(serverPort);

      const sid = await eioHandshake();
      // send an EVENT packet
      await eioPush(sid, '42["some event"]');
      // session is cleanly closed, we receive a close packet
      const body = await eioPoll(sid);
      expect(body).to.be("6\u001e1");

      io.close();
    });

    it("should close the connection when receiving an invalid packet", async () => {
      const httpServer = createServer();
      const io = new Server(httpServer);

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
