import assert from "assert";
import { createServer } from "http";
import { Server } from "socket.io";
import { Adapter, BroadcastOptions } from "socket.io-adapter";
import { Packet } from "socket.io-parser";
import { cleanup, emitSequenceWithAck } from "./SIO/support/util";

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("Socket.IO acknowledgement test lifecycle (local)", () => {
  it("sends exactly the requested count and awaits the final response completion", async () => {
    const pending = new Map<number, { acknowledge: () => void; complete: () => void }>();
    class ControlledAdapter extends Adapter {
      broadcastWithAck(
        packet: Packet,
        _options: BroadcastOptions,
        clientCountCallback: (count: number) => void,
        acknowledge: (response: number) => void
      ): void {
        const sequence: number = packet.data[1];
        pending.set(sequence, {
          acknowledge: () => acknowledge(sequence),
          complete: () => clientCountCallback(1),
        });
      }
    }
    const io = new Server(createServer(), { adapter: ControlledAdapter });
    const count = 200;
    let settled = false;
    const completed = emitSequenceWithAck(io, "bc", count, 2000).finally(() => {
      settled = true;
    });
    try {
      assert.deepStrictEqual(
        [...pending.keys()],
        Array.from({ length: count }, (_, i) => i)
      );
      for (const [sequence, response] of pending) {
        response.acknowledge();
        if (sequence !== count - 1) response.complete();
      }
      await nextTurn();
      assert.strictEqual(settled, false, "Receiving the last client event must not end the test early.");
      pending.get(count - 1)!.complete();
      assert.deepStrictEqual(
        await completed,
        Array.from({ length: count }, (_, i) => [i])
      );
    } finally {
      pending.forEach((response) => response.complete());
      await Promise.allSettled([completed]);
      await cleanup(io);
    }
  });

  it("observes every pending acknowledgement before propagating a failure", async () => {
    const io = new Server(createServer());
    const operator = io.timeout(2000);
    const failure = new Error("The first acknowledgement failed.");
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: (response: number[]) => void;
    const first = new Promise<number[]>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const second = new Promise<number[]>((resolve) => {
      resolveSecond = resolve;
    });
    const timeout = jest.spyOn(io, "timeout").mockReturnValue(operator);
    const send = jest
      .spyOn(operator, "emitWithAck")
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second);
    let settled = false;
    const result = emitSequenceWithAck(io, "bc", 2, 2000).finally(() => {
      settled = true;
    });
    const rejected = assert.rejects(result, (error) => error === failure);
    try {
      rejectFirst(failure);
      await nextTurn();
      assert.strictEqual(settled, false, "Do not clean up while a later acknowledgement is still pending.");
      resolveSecond([1]);
      await rejected;
      assert.strictEqual(send.mock.calls.length, 2);
    } finally {
      resolveSecond([1]);
      try {
        await rejected;
      } finally {
        send.mockRestore();
        timeout.mockRestore();
        await cleanup(io);
      }
    }
  });
});
