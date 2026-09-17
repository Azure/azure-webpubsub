import assert from "assert";
import { once } from "events";
import { createServer, RequestListener } from "http";
import { eioHandshake, eioPoll, eioPush } from "./SIO/support/util";

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
