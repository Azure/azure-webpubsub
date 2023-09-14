// Modified from // Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/socket.ts

import { createClient, createPartialDone, successFn, success, spinCheck, getServer } from "./support/util";
import * as fs from "fs";
import { join } from "path";
import { debugModule } from "../../src/common/utils";
import expect from "expect.js";

const debug = debugModule("wps-sio-ext:ut");

describe("socket", () => {
  it("should receive events", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("random", (a, b, c) => {
          expect(a).to.be(1);
          expect(b).to.be("2");
          expect(c).to.eql([3]);

          success(done, io, socket);
        });
        socket.emit("random", 1, "2", [3]);
      });
    });
  });

  it("should receive message events through `send`", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("message", (a) => {
          expect(a).to.be(1337);
          success(done, io, socket);
        });
        socket.send(1337);
      });
    });
  });

  it("should error with null messages", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("message", (a) => {
          expect(a).to.be(null);
          success(done, io, socket);
        });
        socket.send(null);
      });
    });
  });

  it("should handle transport null messages", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient("/", { reconnection: false });

      io.on("connection", (s) => {
        s.on("error", (err) => {
          expect(err).to.be.an(Error);
          s.on("disconnect", (reason) => {
            expect(reason).to.be("forced close");

            success(done, io, socket);
          });
        });
        (s as any).client.ondata(null);
      });
    });
  });

  it("should emit events", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      socket.on("woot", (a) => {
        expect(a).to.be("tobi");
        success(done, io, socket);
      });
      io.on("connection", (s) => {
        s.emit("woot", "tobi");
      });
    });
  });

  it("should emit events with utf8 multibyte character", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();
      let i = 0;

      socket.on("hoot", (a) => {
        expect(a).to.be("utf8 — string");
        i++;

        if (3 == i) {
          success(done, io, socket);
        }
      });
      io.on("connection", (s) => {
        s.emit("hoot", "utf8 — string");
        s.emit("hoot", "utf8 — string");
        s.emit("hoot", "utf8 — string");
      });
    });
  });

  it("should emit events with binary data", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      let imageData;
      socket.on("doge", (a) => {
        expect(Buffer.isBuffer(a)).to.be(true);
        expect(imageData.length).to.equal(a.length);
        expect(imageData[0]).to.equal(a[0]);
        expect(imageData[imageData.length - 1]).to.equal(a[a.length - 1]);

        success(done, io, socket);
      });
      io.on("connection", (s) => {
        fs.readFile(join(__dirname, "support", "doge.jpg"), (err, data) => {
          if (err) {
            console.log(err);
            done(new Error("should not happen"));
          }
          imageData = data;
          s.emit("doge", data);
        });
      });
    });
  });

  it("should emit events with several types of data (including binary)", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      socket.on("multiple", (a, b, c, d, e, f) => {
        expect(a).to.be(1);
        expect(Buffer.isBuffer(b)).to.be(true);
        expect(c).to.be("3");
        expect(d).to.eql([4]);
        expect(Buffer.isBuffer(e)).to.be(true);
        expect(Buffer.isBuffer(f[0])).to.be(true);
        expect(f[1]).to.be("swag");
        expect(Buffer.isBuffer(f[2])).to.be(true);

        success(done, io, socket);
      });
      io.on("connection", (s) => {
        fs.readFile(join(__dirname, "support", "doge.jpg"), (err, data) => {
          if (err) {
            console.log(err);
            done(new Error("should not happen"));
          }
          const buf = Buffer.from("asdfasdf", "utf8");
          s.emit("multiple", 1, data, "3", [4], buf, [data, "swag", buf]);
        });
      });
    });
  });

  it("should receive events with binary data", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("buff", (a) => {
          expect(Buffer.isBuffer(a)).to.be(true);

          success(done, io, socket);
        });
        const buf = Buffer.from("abcdefg", "utf8");
        socket.emit("buff", buf);
      });
    });
  });

  it("should receive events with several types of data (including binary)", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("multiple", (a, b, c, d, e, f) => {
          expect(a).to.be(1);
          expect(Buffer.isBuffer(b)).to.be(true);
          expect(c).to.be("3");
          expect(d).to.eql([4]);
          expect(Buffer.isBuffer(e)).to.be(true);
          expect(Buffer.isBuffer(f[0])).to.be(true);
          expect(f[1]).to.be("swag");
          expect(Buffer.isBuffer(f[2])).to.be(true);

          success(done, io, socket);
        });
        fs.readFile(join(__dirname, "support", "doge.jpg"), (err, data) => {
          if (err) {
            console.log(err);
            done(new Error("should not happen"));
          }
          const buf = Buffer.from("asdfasdf", "utf8");
          socket.emit("multiple", 1, data, "3", [4], buf, [data, "swag", buf]);
        });
      });
    });
  });

  // Skip: All tests related to `violate`

  it("should emit message events through `send`", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      socket.on("message", (a) => {
        expect(a).to.be("a");
        success(done, io, socket);
      });
      io.on("connection", (s) => {
        s.send("a");
      });
    });
  });

  it("should receive event with callbacks", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("woot", (fn) => {
          fn(1, 2);
        });
        socket.emit("woot", (a, b) => {
          expect(a).to.be(1);
          expect(b).to.be(2);
          success(done, io, socket);
        });
      });
    });
  });

  it("should receive all events emitted from namespaced client immediately and in order", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      let total = 0;

      io.of("/chat", (s) => {
        s.on("hi", (letter) => {
          total++;
          if (total == 2 && letter == "b") {
            success(done, io, chat);
          } else if (total == 1 && letter != "a") {
            throw new Error("events out of order");
          }
        });
      });

      const chat = createClient("/chat");
      chat.emit("hi", "a");
      setTimeout(() => {
        chat.emit("hi", "b");
      }, 50);
    });
  });

  it("should emit events with callbacks", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        socket.on("hi", (fn) => {
          fn();
        });
        s.emit("hi", () => {
          success(done, io, socket);
        });
      });
    });
  });

  it("should receive events with args and callback", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("woot", (a, b, fn) => {
          expect(a).to.be(1);
          expect(b).to.be(2);
          fn();
        });
        socket.emit("woot", 1, 2, () => {
          success(done, io, socket);
        });
      });
    });
  });

  it("should emit events with args and callback", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const clientSocket = createClient();

      io.on("connection", async (s) => {
        clientSocket.on("hi", (a, b, fn) => {
          expect(a).to.be(1);
          expect(b).to.be(2);
          fn();
        });
        await spinCheck(() => {
          expect(clientSocket.connected).to.eql(true);
        });
        s.emit("hi", 1, 2, () => {
          success(done, io, clientSocket);
        });
      });
    });
  });

  it("should receive events with binary args and callbacks", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("woot", (buf, fn) => {
          expect(Buffer.isBuffer(buf)).to.be(true);
          fn(1, 2);
        });
        socket.emit("woot", Buffer.alloc(3), (a, b) => {
          expect(a).to.be(1);
          expect(b).to.be(2);
          success(done, io, socket);
        });
      });
    });
  });

  it("should emit events with binary args and callback", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        socket.on("hi", (a, fn) => {
          expect(Buffer.isBuffer(a)).to.be(true);
          fn();
        });
        s.emit("hi", Buffer.alloc(4), () => {
          success(done, io, socket);
        });
      });
    });
  });

  it("should emit events and receive binary data in a callback", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        socket.on("hi", (fn) => {
          fn(Buffer.alloc(1));
        });
        s.emit("hi", (a) => {
          expect(Buffer.isBuffer(a)).to.be(true);
          success(done, io, socket);
        });
      });
    });
  });

  it("should receive events and pass binary data in a callback", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        s.on("woot", (fn) => {
          fn(Buffer.alloc(2));
        });
        socket.emit("woot", (a) => {
          expect(Buffer.isBuffer(a)).to.be(true);
          success(done, io, socket);
        });
      });
    });
  });

  it("should emit an event and wait for the acknowledgement", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", async (s) => {
        socket.on("hi", (a, b, fn) => {
          expect(a).to.be(1);
          expect(b).to.be(2);
          fn(3);
        });

        const val = await s.emitWithAck("hi", 1, 2);
        expect(val).to.be(3);

        success(done, io, socket);
      });
    });
  });

  it("should have access to the client", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        expect(s.client).to.be.an("object");
        success(done, io, socket);
      });
    });
  });

  it("should have access to the connection", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        expect(s.client.conn).to.be.an("object");
        expect(s.conn).to.be.an("object");
        success(done, io, socket);
      });
    });
  });

  it("should have access to the request", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", (s) => {
        expect(s.client.request.headers).to.be.an("object");
        expect(s.request.headers).to.be.an("object");
        success(done, io, socket);
      });
    });
  });

  // TODO: 2 tests for query parameters of client's connect request.
  // Skip: 2 tests for large payload
  // TODO: test "should be able to emit after server close and restart"
  // TODO: 2 tests for compression
  // Skip: 4 tests which use upgrade listener, which makes no sense for this package.

  it("should not crash when messing with Object prototype (and other globals)", (done) => {
    // @ts-ignore
    Object.prototype.foo = "bar";
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();

      io.on("connection", successFn(done, io, socket));
    });
  });

  it("should throw on reserved event", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket = createClient();
      io.on("connection", (s) => {
        expect(() => s.emit("connect_error")).to.throwException(/"connect_error" is a reserved event name/);
        socket.close();
        success(done, io, socket);
      });
    });
  });

  it("should ignore a packet received after disconnection", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const clientSocket = createClient();

      io.on("connection", (socket) => {
        socket.on("test", () => {
          done(new Error("should not happen"));
        });
        socket.on("disconnect", successFn(done, io, clientSocket));
      });

      clientSocket.on("connect", () => {
        clientSocket.disconnect();
        clientSocket.emit("test", Buffer.alloc(10));
      });
    });
  });

  it("should leave all rooms joined after a middleware failure", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const client = createClient("/");

      io.use(async (socket, next) => {
        await socket.join("room1");
        next(new Error("nope"));
      });

      client.on("connect_error", () => {
        expect(io.of("/").adapter.rooms.size).to.eql(0);

        io.close();
        success(done, io, client);
      });
    });
  });

  it("should not join rooms after disconnection", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const client = createClient("/");

      io.on("connection", (socket) => {
        socket.disconnect();
        socket.join("room1");
      });

      client.on("disconnect", () => {
        expect(io.of("/").adapter.rooms.size).to.eql(0);

        io.close();
        success(done, io, client);
      });
    });
  });

  describe("onAny", () => {
    it("should call listener", (done) => {
      const ioPromise = getServer(0);
      ioPromise.then(async (io) => {
        const clientSocket = createClient("/", { multiplex: false });

        io.on("connection", (socket) => {
          socket.onAny((event, arg1) => {
            expect(event).to.be("my-event");
            expect(arg1).to.be("123");
            success(done, io, clientSocket);
          });
        });

        await spinCheck(() => {
          expect(clientSocket.connected).to.eql(true);
        });
        clientSocket.emit("my-event", "123");
      });
    });

    it("should prepend listener", (done) => {
      const ioPromise = getServer(0);
      ioPromise.then(async (io) => {
        const clientSocket = createClient("/", { multiplex: false });

        io.on("connection", (socket) => {
          let count = 0;

          socket.onAny((event, arg1) => {
            expect(count).to.be(2);
            success(done, io, clientSocket);
          });

          socket.prependAny(() => {
            expect(count++).to.be(1);
          });

          socket.prependAny(() => {
            expect(count++).to.be(0);
          });
        });

        await spinCheck(() => {
          expect(clientSocket.connected).to.eql(true);
        });
        clientSocket.emit("my-event", "123");
      });
    });

    it("should remove listener", (done) => {
      const ioPromise = getServer(0);
      ioPromise.then(async (io) => {
        const clientSocket = createClient("/", { multiplex: false });

        io.on("connection", (socket) => {
          const fail = () => {
            done(new Error("should not happen"));
          };

          socket.onAny(fail);
          socket.offAny(fail);
          expect(socket.listenersAny.length).to.be(0);

          socket.onAny(() => {
            success(done, io, clientSocket);
          });
        });

        await spinCheck(() => {
          expect(clientSocket.connected).to.eql(true);
        });
        clientSocket.emit("my-event", "123");
      });
    });
  });

  describe("onAnyOutgoing", () => {
    it("should call listener", (done) => {
      const ioPromise = getServer(0);
      ioPromise.then((io) => {
        const clientSocket = createClient("/", { multiplex: false });

        io.on("connection", async (socket) => {
          socket.onAnyOutgoing((event, arg1) => {
            expect(event).to.be("my-event");
            expect(arg1).to.be("123");

            success(done, io, clientSocket);
          });

          await spinCheck(() => {
            expect(clientSocket.connected).to.eql(true);
          });
          socket.emit("my-event", "123");
        });
      });
    });

    // Skip: 2 tests based on default in-memory adapter
    // "should call listener when broadcasting" and "should call listener when broadcasting binary data"

    it("should prepend listener", (done) => {
      const ioPromise = getServer(0);
      ioPromise.then((io) => {
        const clientSocket = createClient("/", { multiplex: false });

        io.on("connection", (socket) => {
          let count = 0;

          socket.onAnyOutgoing((event, arg1) => {
            expect(count).to.be(2);
            success(done, io, clientSocket);
          });

          socket.prependAnyOutgoing(() => {
            expect(count++).to.be(1);
          });

          socket.prependAnyOutgoing(() => {
            expect(count++).to.be(0);
          });

          socket.emit("my-event", "123");
        });
      });
    });

    it("should remove listener", (done) => {
      const ioPromise = getServer(0);
      ioPromise.then((io) => {
        const clientSocket = createClient("/", { multiplex: false });

        io.on("connection", (socket) => {
          const fail = () => {
            done(new Error("should not happen"));
          };

          socket.onAnyOutgoing(fail);
          socket.offAnyOutgoing(fail);
          expect(socket.listenersAnyOutgoing.length).to.be(0);

          socket.onAnyOutgoing(() => {
            success(done, io, clientSocket);
          });

          socket.emit("my-event", "123");
        });
      });
    });

    // Note: This test is modified. See "Modification 2" in index.ts
    it("should disconnect all namespaces when calling disconnect(true)", (done) => {
      const ioPromise = getServer(0);
      ioPromise.then((io) => {
        io.of("/default");
        io.of("/foo");
        io.of("/bar");

        const clientSocket1 = createClient("/default", {
          transports: ["websocket"],
        });

        const clientSocket2 = createClient("/foo");
        const clientSocket3 = createClient("/bar");

        io.of("/bar").on("connection", async (socket) => {
          await spinCheck(() => {
            expect(clientSocket1.connected && clientSocket2.connected && clientSocket3.connected).to.eql(true);
          });
          socket.disconnect(true);
        });

        const partialDone = createPartialDone(3, successFn(done, io, clientSocket1, clientSocket2, clientSocket3));

        clientSocket1.on("disconnect", partialDone);
        clientSocket2.on("disconnect", partialDone);
        clientSocket3.on("disconnect", partialDone);
      });
    });
  });
});
