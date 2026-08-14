import http from "http";
import { AddressInfo } from "net";
import { io as ioClient, Socket } from "socket.io-client";

jest.mock("../dataRepo", () => ({
  DataRepo: jest.fn().mockImplementation(() => ({
    getAsync: jest.fn().mockResolvedValue([]),
    insertDataAsync: jest.fn().mockResolvedValue(1),
    updateDataAsync: jest.fn().mockResolvedValue(undefined),
    clearDataAsync: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { DataHub, DashboardAuthOptions } from "../dataHub";
import { getDashboardAllowedOrigins } from "../util";

function createFakeTunnel() {
  return {
    endpoint: "https://unit-test.webpubsub.azure.com/",
    hub: "testhub",
    getLiveTraceUrl: () => "https://unit-test.webpubsub.azure.com/livetrace",
    getLiveTraceToken: jest.fn().mockResolvedValue("live-trace-token"),
    getRestApiToken: jest.fn().mockResolvedValue("rest-api-token"),
    getClientAccessUrl: jest.fn().mockResolvedValue("wss://unit-test.webpubsub.azure.com/client/hubs/testhub?access_token=xyz"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

interface Harness {
  port: number;
  close: () => Promise<void>;
}

async function startHub(auth: DashboardAuthOptions): Promise<Harness> {
  const server = http.createServer();
  new DataHub(server, createFakeTunnel(), new URL("http://localhost:3000"), ":memory:", auth);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function tryConnect(port: number, opts: { token?: string; origin?: string }): Promise<{ connected: boolean; error?: string; socket?: Socket }> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      reconnection: false,
      transports: ["polling"],
      forceNew: true,
      auth: opts.token !== undefined ? { token: opts.token } : {},
      extraHeaders: opts.origin ? { Origin: opts.origin } : undefined,
    });
    const timer = setTimeout(() => {
      socket.close();
      resolve({ connected: false, error: "timeout" });
    }, 4000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve({ connected: true, socket });
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.close();
      resolve({ connected: false, error: err.message });
    });
  });
}

describe("getDashboardAllowedOrigins", () => {
  it("returns loopback origins for a concrete host", () => {
    const origins = getDashboardAllowedOrigins("127.0.0.1", 4000);
    expect(origins).toContain("http://127.0.0.1:4000");
    expect(origins).toContain("http://localhost:4000");
  });

  it("returns an empty list (origin not enforced) for wildcard bind hosts", () => {
    expect(getDashboardAllowedOrigins("0.0.0.0", 4000)).toEqual([]);
    expect(getDashboardAllowedOrigins("::", 4000)).toEqual([]);
    expect(getDashboardAllowedOrigins("", 4000)).toEqual([]);
  });
});

describe("DataHub dashboard authentication", () => {
  const TOKEN = "s3cret-access-token";
  const ORIGIN = "http://127.0.0.1:4000";

  let loopbackHub: Harness;

  beforeAll(async () => {
    loopbackHub = await startHub({ token: TOKEN, allowedOrigins: [ORIGIN] });
  });

  afterAll(async () => {
    await loopbackHub.close();
  });

  it("rejects a connection with no access token", async () => {
    const res = await tryConnect(loopbackHub.port, { origin: ORIGIN });
    expect(res.connected).toBe(false);
    expect(res.error).toBe("unauthorized");
  });

  it("rejects a connection with a wrong access token", async () => {
    const res = await tryConnect(loopbackHub.port, { token: "wrong", origin: ORIGIN });
    expect(res.connected).toBe(false);
    expect(res.error).toBe("unauthorized");
  });

  it("rejects a correct token from a disallowed origin", async () => {
    const res = await tryConnect(loopbackHub.port, { token: TOKEN, origin: "http://evil.example.com" });
    expect(res.connected).toBe(false);
    expect(res.error).not.toBe(undefined);
    expect(res.error).not.toBe("unauthorized");
  });

  it("accepts a correct token from the allowed origin and can invoke a token RPC", async () => {
    const res = await tryConnect(loopbackHub.port, { token: TOKEN, origin: ORIGIN });
    expect(res.connected).toBe(true);
    const socket = res.socket;
    if (!socket) {
      throw new Error("Expected the dashboard connection to succeed.");
    }
    const restToken: string = await socket.emitWithAck("getRestApiToken", "https://unit-test.webpubsub.azure.com/api");
    expect(restToken).toBe("rest-api-token");
    socket.close();
  });

  it("does not enforce origin when bound to a wildcard host (token is the sole gate)", async () => {
    const wildcardHub = await startHub({ token: TOKEN, allowedOrigins: [] });
    try {
      const good = await tryConnect(wildcardHub.port, { token: TOKEN, origin: "http://any-origin.example.com" });
      expect(good.connected).toBe(true);
      good.socket?.close();

      const bad = await tryConnect(wildcardHub.port, { token: "wrong", origin: "http://any-origin.example.com" });
      expect(bad.connected).toBe(false);
      expect(bad.error).toBe("unauthorized");
    } finally {
      await wildcardHub.close();
    }
  });
});
