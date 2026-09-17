import { once } from "events";
import { IncomingMessage } from "http";
import { Socket as NetSocket } from "net";
import { Server as EngineServer, Socket as EngineSocket } from "engine.io";
import { decodePayload } from "engine.io-parser";
import { Decoder, Packet } from "socket.io-parser";
import expect from "expect.js";
import { WebPubSubTransport } from "../src/EIO/components/web-pubsub-transport";
import { ClientConnectionContext } from "../src/EIO/components/client-connection-context";
import { WEBPUBSUB_CLIENT_CONNECTION_FILED_NAME } from "../src/EIO/components/constants";
import { WebPubSubServiceCaller } from "../src/serverProxies";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function createTransportFixture(blockSecondSend = false) {
  const sent: string[] = [];
  const releaseFirst = deferred();
  const releaseSecond = deferred();
  let activeSends = 0;
  let maxConcurrentSends = 0;
  const unsupported = async () => {
    throw new Error("Unexpected service operation in transport test.");
  };
  const service: WebPubSubServiceCaller = {
    async sendToConnection(_id, payload) {
      sent.push(payload);
      activeSends++;
      maxConcurrentSends = Math.max(maxConcurrentSends, activeSends);
      try {
        if (sent.length === 1) await releaseFirst.promise;
        else if (sent.length === 2 && blockSecondSend) await releaseSecond.promise;
      } finally {
        activeSends--;
      }
    },
    sendToAll: unsupported,
    addConnectionsToGroups: unsupported,
    removeConnectionsFromGroups: unsupported,
    invoke: unsupported,
    group() {
      throw new Error("Unexpected group operation in transport test.");
    },
  };
  const context = new ClientConnectionContext(service, "local-transport-test", {
    success() {},
    setState() {
      throw new Error("Unexpected handshake state update.");
    },
    fail() {
      throw new Error("Unexpected handshake rejection.");
    },
    failWith() {
      throw new Error("Unexpected handshake rejection.");
    },
  });
  const networkSocket = new NetSocket();
  const request = Object.assign(new IncomingMessage(networkSocket), {
    _query: { EIO: "4" },
    [WEBPUBSUB_CLIENT_CONNECTION_FILED_NAME]: context,
  });
  const server = new EngineServer({ allowUpgrades: false });
  const transport = new WebPubSubTransport(request);
  const opened = once(transport, "drain");
  const socket = new EngineSocket("local-transport-test", server, transport, request, 4);
  await opened;
  return {
    socket,
    transport,
    sent,
    releaseFirst: releaseFirst.release,
    releaseSecond: releaseSecond.release,
    get maxConcurrentSends() {
      return maxConcurrentSends;
    },
    async dispose() {
      releaseFirst.release();
      releaseSecond.release();
      socket.close(true);
      server.close();
      networkSocket.destroy();
      await nextTurn();
    },
  };
}

describe("Web PubSub transport readiness (local)", () => {
  it("flushes queued packets after an asynchronous send and preserves callbacks", async () => {
    const fixture = await createTransportFixture();
    try {
      const callbacks: string[] = [];
      fixture.socket.send('2["first"]', {}, () => callbacks.push("first"));
      fixture.socket.send('2["second"]', {}, () => callbacks.push("second"));
      await nextTurn();
      expect(fixture.sent).to.eql(['42["first"]']);
      expect(callbacks).to.eql([]);

      fixture.releaseFirst();
      await nextTurn();

      expect(fixture.sent).to.eql(['42["first"]', '42["second"]']);
      expect(callbacks).to.eql(["first", "second"]);
      expect(fixture.maxConcurrentSends).to.be(1);
    } finally {
      await fixture.dispose();
    }
  });

  it("preserves an in-flight send started by a send callback", async () => {
    const fixture = await createTransportFixture(true);
    try {
      const callbacks: string[] = [];
      fixture.socket.send('2["first"]', {}, () => {
        callbacks.push("first");
        fixture.socket.send('2["second"]', {}, () => callbacks.push("second"));
        fixture.socket.send('2["third"]', {}, () => callbacks.push("third"));
      });
      fixture.releaseFirst();
      await nextTurn();

      expect(fixture.sent).to.eql(['42["first"]', '42["second"]']);
      expect(callbacks).to.eql(["first"]);
      expect(fixture.transport.writable).to.be(false);

      fixture.releaseSecond();
      await nextTurn();

      expect(fixture.sent).to.eql(['42["first"]', '42["second"]', '42["third"]']);
      expect(callbacks).to.eql(["first", "second", "third"]);
      expect(fixture.maxConcurrentSends).to.be(1);
    } finally {
      await fixture.dispose();
    }
  });

  it("preserves an in-flight close started by a send callback", async () => {
    const fixture = await createTransportFixture(true);
    try {
      fixture.socket.send('2["first"]', {}, () => fixture.socket.close());
      fixture.releaseFirst();
      await nextTurn();

      expect(fixture.socket.readyState).to.be("closed");
      expect(fixture.sent).to.eql(['42["first"]', "1"]);
      expect(fixture.transport.writable).to.be(false);

      fixture.releaseSecond();
      await nextTurn();

      expect(fixture.sent).to.eql(['42["first"]', "1"]);
      expect(fixture.maxConcurrentSends).to.be(1);
    } finally {
      await fixture.dispose();
    }
  });

  it("resumes binary attachments and following packets in order", async () => {
    const fixture = await createTransportFixture();
    const decoder = new Decoder();
    const packets: Packet[] = [];
    decoder.on("decoded", (packet: Packet) => packets.push(packet));
    try {
      const binary = Buffer.from([0, 127, 255]);
      fixture.socket.send('2["first"]');
      fixture.socket.send('51-["binary",{"_placeholder":true,"num":0}]');
      fixture.socket.send(binary);
      fixture.socket.send('2["last"]');
      fixture.releaseFirst();
      await nextTurn();
      for (const payload of fixture.sent) {
        for (const packet of decodePayload(payload)) {
          expect(packet.type).to.be("message");
          decoder.add(packet.data);
        }
      }
      expect(packets.map((packet) => packet.data)).to.eql([["first"], ["binary", binary], ["last"]]);
    } finally {
      decoder.destroy();
      await fixture.dispose();
    }
  });

  it("finishes a close that was waiting for queued messages to flush", async () => {
    const fixture = await createTransportFixture();
    try {
      fixture.socket.send('2["first"]');
      fixture.socket.send('2["second"]');
      fixture.socket.close();
      expect(fixture.socket.readyState).to.be("closing");
      fixture.releaseFirst();
      await nextTurn();
      expect(fixture.socket.readyState).to.be("closed");
      expect(fixture.sent).to.eql(['42["first"]', '42["second"]', "1"]);
    } finally {
      await fixture.dispose();
    }
  });
});
