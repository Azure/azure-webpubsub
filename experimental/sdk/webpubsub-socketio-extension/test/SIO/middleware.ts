import { Socket } from "socket.io";
import expect from "expect.js";
import { success, createClient, successFn, createPartialDone, getServer } from "./support/util";

describe("middleware", () => {
  it("should call functions", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      let run = 0;
      io.use((socket, next) => {
        expect(socket).to.be.a(Socket);
        run++;
        next();
      });
      io.use((socket, next) => {
        expect(socket).to.be.a(Socket);
        run++;
        next();
      });

      const socket = createClient();
      socket.on("connect", () => {
        expect(run).to.be(2);

        success(done, io, socket);
      });
    });
  });

  it("should pass errors", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      io.use((socket, next) => {
        next(new Error("Authentication error"));
      });
      io.use((socket, next) => {
        done(new Error("nope"));
      });

      const socket = createClient();
      socket.on("connect", () => {
        done(new Error("nope"));
      });
      socket.on("connect_error", (err) => {
        expect(err.message).to.be("Authentication error");

        success(done, io, socket);
      });
    });
  });

  // TODO: This test failes intermittently. Need further investigate.
  it("should pass an object", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      io.of("/spao").use((socket, next) => {
        const err = new Error("Authentication error");
        // @ts-ignore
        err.data = { a: "b", c: 3 };
        next(err);
      });

      const socket = createClient("/spao");
      socket.on("connect", () => {
        done(new Error("nope"));
      });
      socket.on("connect_error", (err) => {
        expect(err).to.be.an(Error);
        expect(err.message).to.eql("Authentication error");
        // @ts-ignore
        expect(err.data).to.eql({ a: "b", c: 3 });

        success(done, io, socket);
      });
    });
  });

  it("should only call connection after fns", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      io.use((socket: any, next) => {
        socket.name = "guillermo";
        next();
      });

      const clientSocket = createClient();
      io.on("connection", (socket) => {
        expect((socket as any).name).to.be("guillermo");

        success(done, io, clientSocket);
      });
    });
  });

  it("should only call connection after (lengthy) fns", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      let authenticated = false;

      io.use((socket, next) => {
        setTimeout(() => {
          authenticated = true;
          next();
        }, 300);
      });

      const socket = createClient();
      socket.on("connect", () => {
        expect(authenticated).to.be(true);

        success(done, io, socket);
      });
    });
  });

  it("should be ignored if socket gets closed", (done) => {
    const ioPromise = getServer(0, { pingInterval: 300000 });

    ioPromise.then((io) => {
      let clientSocket = createClient("/", { reconnection: false });

      io.use((serverSocket, next) => {
        clientSocket.io.engine.close();
        serverSocket.client.conn.on("close", () => {
          process.nextTick(next);
          setTimeout(() => {
            success(done, io, clientSocket);
          }, 50);
        });
      });

      io.on("connection", (socket) => {
        done(new Error("should not fire"));
      });
    });
  });

  it("should call functions in expected order", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const result: number[] = [];

      io.use(() => {
        done(new Error("should not fire"));
      });
      io.of("/chat").use((socket, next) => {
        result.push(1);
        setTimeout(next, 50);
      });
      io.of("/chat").use((socket, next) => {
        result.push(2);
        setTimeout(next, 50);
      });
      io.of("/chat").use((socket, next) => {
        result.push(3);
        setTimeout(next, 50);
      });

      const chat = createClient("/chat");
      chat.on("connect", () => {
        expect(result).to.eql([1, 2, 3]);

        success(done, io, chat);
      });
    });
  });

  it("should disable the merge of handshake packets", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      io.use((socket, next) => {
        next();
      });

      const socket = createClient();
      socket.on("connect", successFn(done, io, socket));
    });
  });

  it("should work with a custom namespace", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket1 = createClient("/");
      const socket2 = createClient("/chat");

      const partialDone = createPartialDone(2, successFn(done, io, socket1, socket2));

      io.of("/chat").use((socket, next) => {
        next();
      });

      socket1.on("connect", partialDone);
      socket2.on("connect", partialDone);
    });
  });

  it("should only set `connected` to true after the middleware execution", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const clientSocket = createClient("/");

      io.use((socket, next) => {
        expect(socket.connected).to.be(false);
        expect(socket.disconnected).to.be(true);
        next();
      });

      io.on("connection", (socket) => {
        expect(socket.connected).to.be(true);
        expect(socket.disconnected).to.be(false);

        success(done, io, clientSocket);
      });
    });
  });
});
