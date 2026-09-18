import assert from "assert";
import { once } from "events";
import { createServer, RequestListener } from "http";
import {
  eioHandshake,
  eioPoll,
  eioPush,
  getClientConnectPath,
  getSioServerOptions,
  updateAndGetInternalCounter,
} from "./SIO/support/util";

async function withLocalResponse(handler: RequestListener, check: () => Promise<void>) {
  const server = createServer(handler);
  const connectionString = process.env.WebPubSubConnectionString;
  const hub = process.env.WebPubSubHub;
  await once(server.listen(0, "127.0.0.1"), "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.env.WebPubSubConnectionString = `Endpoint=http://127.0.0.1;Port=${address.port}`;
    process.env.WebPubSubHub = "local-http-helper";
    await check();
  } finally {
    if (connectionString === undefined) delete process.env.WebPubSubConnectionString;
    else process.env.WebPubSubConnectionString = connectionString;
    if (hub === undefined) delete process.env.WebPubSubHub;
    else process.env.WebPubSubHub = hub;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe("Engine.IO HTTP test helpers (local)", () => {
  it("routes every raw request to the currently configured test hub", async () => {
    let expectedPath: string;
    const paths: string[] = [];
    await withLocalResponse(
      (req, res) => {
        const url = new URL(req.url!, "http://localhost");
        paths.push(url.pathname);
        res.setHeader("Content-Type", "text/plain");
        if (url.pathname !== expectedPath) {
          res.statusCode = 400;
          res.end("Wrong test hub.");
        } else if (!url.searchParams.has("sid")) {
          res.end('0{"sid":"current-session"}');
        } else {
          res.end(req.method === "POST" ? "ok" : "6\u001e1");
        }
      },
      async () => {
        for (let iteration = 0; iteration < 2; iteration++) {
          const index = updateAndGetInternalCounter();
          expectedPath = `/clients/socketio/hubs/${getSioServerOptions().hub}`;
          assert.strictEqual(getClientConnectPath(index), expectedPath);
          assert.notStrictEqual(getClientConnectPath(0), expectedPath);
          const sid = await eioHandshake();
          await eioPush(sid, "40");
          assert.strictEqual(await eioPoll(sid), "6\u001e1");
          assert.deepStrictEqual(paths.slice(-3), [expectedPath, expectedPath, expectedPath]);
        }
      }
    );
  });

  it("awaits the handshake, post and poll responses", async () => {
    const methods: string[] = [];
    await withLocalResponse(
      (req, res) => {
        methods.push(req.method);
        res.setHeader("Content-Type", "text/plain");
        if (!req.url.includes("sid=")) res.end('0{"sid":"local-session"}');
        else res.end(req.method === "POST" ? "ok" : "6\u001e1");
      },
      async () => {
        const sid = await eioHandshake();
        assert.strictEqual(sid, "local-session");
        await eioPush(sid, "40");
        assert.strictEqual(await eioPoll(sid), "6\u001e1");
      }
    );
    assert.deepStrictEqual(methods, ["GET", "POST", "GET"]);
  });

  it("rejects unsuccessful responses instead of continuing the test", async () => {
    await withLocalResponse(
      (_req, res) => {
        res.statusCode = 503;
        res.end();
      },
      async () => {
        await assert.rejects(eioHandshake(), /expected 200/);
        await assert.rejects(eioPush("session", "40"), /expected 200/);
        await assert.rejects(eioPoll("session"), /expected 200/);
      }
    );
  });

  it.each(["invalid-json", "0{}"])("rejects an invalid handshake body: %s", async (body) => {
    await withLocalResponse(
      (_req, res) => {
        res.setHeader("Content-Type", "text/plain");
        res.end(body);
      },
      () => assert.rejects(eioHandshake())
    );
  });
});
