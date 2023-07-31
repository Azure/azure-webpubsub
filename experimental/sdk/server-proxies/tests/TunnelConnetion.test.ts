import { AbortSignalLike } from "@azure/abort-controller";
import { HttpRequestLike, HttpResponseLike, TunnelConnection } from "../src/tunnels/TunnelConnection";
import { WebPubSubTunnelClient } from "../src/tunnels/WebPubSubTunnelClient";
import { TunnelHttpResponseMessage, TunnelMessage, TunnelMessageType } from "../src/tunnels/messages";
import { PromiseCompletionSource } from "../src/utils";
import { AzureKeyCredential } from "@azure/core-auth";

jest.mock('../src/tunnels/WebPubSubTunnelClient.ts');

describe("TunnelConnection", () => {
  it("Can invoke and get response with single response message", async () => {
    let pcs = new PromiseCompletionSource();

    (WebPubSubTunnelClient as any).mockImplementation(() => {
      return {
        constructor() {
        },
        sendAsync: (message: TunnelMessage, abortSignal?: AbortSignalLike) => {
          pcs.resolve(null);
        }
      }
    })
    let client = new (WebPubSubTunnelClient as any)();
    const connection = new TunnelConnection("test", new AzureKeyCredential("key"), "hub");
    connection["clients"].set("key", client);

    let p = connection.invokeAsync({method: "Get", url: "abc.com"} as HttpRequestLike);
    const contentString = "test";
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    await connection["processMessage"](client, {Type: TunnelMessageType.HttpResponse, AckId: 1, StatusCode: 200, NotCompleted: false, Content: textEncoder.encode(contentString)} as TunnelHttpResponseMessage);
    let response = await p as HttpResponseLike;

    expect(response.statusCode).toBe(200);
    for await (const item of response.body) {
      expect(textDecoder.decode(item)).toBe(contentString);
    }
  });

  it("Can invoke and get response with multiple response message", async () => {
    let pcs = new PromiseCompletionSource();

    (WebPubSubTunnelClient as any).mockImplementation(() => {
      return {
        constructor() {
        },
        sendAsync: (message: TunnelMessage, abortSignal?: AbortSignalLike) => {
          pcs.resolve(null);
        }
      }
    })
    let client = new (WebPubSubTunnelClient as any)();
    const connection = new TunnelConnection("test", new AzureKeyCredential("key"), "hub");
    connection["clients"].set("key", client);

    let p = connection.invokeAsync({method: "Get", url: "abc.com"} as HttpRequestLike);
    const contentString = ["test", "test2", "test3"];

    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    await connection["processMessage"](client, {Type: TunnelMessageType.HttpResponse, AckId: 1, StatusCode: 200, NotCompleted: true, Content: textEncoder.encode(contentString[0])} as TunnelHttpResponseMessage);
    let response = await p as HttpResponseLike;

    expect(response.statusCode).toBe(200);
    await connection["processMessage"](client, {Type: TunnelMessageType.HttpResponse, AckId: 1, StatusCode: 200, NotCompleted: true, Content: textEncoder.encode(contentString[1])} as TunnelHttpResponseMessage);
    await connection["processMessage"](client, {Type: TunnelMessageType.HttpResponse, AckId: 1, StatusCode: 200, NotCompleted: true, Content: textEncoder.encode(contentString[2])} as TunnelHttpResponseMessage);
    await connection["processMessage"](client, {Type: TunnelMessageType.HttpResponse, AckId: 1, StatusCode: 200, NotCompleted: false} as TunnelHttpResponseMessage);

    let i = 0;
    for await (const item of response.body) {
      expect(textDecoder.decode(item)).toBe(contentString[i]);
      i++;
    }
  });
})
