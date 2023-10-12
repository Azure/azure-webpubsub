// Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/namespace.ts

import { Namespace, Socket } from "socket.io";
import { Server, success, createClient, successFn, spinCheck, getServer } from "./support/util";
import { debugModule } from "../../src/common/utils";

const expect = require("expect.js");
const debug = debugModule("wps-sio-ext:ut:namespace");

describe("namespaces", () => {
  it("should be accessible through .sockets", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      expect(io.sockets).to.be.a(Namespace);
      success(done, io);
    });
  });

  it("should be aliased", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      expect(io.use).to.be.a("function");
      expect(io.to).to.be.a("function");
      expect(io["in"]).to.be.a("function");
      expect(io.emit).to.be.a("function");
      expect(io.send).to.be.a("function");
      expect(io.write).to.be.a("function");
      expect(io.allSockets).to.be.a("function");
      expect(io.compress).to.be.a("function");
      success(done, io);
    });
  });

  it("should return an immutable broadcast operator", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
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
      success(done, io);
    });
  });

  it("should automatically connect", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();
      socket.on("connect", () => {
        successFn(done, io, socket)();
      });
    });
  });

  it("should fire a `connection` event", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const clientSocket = createClient();

      io.on("connection", (socket) => {
        expect(socket).to.be.a(Socket);
        success(done, io, clientSocket);
      });
    });
  });

  it("should fire a `connect` event", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const clientSocket = createClient();

      io.on("connect", (socket) => {
        expect(socket).to.be.a(Socket);
        success(done, io, clientSocket);
      });
    });
  });

  it("should work with many sockets", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      io.of("/chat");
      io.of("/news");
      const chat = createClient("/chat");
      const news = createClient("/news");

      let total = 2;
      chat.on("connect", () => {
        --total || success(done, io, chat, news);
      });
      news.on("connect", () => {
        --total || success(done, io, chat, news);
      });
    });
  });

  it('should be able to equivalently start with "" or "/" on server', (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const c1 = createClient("/");
      const c2 = createClient("/abc");

      let total = 2;
      io.of("").on("connection", () => {
        --total || success(done, io, c1, c2);
      });
      io.of("abc").on("connection", () => {
        --total || success(done, io, c1, c2);
      });
    });
  });

  it('should be equivalent for "" and "/" on client', (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const c1 = createClient("");

      io.of("/").on("connection", successFn(done, io, c1));
    });
  });

  it("should work with `of` and many sockets", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const chat = createClient("/chat");
      const news = createClient("/news");

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
  });

  it("should work with `of` second param", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const chat = createClient("/chat");
      const news = createClient("/news");

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
  });

  // Note: This test is modified. A `setTimeout` is added to mitigate intermittent failures caused by socket.io-client cache.
  it("should disconnect upon transport disconnection", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      setTimeout(() => {
        const chat = createClient("/chat-sdutd");
        const news = createClient("/news-sdutd");

        let total = 2;
        let totald = 2;
        let chatClientSocket;
        io.of("/news-sdutd", (socket) => {
          debug(`news client eio id = ${socket.conn["id"]}`);
          socket.on("disconnect", (reason) => {
            --totald || success(done, io, chat, news);
          });
          --total || close();
        });
        io.of("/chat-sdutd", (socket) => {
          debug(`chat client eio id = ${socket.conn["id"]}`);
          chatClientSocket = socket;
          socket.on("disconnect", (reason) => {
            --totald || success(done, io, chat, news);
          });
          --total || close();
        });
        function close() {
          chatClientSocket.disconnect(true);
        }
      }, 1000);
    });
  });

  /**
   * Note: This test is modified in its `close` method.
   * 1. See "Modification 1" and "Modification 3" in index.ts
   * 2. Use `setTimeout(() => { s.disconnect(); }, 1000);` instead of `process.nextTick(() => s.disconnect());`
   *    For it takes longer for `s.join(room)` to take effect.
   */
  it("should fire a `disconnecting` event just before leaving all rooms", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", async (s) => {
        await s.join("a");
        setTimeout(() => {
          s.disconnect();
        }, 1000);

        let total = 2;
        s.on("disconnecting", async (reason) => {
          const check1 = () => {
            expect(s.rooms).to.contain(s.id);
            expect(s.rooms).to.contain("a");
          };
          await spinCheck(check1);

          total--;
        });

        s.on("disconnect", async (reason) => {
          const check2 = () => {
            expect(total).to.equal(1);
            expect(s.rooms.size).to.eql(0);
          };

          await spinCheck(check2);
          --total || success(done, io, socket);
        });
      });
    });
  });

  it("should return error connecting to non-existent namespace", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const client = createClient("/doesnotexist");

      client.on("connect_error", (err) => {
        expect(err.message).to.be("Invalid namespace");
        success(done, io);
      });
    });
  });

  it("should not reuse same-namespace connections", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const clientSocket1 = createClient();
      const clientSocket2 = createClient();

      let connections = 0;
      io.on("connection", () => {
        connections++;
        if (connections === 2) {
          success(done, io, clientSocket1, clientSocket2);
        }
      });
    });
  });

  // Skip: All tests which contains unsupported feature `BroadcastOperator.allSockets()`
  // Skip: All tests realted to `volatile`

  it("should throw on reserved event", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      expect(() => io.emit("connect")).to.throwException(/"connect" is a reserved event name/);
      success(done, io);
    });
  });

  it("should close a client without namespace", (done) => {
    const ioPromise = getServer(0, { connectTimeout: 10 });

    ioPromise.then((io) => {
      const socket = createClient("/scawn");

      // @ts-ignore
      socket.io.engine.write = () => {}; // prevent the client from sending a CONNECT packet

      socket.on("disconnect", successFn(done, io, socket));
    });
  });

  it("should exclude a specific socket when emitting", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket1 = createClient("/");
      const socket2 = createClient("/");

      socket2.on("a", () => {
        expect(true).to.equal(false); //"should not happen"
      });
      socket1.on("a", successFn(done, io, socket1, socket2));

      socket2.on("connect", async () => {
        await spinCheck(() => {
          expect(socket1.connected).to.eql(true);
        });
        io.except(socket2.id).emit("a");
      });
    });
  });

  // Note: This test is modified. See "Modification 3" in index.ts
  it("should exclude a specific socket when emitting (in a namespace)", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const nsp = io.of("/nsp");

      const socket1 = createClient("/nsp");
      const socket2 = createClient("/nsp");

      socket2.on("a", () => {
        expect(true).to.equal(false); //"should not happen"
      });
      socket1.on("a", successFn(done, io, socket1, socket2));

      socket2.on("connect", async () => {
        // ensure `socket1` is connected before broadcasting
        await spinCheck(() => {
          expect(socket1.connected).to.equal(true);
        });
        nsp.except(socket2.id).emit("a");
      });
    });
  });

  // Note: This test is modified. See "Modification 1" and "Modification 2" in index.ts
  it("should exclude a specific room when emitting", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then(async (io) => {
      const nsp = io.of("/nsp-seasrwe");

      const socket1 = createClient("/nsp-seasrwe");
      const socket2 = createClient("/nsp-seasrwe");

      socket1.on("a", successFn(done, io, socket1, socket2));
      socket2.on("a", () => {
        expect(true).to.equal(false); //"should not happen"
      });

      nsp.on("connection", (socket) => {
        socket.on("broadcast", async () => {
          await socket.join("room1");
          expect(socket.rooms).to.contain("room1");
          nsp.except("room1").emit("a");
        });
      });
      await spinCheck(() => {
        expect(socket1.connected && socket2.connected).to.eql(true);
      });
      socket2.emit("broadcast");
    });
  });

  it("should emit an 'new_namespace' event", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      io.on("new_namespace", (namespace) => {
        expect(namespace.name).to.eql("/nsp");
        success(done, io);
      });

      io.of("/nsp");
    });
  });

  it("should not clean up a non-dynamic namespace", (done) => {
    const ioPromise = getServer(0, { cleanupEmptyChildNamespaces: true });
    ioPromise.then((io) => {
      const c1 = createClient("/chat");

      c1.on("connect", () => {
        c1.disconnect();

        // Give it some time to disconnect the client
        setTimeout(() => {
          expect(io._nsps.has("/chat")).to.be(true);
          expect(io._nsps.get("/chat")!.sockets.size).to.be(0);
          success(done, io);
        }, 1000);
      });

      io.of("/chat");
    });
  });
});
