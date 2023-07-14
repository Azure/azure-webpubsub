import { Server, createClient, createPartialDone, spinCheck, success, successFn, waitFor } from "./support/util";
import { timeoutMap } from "./support/constants";
import { debugModule } from "../../src/common/utils";
const expect = require("expect.js");

const debug = debugModule("wps-sio-ext:ut");
const serverPort = Number(process.env.SocketIoPort);

describe("messaging many", () => {
  it("emits to a namespace", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/test");

    const partialDone = createPartialDone(2, successFn(done, io, socket1, socket2, socket3));

    socket1.on("a", (a) => {
      expect(a).to.be("b");
      partialDone();
    });
    socket2.on("a", (a) => {
      expect(a).to.be("b");
      partialDone();
    });
    socket3.on("a", () => {
      done(new Error("not"));
    });

    let sockets = 3;
    io.on("connection", () => {
      --sockets || emit();
    });
    io.of("/test", () => {
      --sockets || emit();
    });

    function emit() {
      io.emit("a", "b");
    }
  });

  // Note: This test is modified. See "Modification 2" in index.ts
  it("emits binary data to a namespace", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/ebdtan", { multiplex: false });
    const socket2 = createClient(io, "/ebdtan", { multiplex: false });
    const socket3 = createClient(io, "/test-ebdtan");

    const partialDone = createPartialDone(2, successFn(done, io, socket1, socket2, socket3));

    socket1.on("bin", (a) => {
      expect(Buffer.isBuffer(a)).to.be(true);
      partialDone();
    });
    socket2.on("bin", (a) => {
      expect(Buffer.isBuffer(a)).to.be(true);
      partialDone();
    });
    socket3.on("bin", () => {
      done(new Error("not"));
    });

    let sockets = 3;
    io.of("/ebdtan").on("connection", () => {
      --sockets || emit();
    });
    io.of("/test-ebdtan", () => {
      --sockets || emit();
    });

    function emit() {
      io.of("/ebdtan").emit("bin", Buffer.alloc(10));
    }
  });

  it("emits to the rest", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/test");

    socket1.on("a", (a) => {
      expect(a).to.be("b");
      socket1.emit("finish");
    });
    socket2.emit("broadcast");
    socket2.on("a", () => {
      done(new Error("done"));
    });
    socket3.on("a", () => {
      done(new Error("not"));
    });

    io.on("connection", (socket) => {
      socket.on("broadcast", () => {
        socket.broadcast.emit("a", "b");
      });
      socket.on("finish", () => {
        success(done, io, socket1, socket2, socket3);
      });
    });
  });

  // Note: This test is modified. See "Modification 1" in index.ts
  it("emits to rooms", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });

    socket2.on("a", () => {
      done(new Error("not"));
    });
    socket1.on("a", () => {
      success(done, io, socket1, socket2);
    });
    socket1.emit("join", "woot");
    socket1.emit("emit", "woot");

    io.on("connection", (socket) => {
      socket.on("join", async (room, fn) => {
        await socket.join(room);
        fn && fn();
      });

      socket.on("emit", (room) => {
        io.in(room).emit("a");
      });
    });
  });

  it("emits to rooms avoiding dupes", (done) => {
    const io = new Server(serverPort);
    const client1 = createClient(io, "/", { multiplex: false });
    const client2 = createClient(io, "/", { multiplex: false });

    const partialDone = createPartialDone(2, successFn(done, io, client1, client2));

    client2.on("a", () => {
      done(new Error("not"));
    });
    client1.on("a", partialDone);
    client2.on("b", partialDone);

    io.on("connection", async (socket) => {
      socket.on("join", async (room, fn) => {
        await socket.join(room);
        fn && fn();
      });

      socket.on("emit", () => {
        io.in("woot").in("test").emit("a");
        io.in("third").emit("b");
      });
    });

    spinCheck(() => {
      expect(client1.connected && client2.connected).to.be(true);

      client1.emit("join", "woot");
      client1.emit("join", "test");

      client2.emit("join", "third", () => {
        client2.emit("emit");
      });
    });
  });

  it("broadcasts to rooms", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    const partialDone = createPartialDone(2, successFn(done, io, socket1, socket2, socket3));

    spinCheck(() => {
      expect(socket1.connected && socket2.connected && socket3.connected).to.be(true);
      socket1.emit("join", "woot");
      socket2.emit("join", "test");
      socket3.emit("join", "test", () => {
        socket3.emit("broadcast");
      });
    });

    socket1.on("a", () => {
      done(new Error("not"));
    });
    socket2.on("a", () => {
      partialDone();
    });
    socket3.on("a", () => {
      done(new Error("not"));
    });
    socket3.on("b", () => {
      partialDone();
    });

    io.on("connection", (socket) => {
      socket.on("join", async (room, fn) => {
        await socket.join(room);
        fn && fn();
      });

      socket.on("broadcast", () => {
        socket.broadcast.to("test").emit("a");
        socket.emit("b");
      });
    });
  });

  it("broadcasts binary data to rooms", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    const partialDone = createPartialDone(2, successFn(done, io, socket1, socket2, socket3));

    spinCheck(() => {
      expect(socket1.connected && socket2.connected && socket3.connected).to.be(true);
      socket1.emit("join", "woot");
      socket2.emit("join", "test");
      socket3.emit("join", "test", () => {
        socket3.emit("broadcast");
      });
    });

    socket1.on("bin", (data) => {
      throw new Error("got bin in socket1");
    });
    socket2.on("bin", (data) => {
      expect(Buffer.isBuffer(data)).to.be(true);
      partialDone();
    });
    socket2.on("bin2", (data) => {
      throw new Error("socket2 got bin2");
    });
    socket3.on("bin", (data) => {
      throw new Error("socket3 got bin");
    });
    socket3.on("bin2", (data) => {
      expect(Buffer.isBuffer(data)).to.be(true);
      partialDone();
    });

    io.on("connection", (socket) => {
      socket.on("join", (room, fn) => {
        socket.join(room);
        fn && fn();
      });
      socket.on("broadcast", () => {
        socket.broadcast.to("test").emit("bin", Buffer.alloc(5));
        socket.emit("bin2", Buffer.alloc(5));
      });
    });
  });

  // Note: This test is modified. See "Modification 1" and "Modification 3" in index.ts
  it("keeps track of rooms", (done) => {
    const io = new Server(serverPort);
    const socket = createClient(io);

    io.on("connection", async (s) => {
      await s.join("a");
      expect(s.rooms).to.contain(s.id, "a");
      await s.join("b");
      expect(s.rooms).to.contain(s.id, "a", "b");
      await s.join("c");
      expect(s.rooms).to.contain(s.id, "a", "b", "c");
      s.leave("b");
      expect(s.rooms).to.contain(s.id, "a", "c");
      (s as any).leaveAll();
      await spinCheck(() => {
        expect(s.rooms.size).to.eql(0);
      });

      success(done, io, socket);
    });
  });

  // Note: This test is modified. See "Modification 1" in index.ts
  it("deletes empty rooms", (done) => {
    const io = new Server(serverPort);
    const socket = createClient(io);

    io.on("connection", async (s) => {
      await s.join("a");
      expect(s.nsp.adapter.rooms).to.contain("a");
      await s.leave("a");
      expect(s.nsp.adapter.rooms).to.not.contain("a");

      success(done, io, socket);
    });
  });

  // Note: This test is modified. See "Modification 1" and "Modification 3" in index.ts
  it("should properly cleanup left rooms", (done) => {
    const io = new Server(serverPort);
    const socket = createClient(io, "/spclr");

    io.of("/spclr").on("connection", async (s) => {
      await s.join("a");
      expect(s.rooms).to.contain(s.id, "a");
      await s.join("b");
      expect(s.rooms).to.contain(s.id, "a", "b");
      await s.leave("unknown");
      expect(s.rooms).to.contain(s.id, "a", "b");
      // For `leaveAll`, Socket.IO Socket doesn't return its underlying promise result
      (s as any).leaveAll();
      await spinCheck(() => {
        expect(s.rooms.size).to.eql(0);
      });
      success(done, io, socket);
    });
  });

  // Note: This test is modified. See "Modification 1" in index.ts
  it("allows to join several rooms at once", (done) => {
    const io = new Server(serverPort);
    const socket = createClient(io);

    io.on("connection", async (s) => {
      await s.join(["a", "b", "c"]);
      expect(s.rooms).to["contain"](s.id, "a", "b", "c");
      success(done, io, socket);
    });
  });

  // Note: This test is modified. See "Modification 2 " in index.ts
  it("should exclude specific sockets when broadcasting", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/sesswb", { multiplex: false });
    const socket2 = createClient(io, "/sesswb", { multiplex: false });
    const socket3 = createClient(io, "/sesswb", { multiplex: false });

    socket2.on("a", () => {
      done(new Error("not"));
    });
    socket3.on("a", () => {
      done(new Error("not"));
    });
    socket1.on("a", successFn(done, io, socket1, socket2, socket3));

    io.of("/sesswb").on("connection", (socket) => {
      socket.on("exclude", (id) => {
        socket.broadcast.except(id).emit("a");
      });
    });

    socket2.on("connect", () => {
      socket3.emit("exclude", socket2.id);
    });
  });

  // Note: This test is modified. See "Modification 2 " in index.ts
  it("should exclude a specific room when broadcasting", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    socket2.on("a", () => {
      done(new Error("not"));
    });
    socket3.on("a", () => {
      done(new Error("not"));
    });
    socket1.on("a", successFn(done, io, socket1, socket2, socket3));

    io.on("connection", (socket) => {
      socket.on("join", async (room, cb) => {
        await socket.join(room);
        cb();
      });
      socket.on("broadcast", () => {
        socket.broadcast.except("room1").emit("a");
      });
    });

    socket2.emit("join", "room1", () => {
      socket3.emit("broadcast");
    });
  });

  it("should return an immutable broadcast operator", (done) => {
    const io = new Server(serverPort);
    const clientSocket = createClient(io);

    io.on("connection", (socket) => {
      const operator = socket.local.compress(false).to(["room1", "room2"]).except("room3");
      operator.compress(true).emit("hello");
      operator.volatile.emit("hello");
      operator.to("room4").emit("hello");
      operator.except("room5").emit("hello");
      socket.emit("hello");
      socket.to("room6").emit("hello");
      // @ts-ignore
      expect(operator.rooms).to["contain"]("room1", "room2");
      // @ts-ignore
      expect(operator.rooms).to.not["contain"]("room4", "room5", "room6");
      // @ts-ignore
      expect(operator.exceptRooms).to.contain("room3");
      // @ts-ignore
      expect(operator.flags).to.eql({ local: true, compress: false });

      success(done, io, clientSocket);
    });
  });

  it("should broadcast and expect multiple acknowledgements", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    socket1.on("some event", (cb) => {
      cb(1);
    });

    socket2.on("some event", (cb) => {
      cb(2);
    });

    socket3.on("some event", (cb) => {
      cb(3);
    });

    Promise.all([waitFor(socket1, "connect"), waitFor(socket2, "connect"), waitFor(socket3, "connect")]).then(() => {
      io.timeout(2000).emit("some event", (err, responses) => {
        expect(err).to.be(null);
        expect(responses).to.have.length(3);
        expect(responses).to.contain(1, 2, 3);

        success(done, io, socket1, socket2, socket3);
      });
    });
  });

  it("should fail when a client does not acknowledge the event in the given delay", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    socket1.on("some event", (cb) => {
      cb(1);
    });

    socket2.on("some event", (cb) => {
      cb(2);
    });

    socket3.on("some event", () => {
      // timeout
    });

    Promise.all([waitFor(socket1, "connect"), waitFor(socket2, "connect"), waitFor(socket3, "connect")]).then(() => {
      io.timeout(timeoutMap[200]).emit("some event", (err, responses) => {
        expect(err).to.be.an(Error);
        expect(responses).to.have.length(2);
        expect(responses).to["contain"](1, 2);

        success(done, io, socket1, socket2, socket3);
      });
    });
  });

  it("should broadcast and expect multiple acknowledgements (promise)", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    socket1.on("some event", (cb) => {
      cb(1);
    });

    socket2.on("some event", (cb) => {
      cb(2);
    });

    socket3.on("some event", (cb) => {
      cb(3);
    });

    Promise.all([waitFor(socket1, "connect"), waitFor(socket2, "connect"), waitFor(socket3, "connect")]).then(
      async () => {
        const responses = await io.timeout(2000).emitWithAck("some event");
        expect(responses).to["contain"](1, 2, 3);

        success(done, io, socket1, socket2, socket3);
      }
    );
  });

  it("should fail when a client does not acknowledge the event in the given delay (promise)", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    socket1.on("some event", (cb) => {
      cb(1);
    });

    socket2.on("some event", (cb) => {
      cb(2);
    });

    socket3.on("some event", () => {
      // timeout
    });

    Promise.all([waitFor(socket1, "connect"), waitFor(socket2, "connect"), waitFor(socket3, "connect")]).then(
      async () => {
        try {
          await io.timeout(200).emitWithAck("some event");
          expect["fail"]();
        } catch (err) {
          expect(err).to.be.an(Error);
          // @ts-ignore
          expect(err.responses).to.have.length(2);
          // @ts-ignore
          expect(err.responses).to["contain"](1, 2);

          success(done, io, socket1, socket2, socket3);
        }
      }
    );
  });

  it("should broadcast and return if the packet is sent to 0 client", (done) => {
    const io = new Server(serverPort);
    const socket1 = createClient(io, "/", { multiplex: false });
    const socket2 = createClient(io, "/", { multiplex: false });
    const socket3 = createClient(io, "/", { multiplex: false });

    socket1.on("some event", () => {
      done(new Error("should not happen"));
    });

    socket2.on("some event", () => {
      done(new Error("should not happen"));
    });

    socket3.on("some event", () => {
      done(new Error("should not happen"));
    });

    io.to("room123")
      .timeout(timeoutMap[200])
      .emit("some event", (err, responses) => {
        expect(err).to.be(null);
        expect(responses).to.have.length(0);

        success(done, io, socket1, socket2, socket3);
      });
  });

  /**
   * Skip: 1 test related to WebSocket frame precomputation. It doesn't make sense for current implementation.
   * "should precompute the WebSocket frame when broadcasting"
   */
});
