import { Socket } from "socket.io";
import { Socket as ClientSocket } from "socket.io-client";
import { cleanup, createClient, emitSequenceWithAck, getServer, waitFor } from "./support/util";
import { timeoutMap } from "./support/constants";
const expect = require("expect.js");

function receiveMessages(client: ClientSocket, count: number): Promise<unknown[][]> {
  return new Promise((resolve) => {
    const messages: unknown[][] = [];
    const receive = (...args: unknown[]) => {
      messages.push(args);
      if (messages.length === count) {
        client.off("bc", receive);
        resolve(messages);
      }
    };
    client.on("bc", receive);
  });
}

describe("it should guarantee order", () => {
  it("when emit to a socket", async () => {
    const io = await getServer(0);
    const serverConnected = waitFor<Socket>(io, "connection");
    const socket1 = createClient("/", { multiplex: false });
    const totalCount = 200;
    try {
      const received = receiveMessages(socket1, totalCount);
      const [socket] = await Promise.all([serverConnected, waitFor(socket1, "connect")]);
      for (let i = 0; i < totalCount; i++) {
        socket.emit("bc", i);
      }
      expect(await received).to.eql(Array.from({ length: totalCount }, (_, i) => [i]));
    } finally {
      await cleanup(io, socket1);
    }
  });

  it("when broadcasting to a namespace", async () => {
    const io = await getServer(0);
    const socket1 = createClient("/", { multiplex: false });
    const totalCount = 200;
    try {
      const received = receiveMessages(socket1, totalCount);
      await waitFor(socket1, "connect");
      for (let i = 0; i < totalCount; i++) {
        io.emit("bc", i);
      }
      expect(await received).to.eql(Array.from({ length: totalCount }, (_, i) => [i]));
    } finally {
      await cleanup(io, socket1);
    }
  });

  it("when broadcasting to a group", async () => {
    const io = await getServer(0);
    const serverConnected = waitFor<Socket>(io, "connection");
    const socket1 = createClient("/", { multiplex: false });
    const totalCount = 200;
    try {
      const received = receiveMessages(socket1, totalCount * 2);
      const [socket] = await Promise.all([serverConnected, waitFor(socket1, "connect")]);
      await socket.join("g1");
      await socket.join("g2");
      for (let i = 0; i < totalCount; i++) {
        io.to("g1").emit("bc", i, "g1");
        io.to("g2").emit("bc", i, "g2");
      }
      const messages = await received;
      for (const group of ["g1", "g2"]) {
        expect(messages.filter((message) => message[1] === group)).to.eql(
          Array.from({ length: totalCount }, (_, i) => [i, group])
        );
      }
    } finally {
      await cleanup(io, socket1);
    }
  });

  it("when broadcasting to a namespace with ack", async () => {
    const io = await getServer(0);
    const socket1 = createClient("/", { multiplex: false });
    const totalCount = 200;
    const received: number[] = [];
    try {
      socket1.on("bc", (sequence: number, acknowledge: (sequence: number) => void) => {
        received.push(sequence);
        acknowledge(sequence);
      });
      await waitFor(socket1, "connect");
      const responses = await emitSequenceWithAck(io, "bc", totalCount, timeoutMap[2000]);
      expect(received).to.eql(Array.from({ length: totalCount }, (_, i) => i));
      expect(responses).to.eql(Array.from({ length: totalCount }, (_, i) => [i]));
    } finally {
      await cleanup(io, socket1);
    }
  });
});
