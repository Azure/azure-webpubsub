import { AbortSignalLike } from "@azure/abort-controller";
import { AzureKeyCredential, TokenCredential } from "@azure/core-auth";
import { InprocessServerProxy } from "../src/InprocessServerProxy";
import { PromiseCompletionSource } from "../src/utils";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { JwtPayload, decode } from "jsonwebtoken";

describe("InprocessServerProxy", () => {
  it("Can establish InprocessServerProxy from connection string", async () => {
    let pcs = new PromiseCompletionSource();
    const connect = jest.spyOn(WebPubSubClient.prototype as any, "_connectCore");
    connect.mockImplementation((url) => {
      pcs.resolve(url);
    });

    const proxy = InprocessServerProxy.fromConnectionString("Endpoint=http://abc;AccessKey=abc;", "hub");
    proxy.runAsync();
    const url = new URL(await pcs.promise as string);
    const token = decode(url.searchParams.get("access_token") as string) as JwtPayload;
    expect(url.origin).toBe("ws://abc");
    expect(url.pathname).toBe("/server/tunnel");
    expect(url.searchParams.get("hub") as string).toBe("hub");
    expect(token.aud).toBe("ws://abc/server/tunnel?hub=hub");
  });
  it("Can establish InprocessServerProxy from connection string and reverse proxy", async () => {
    let pcs = new PromiseCompletionSource();
    const connect = jest.spyOn(WebPubSubClient.prototype as any, "_connectCore");
    connect.mockImplementation((url) => {
      pcs.resolve(url);
    });

    const proxy = InprocessServerProxy.fromConnectionString("Endpoint=http://abc/;AccessKey=abc;", "hub", undefined, "https://reverseproxy/abc");
    proxy.runAsync();
    const url = new URL(await pcs.promise as string);
    const token = decode(url.searchParams.get("access_token") as string) as JwtPayload;
    expect(url.origin).toBe("wss://reverseproxy");
    expect(url.pathname).toBe("/abc/server/tunnel");
    expect(url.searchParams.get("hub") as string).toBe("hub");
    expect(token.aud).toBe("ws://abc/server/tunnel?hub=hub");
  });
});
