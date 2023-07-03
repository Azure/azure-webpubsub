// Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/namespace.ts

import type { SocketId } from "socket.io-adapter";
import { Namespace, Socket } from "socket.io";
import expect from "expect.js";
import { Server } from "./support/util";
import { success, createClient, successFn, shutdown } from "./support/util";

const serverPort = Number(process.env.SocketIoPort);

describe("namespaces", () => {
  it("should be accessible through .sockets", () => {
    const io = new Server(serverPort);
    expect(io.sockets).to.be.a(Namespace);
    shutdown(io);
  });

  it("should be aliased", () => {
    const io = new Server(serverPort);
    expect(io.use).to.be.a("function");
    expect(io.to).to.be.a("function");
    expect(io["in"]).to.be.a("function");
    expect(io.emit).to.be.a("function");
    expect(io.send).to.be.a("function");
    expect(io.write).to.be.a("function");
    expect(io.allSockets).to.be.a("function");
    expect(io.compress).to.be.a("function");
    shutdown(io);
  });

  it("should return an immutable broadcast operator", () => {
    const io = new Server(serverPort);
    const operator = io.local.to(["room1", "room2"]).except("room3");
    operator.compress(true).emit("hello");
    operator.volatile.emit("hello");
    operator.to("room4").emit("hello");
    operator.except("room5").emit("hello");
    io.to("room6").emit("hello");
    // @ts-ignore
    expect(operator.rooms).to.contain("room1", "room2");
    // @ts-ignore
    expect(operator.exceptRooms).to.contain("room3");
    // @ts-ignore
    expect(operator.flags).to.eql({ local: true });
    shutdown(io);
  });

  it("should automatically connect", (done) => {
    const io = new Server(serverPort);
    const socket = createClient(io);
    socket.on("connect", successFn(done, io, socket));
  });

  it("should fire a `connection` event", (done) => {
    const io = new Server(serverPort);
    const clientSocket = createClient(io);

    io.on("connection", (socket) => {
      expect(socket).to.be.a(Socket);
      success(done, io, clientSocket);
    });
  });

  it("should fire a `connect` event", (done) => {
    const io = new Server(serverPort);
    const clientSocket = createClient(io);

    io.on("connect", (socket) => {
      expect(socket).to.be.a(Socket);
      success(done, io, clientSocket);
    });
  });

  it("should work with many sockets", (done) => {
    const io = new Server(serverPort);
    io.of("/chat");
    io.of("/news");
    const chat = createClient(io, "/chat");
    const news = createClient(io, "/news");

    let total = 2;
    chat.on("connect", () => {
      --total || success(done, io, chat, news);
    });
    news.on("connect", () => {
      --total || success(done, io, chat, news);
    });
  });

  it('should be able to equivalently start with "" or "/" on server', (done) => {
    const io = new Server(serverPort);
    const c1 = createClient(io, "/");
    const c2 = createClient(io, "/abc");

    let total = 2;
    io.of("").on("connection", () => {
      --total || success(done, io, c1, c2);
    });
    io.of("abc").on("connection", () => {
      --total || success(done, io, c1, c2);
    });
  });

  it('should be equivalent for "" and "/" on client', (done) => {
    const io = new Server(serverPort);
    const c1 = createClient(io, "");

    io.of("/").on("connection", successFn(done, io, c1));
  });

  it("should work with `of` and many sockets", (done) => {
    const io = new Server(serverPort);
    const chat = createClient(io, "/chat");
    const news = createClient(io, "/news");

    let total = 2;
    io.of("/news").on("connection", (socket) => {
      expect(socket).to.be.a(Socket);
      --total || success(done, io, chat, news);
    });
    io.of("/news").on("connection", (socket) => {
      expect(socket).to.be.a(Socket);
      --total || success(done, io, chat, news);
    });
  });

  it("should work with `of` second param", (done) => {
    const io = new Server(serverPort);
    const chat = createClient(io, "/chat");
    const news = createClient(io, "/news");

    let total = 2;
    io.of("/news", (socket) => {
      expect(socket).to.be.a(Socket);
      --total || success(done, io, chat, news);
    });
    io.of("/news", (socket) => {
      expect(socket).to.be.a(Socket);
      --total || success(done, io, chat, news);
    });
  });

  it("should not reuse same-namespace connections", (done) => {
    const io = new Server(serverPort);
    const clientSocket1 = createClient(io);
    const clientSocket2 = createClient(io);

    let connections = 0;
    io.on("connection", () => {
      connections++;
      if (connections === 2) {
        success(done, io, clientSocket1, clientSocket2);
      }
    });
  });

  // Skip: All tests which contains unsupported feature `BroadcastOperator.allSockets()`
  // Skip: All tests realted to `volatile`

  it("should throw on reserved event", () => {
    const io = new Server(serverPort);

    expect(() => io.emit("connect")).to.throwException(/"connect" is a reserved event name/);
    shutdown(io);
  });

  it("should exclude a specific socket when emitting", (done) => {
    const io = new Server(serverPort);

    const socket1 = createClient(io, "/");
    const socket2 = createClient(io, "/");

    socket2.on("a", () => {
      expect(true).to.equal(false); //"should not happen"
    });
    socket1.on("a", successFn(done, io, socket1, socket2));

    socket2.on("connect", () => {
      io.except(socket2.id).emit("a");
    });
  });

  it("should exclude a specific socket when emitting (in a namespace)", (done) => {
    const io = new Server(serverPort);

    const nsp = io.of("/nsp");

    const socket1 = createClient(io, "/nsp");
    const socket2 = createClient(io, "/nsp");

    socket2.on("a", () => {
      expect(true).to.equal(false); //"should not happen"
    });
    socket1.on("a", successFn(done, io, socket1, socket2));

    socket2.on("connect", () => {
      nsp.except(socket2.id).emit("a");
    });
  });

  it("should exclude a specific room when emitting", (done) => {
    const io = new Server(serverPort);

    const nsp = io.of("/nsp");

    const socket1 = createClient(io, "/nsp");
    const socket2 = createClient(io, "/nsp");

    socket1.on("a", successFn(done, io, socket1, socket2));
    socket2.on("a", () => {
      expect(true).to.equal(false); //"should not happen"
    });

    nsp.on("connection", (socket) => {
      socket.on("broadcast", () => {
        socket.join("room1");
        nsp.except("room1").emit("a");
      });
    });

    socket2.emit("broadcast");
  });

  it("should emit an 'new_namespace' event", () => {
    const io = new Server(serverPort);

    io.on("new_namespace", (namespace) => {
      expect(namespace.name).to.eql("/nsp");
    });

    io.of("/nsp");

    shutdown(io);
  });

  it("should not clean up a non-dynamic namespace", (done) => {
    const io = new Server(serverPort, { cleanupEmptyChildNamespaces: true });
    const c1 = createClient(io, "/chat");

    c1.on("connect", () => {
      c1.disconnect();

      // Give it some time to disconnect the client
      setTimeout(() => {
        expect(io._nsps.has("/chat")).to.be(true);
        expect(io._nsps.get("/chat")!.sockets.size).to.be(0);
        success(done, io);
      }, 100);
    });

    io.of("/chat");
  });

});
