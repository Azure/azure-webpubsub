import { createClient, createPartialDone, success, successFn, spinCheck, getServer } from "./support/util";
import { debugModule } from "../../src/common/utils";
const expect = require("expect.js");

const debug = debugModule("wps-sio-ext:ut");

describe("it should guarantee order", () => {
  it("when emit to a socket", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket1 = createClient("/", { multiplex: false });
      const totalCount = 200;

      let receivedCount = 0;
      socket1.on("bc", (a) => {
        expect(a).to.be(receivedCount);
        receivedCount++;
        if (receivedCount === totalCount) {
          success(done, io, socket1);
        }
      });

      io.on("connection", async (socket) => {
        await emit(socket);
      });

      async function emit(socket) {
        await spinCheck(() => {
          expect(socket1.connected).to.eql(true);
        });

        for (let i = 0; i <= totalCount; i++) {
          socket.emit("bc", i);
        }
      }
    });
  });

  it("when broadcasting to a namespace", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket1 = createClient("/", { multiplex: false });
      const totalCount = 200;

      let receivedCount = 0;
      socket1.on("bc", (a) => {
        expect(a).to.be(receivedCount);
        receivedCount++;
        if (receivedCount === totalCount) {
          success(done, io, socket1);
        }
      });

      io.on("connection", async () => {
        await emit();
      });

      async function emit() {
        await spinCheck(() => {
          expect(socket1.connected).to.eql(true);
        });

        for (let i = 0; i <= totalCount; i++) {
          io.emit("bc", i);
        }
      }
    });
  });

  it("when broadcasting to a group", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket1 = createClient("/", { multiplex: false });
      const partialDone = createPartialDone(2, successFn(done, io, socket1));
      const totalCount = 200;

      let receivedCountForG1 = 0;
      let receivedCountForG2 = 0;

      socket1.on("bc", (a, g) => {
        if (g === "g1") {
          expect(a).to.be(receivedCountForG1);
          receivedCountForG1++;
          if (receivedCountForG1 === totalCount) {
            partialDone();
          }
        } else if (g === "g2") {
          expect(a).to.be(receivedCountForG2);
          receivedCountForG2++;
          if (receivedCountForG2 === totalCount) {
            partialDone();
          }
        }
      });

      io.on("connection", async (socket) => {
        await emit(socket);
      });

      async function emit(socket) {
        await spinCheck(() => {
          expect(socket1.connected).to.eql(true);
        });

        await socket.join("g1");
        await socket.join("g2");

        for (let i = 0; i <= totalCount; i++) {
          io.to("g1").emit("bc", i, "g1");
          io.to("g2").emit("bc", i, "g2");
        }
      }
    });
  });

  it("when broadcasting to a namespace with ack", (done) => {
    const ioPromise = getServer(0);
    ioPromise.then((io) => {
      const socket1 = createClient("/", { multiplex: false });
      const totalCount = 200;

      let receivedCount = 0;
      socket1.on("bc", (a, cb) => {
        expect(a).to.be(receivedCount);
        receivedCount++;
        cb(a);
        if (receivedCount === totalCount) {
          success(done, io, socket1);
        }
      });

      io.on("connection", async () => {
        await emit();
      });

      async function emit() {
        await spinCheck(() => {
          expect(socket1.connected).to.eql(true);
        });

        for (let i = 0; i <= totalCount; i++) {
          io.timeout(2000).emitWithAck("bc", i);
        }
      }
    });
  });
});
