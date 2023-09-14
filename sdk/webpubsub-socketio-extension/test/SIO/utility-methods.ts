import { createServer } from "http";
import { Socket } from "socket.io";
import { Socket as ClientSocket } from "socket.io-client";
import {
  Server,
  createClient,
  createPartialDone,
  success,
  spinCheck,
  getServer,
  baseServerPort,
  updateAndGetInternalCounter,
  getPort,
} from "./support/util";
import { debugModule } from "../../src/common/utils";
const expect = require("expect.js");

const debug = debugModule("wps-sio-ext:ut:sio:utility");

const serverPort = baseServerPort;
const SOCKETS_COUNT = 3;

describe("utility methods", () => {
  let io: Server;
  let clientSockets: ClientSocket[] = [];
  let serverSockets: Socket[] = [];

  beforeEach((done) => {
    const httpServer = createServer();
    const expectPort = baseServerPort + updateAndGetInternalCounter();

    httpServer.listen(expectPort, () => {
      const port = getPort(httpServer);
      debug(`HTTP server is listening on port ${port}, expect ${expectPort}`);

      // Make sure `getServer` is behind `httpServer.listen`
      const ioPromise = getServer(httpServer);
      ioPromise.then((resolvedIo) => {
        debug(`Socket.IO server have been setuped`);
        io = resolvedIo;

        for (let i = 0; i < SOCKETS_COUNT; i++) {
          clientSockets.push(createClient("/", { transports: ["websocket"] }));
        }

        io.on("connection", async (socket: Socket) => {
          debug(`Server socket ${socket.id} is connected`);
          serverSockets.push(socket);
          if (serverSockets.length === SOCKETS_COUNT) {
            await spinCheck(() => {
              for (const clientSocket of clientSockets) expect(clientSocket.connected).to.be(true);
            });

            const compareFunc = (a, b) => (a.id < b.id ? -1 : 1);
            serverSockets = serverSockets.sort(compareFunc);
            clientSockets = clientSockets.sort(compareFunc);

            done();
          }
        });
      });
    });
  });

  /**
   * Skip: All tests realted to `io.fetchSockets`
   * Our adapter only supports local option, which must be explicitly assigned. Otherwise, it will throw exception
   * However, `io.fetchSockets` call `adapter.fetchSockets` without passing any options.
   */

  // describe("socketsJoin", () => {
  //   // Note: This test is modified. See "Modification 3" in index.ts
  //   it("makes all socket instances join the given room", (done) => {
  //     io.socketsJoin("room1");
  //     spinCheck(() => {
  //       serverSockets.forEach((socket) => {
  //         expect(socket.rooms).to.contain("room1");
  //       });
  //     });
  //     done();
  //   });

  //   // Note: This test is modified. See "Modification 3" in index.ts
  //   it("makes all socket instances in a room join the given room", (done) => {
  //     serverSockets[0].join(["room1", "room2"]);
  //     serverSockets[1].join("room1");
  //     serverSockets[2].join("room2");
  //     io.in("room1").socketsJoin("room3");
  //     spinCheck(() => {
  //       expect(serverSockets[0].rooms).to.contain("room3");
  //       expect(serverSockets[1].rooms).to.contain("room3");
  //       expect(serverSockets[2].rooms).to.not.contain("room3");
  //     });
  //     done();
  //   });
  // });

  describe("socketsLeave", () => {
    // Note: This test is modified. See "Modification 3" in index.ts
    it("makes all socket instances leave the given room", (done) => {
      serverSockets[0].join(["room1", "room2"]);
      serverSockets[1].join("room1");
      serverSockets[2].join("room2");
      debug(serverSockets[0].conn.transport.sid, serverSockets[0].id);
      debug(serverSockets[1].conn.transport.sid, serverSockets[1].id);
      debug(serverSockets[2].conn.transport.sid, serverSockets[2].id);
      spinCheck(() => {
        expect(serverSockets[0].rooms).to.contain("room1", "room2");
        expect(serverSockets[1].rooms).to.contain("room1");
        expect(serverSockets[2].rooms).to.contain("room2");
      }).then(async () => {
        io.socketsLeave("room1");
        await spinCheck(() => {
          expect(serverSockets[0].rooms).to.contain("room2");
          expect(serverSockets[0].rooms).to.not.contain("room1");
          expect(serverSockets[1].rooms).to.not.contain("room1");
        });
        done();
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
      }).then(async () => {
        await spinCheck(() => {
          expect(serverSockets[0].rooms).to.contain("room2");
          expect(serverSockets[0].rooms).to.not.contain("room1");
          expect(serverSockets[1].rooms).to.contain("room1");
          done();
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
    });

    // Note: This test is modified. See "Modification 3" in index.ts
    it("makes all socket instances in a room disconnect", (done) => {
      serverSockets[0].join(["room1", "room2"]);
      serverSockets[1].join("room1");
      serverSockets[2].join("room2");
      spinCheck(() => {
        expect(serverSockets[0].rooms).to.contain("room1", "room2");
        expect(serverSockets[1].rooms).to.contain("room1");
        expect(serverSockets[2].rooms).to.contain("room2");

        io.in("room2").disconnectSockets(true);

        const partialDone = createPartialDone(2, () => {
          clientSockets[1].off("disconnect");
          done();
        });
        clientSockets[0].on("disconnect", partialDone);
        clientSockets[1].on("disconnect", () => {
          done(new Error("should not happen"));
        });
        clientSockets[2].on("disconnect", partialDone);
      });
    });
  });

  afterEach((done) => {
    success(
      () => {
        clientSockets = [];
        serverSockets = [];
        done();
      },
      io,
      ...(clientSockets ?? []),
      ...(serverSockets ?? [])
    );
  });
});
