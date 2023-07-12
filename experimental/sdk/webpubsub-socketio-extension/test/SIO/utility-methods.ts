import { createServer } from "http";
import { Socket } from "socket.io";
import { Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "net";
import { Server, createClient, createPartialDone, spinCheck, success } from "./support/util";
const expect = require("expect.js");

const serverPort = Number(process.env.SocketIoPort);
const SOCKETS_COUNT = 3;

describe("utility methods", () => {
  let io: Server, clientSockets: ClientSocket[], serverSockets: Socket[];
  beforeEach((done) => {
    const srv = createServer();
    io = new Server(srv);

    srv.listen(serverPort, () => {
      const port = (srv.address() as AddressInfo).port;
      clientSockets = [];
      for (let i = 0; i < SOCKETS_COUNT; i++) {
        clientSockets.push(createClient(io, "/", { transports: ["websocket"] }));
      }
      serverSockets = [];
      io.on("connection", (socket: Socket) => {
        serverSockets.push(socket);
        if (serverSockets.length === SOCKETS_COUNT) {
          done();
        }
      });
    });
  });

  /**
   * Skip: All tests realted to `io.fetchSockets`
   * Our adapter only supports local option, which must be explicitly assigned. Otherwise, it will throw exception
   * However, `io.fetchSockets` call `adapter.fetchSockets` without passing any options.
   */

  describe("socketsJoin", () => {
    // Note: This test is modified. See "Modification 3" in index.ts
    it("makes all socket instances join the given room", (done) => {
      io.socketsJoin("room1");
      spinCheck(() => {
        serverSockets.forEach((socket) => {
          expect(socket.rooms).to.contain("room1");
        });
      });
      success(done, io, ...clientSockets);
    });

    // Note: This test is modified. See "Modification 3" in index.ts
    it("makes all socket instances in a room join the given room", (done) => {
      serverSockets[0].join(["room1", "room2"]);
      serverSockets[1].join("room1");
      serverSockets[2].join("room2");
      io.in("room1").socketsJoin("room3");
      spinCheck(() => {
        expect(serverSockets[0].rooms).to.contain("room3");
        expect(serverSockets[1].rooms).to.contain("room3");
        expect(serverSockets[2].rooms).to.not.contain("room3");
      });
      success(done, io, ...clientSockets);
    });
  });

  describe("socketsLeave", () => {
    // Note: This test is modified. See "Modification 3" in index.ts
    it("makes all socket instances leave the given room", (done) => {
      serverSockets[0].join(["room1", "room2"]);
      serverSockets[1].join("room1");
      serverSockets[2].join("room2");
      spinCheck(() => {
        expect(serverSockets[0].rooms).to.contain("room1", "room2");
        expect(serverSockets[1].rooms).to.contain("room1");
        expect(serverSockets[2].rooms).to.contain("room2");

        io.socketsLeave("room1");
        spinCheck(() => {
          expect(serverSockets[0].rooms).to.contain("room2");
          expect(serverSockets[0].rooms).to.not.contain("room1");
          expect(serverSockets[1].rooms).to.not.contain("room1");
          success(done, io, ...clientSockets);
        });
      });
    });

    // Note: This test is modified. See "Modification 3" in index.ts
    it("makes all socket instances in a room leave the given room", (done) => {
      serverSockets[0].join(["room1", "room2"]);
      serverSockets[1].join("room1");
      serverSockets[2].join("room2");
      spinCheck(() => {
        expect(serverSockets[0].rooms).to.contain("room1", "room2");
        expect(serverSockets[1].rooms).to.contain("room1");
        expect(serverSockets[2].rooms).to.contain("room2");
        io.in("room2").socketsLeave("room1");
        spinCheck(() => {
          expect(serverSockets[0].rooms).to.contain("room2");
          expect(serverSockets[0].rooms).to.not.contain("room1");
          expect(serverSockets[1].rooms).to.contain("room1");
          success(done, io, ...clientSockets);
        });
      });
    });
  });

  describe("disconnectSockets", () => {
    it("makes all socket instances disconnect", (done) => {
      io.disconnectSockets(true);
      const partialDone = createPartialDone(3, done);
      clientSockets[0].on("disconnect", partialDone);
      clientSockets[1].on("disconnect", partialDone);
      clientSockets[2].on("disconnect", partialDone);
      success(done, io, ...clientSockets);
    });

    // Note: This test is modified. See "Modification 3" in index.ts
    it("makes all socket instances in a room disconnect", (done) => {
      serverSockets[0].join(["room1", "room2"]);
      serverSockets[1].join("room1");
      serverSockets[2].join("room2");
      // Note: `setTimeout` is added for Modification 5
      spinCheck(() => {
        expect(serverSockets[0].rooms).to.contain("room1", "room2");
        expect(serverSockets[1].rooms).to.contain("room1");
        expect(serverSockets[2].rooms).to.contain("room2");

        io.in("room2").disconnectSockets(true);

        const partialDone = createPartialDone(2, () => {
          clientSockets[1].off("disconnect");
          success(done, io, ...clientSockets);
        });
        clientSockets[0].on("disconnect", partialDone);
        clientSockets[1].on("disconnect", () => {
          done(new Error("should not happen"));
        });
        clientSockets[2].on("disconnect", partialDone);
      });
    });
  });
});
