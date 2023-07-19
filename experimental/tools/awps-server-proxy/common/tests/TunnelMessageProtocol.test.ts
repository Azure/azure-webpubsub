import { TunnelMessageProtocol } from "../src/tunnels/TunnelMessageProtocol";
import {
  TunnelConnectionRebalanceMessage,
  TunnelConnectionCloseMessage,
  TunnelConnectionConnectedMessage,
  TunnelConnectionReconnectMessage,
  TunnelHttpRequestMessage,
  TunnelHttpResponseMessage,
  TunnelMessage,
  TunnelMessageType,
  TunnelServiceStatusMessage,
} from "../src/tunnels/messages";

describe("TunnelMessageProtocolTests", () => {
  it("TestResponseMessage", () => {
    const message = new TunnelHttpResponseMessage(1, true, 200, "a", {
      a: ["b"],
    });
    message.Content = new TextEncoder().encode("Hello");
    expect(TunnelMessageType.HttpResponse).toEqual(message.Type);
    const parsed = testCore(message);
    expect(TunnelMessageType.HttpResponse).toEqual(parsed.Type);
    expect(message.Type).toEqual(parsed.Type);
    expect(message.ChannelName).toEqual(parsed.ChannelName);
    expect(message.Headers).toEqual(parsed.Headers);
    expect(message.LocalRouting).toEqual(parsed.LocalRouting);
    expect(message.Content).toEqual(parsed.Content);
    expect(message.StatusCode).toEqual(parsed.StatusCode);
  });

  it("TestRequestMessage", () => {
    const message = new TunnelHttpRequestMessage(1, true, "a", "HEAD", "a", {
      a: ["b"],
    });
    message.Content = new TextEncoder().encode("Hello");
    expect(TunnelMessageType.HttpRequest).toEqual(message.Type);
    const parsed = testCore(message);
    expect(TunnelMessageType.HttpRequest).toEqual(parsed.Type);
    expect(message.Type).toEqual(parsed.Type);
    expect(message.ChannelName).toEqual(parsed.ChannelName);
    expect(message.HttpMethod).toEqual(parsed.HttpMethod);
    expect(message.Url).toEqual(parsed.Url);
    expect(message.Headers).toEqual(parsed.Headers);
    expect(message.LocalRouting).toEqual(parsed.LocalRouting);
    expect(message.Content).toEqual(parsed.Content);
  });
  it("TestRebalanceMessage", () => {
    const message = new TunnelConnectionRebalanceMessage("a", "b", "c");
    expect(TunnelMessageType.ConnectionRebalance).toEqual(message.Type);
    const parsed = testCore(message);
    expect(TunnelMessageType.ConnectionRebalance).toEqual(parsed.Type);
    expect(message.Message).toEqual(parsed.Message);
  });
  it("TestStatusMessage", () => {
    const message = new TunnelServiceStatusMessage("a");
    expect(TunnelMessageType.ServiceStatus).toEqual(message.Type);
    const parsed = testCore(message);
    expect(TunnelMessageType.ServiceStatus).toEqual(parsed.Type);
    expect(message.Message).toEqual(parsed.Message);
  });

  it("TestReconnectMessage", () => {
    const message = new TunnelConnectionReconnectMessage("a", "b", "c");
    expect(TunnelMessageType.ConnectionReconnect).toEqual(message.Type);
    const parsed = testCore(message);
    expect(TunnelMessageType.ConnectionReconnect).toEqual(parsed.Type);
    expect(message.Message).toEqual(parsed.Message);
  });

  it("TestCloseMessage", () => {
    const message = new TunnelConnectionCloseMessage("a");
    expect(TunnelMessageType.ConnectionClose).toEqual(message.Type);
    const parsed = testCore(message);
    expect(TunnelMessageType.ConnectionClose).toEqual(parsed.Type);
    expect(message.Message).toEqual(parsed.Message);
  });

  it("TestConnectedMessage", () => {
    const message = new TunnelConnectionConnectedMessage("a", "b", "c");
    expect(TunnelMessageType.ConnectionConnected).toEqual(message.Type);
    const parsed = testCore(message);
    expect(TunnelMessageType.ConnectionConnected).toEqual(parsed.Type);
    expect(message.ConnectionId).toEqual(parsed.ConnectionId);
    expect(message.UserId).toEqual(parsed.UserId);
    expect(message.ReconnectionToken).toEqual(parsed.ReconnectionToken);
  });
});

describe("ServiceBytesCanParseTests", () => {
  it("ConvertableFromService", () => {
    const base64Messages: Array<[TunnelMessage, string]> = [
      [
        new TunnelConnectionConnectedMessage("a", "b", "c"),
        "WQAAAJMK2VR7IlR5cGUiOjEwLCJDb25uZWN0aW9uSWQiOiJhIiwiVXNlcklkIjoiYiIsIlJlY29ubmVjdGlvblRva2VuIjoiYyIsIlRyYWNpbmdJZCI6bnVsbH3A",
      ],
      [
        new TunnelConnectionConnectedMessage("a", undefined, "b"),
        "WgAAAJMK2VV7IlR5cGUiOjEwLCJDb25uZWN0aW9uSWQiOiJhIiwiVXNlcklkIjpudWxsLCJSZWNvbm5lY3Rpb25Ub2tlbiI6ImIiLCJUcmFjaW5nSWQiOm51bGx9wA==",
      ],
      [
        new TunnelConnectionConnectedMessage("a", "b"),
        "WgAAAJMK2VV7IlR5cGUiOjEwLCJDb25uZWN0aW9uSWQiOiJhIiwiVXNlcklkIjoiYiIsIlJlY29ubmVjdGlvblRva2VuIjpudWxsLCJUcmFjaW5nSWQiOm51bGx9wA==",
      ],
      [
        new TunnelConnectionRebalanceMessage("a", "b", "c"),
        "TAAAAJMI2Ud7IlR5cGUiOjgsIlRhcmdldElkIjoiYSIsIkVuZHBvaW50IjoiYiIsIk1lc3NhZ2UiOiJjIiwiVHJhY2luZ0lkIjpudWxsfcA=",
      ],
      [
        new TunnelConnectionReconnectMessage("a", "b", "c"),
        "TAAAAJMG2Ud7IlR5cGUiOjYsIlRhcmdldElkIjoiYSIsIkVuZHBvaW50IjoiYiIsIk1lc3NhZ2UiOiJjIiwiVHJhY2luZ0lkIjpudWxsfcA=",
      ],
      [
        new TunnelServiceStatusMessage("a"),
        "LgAAAJMF2Sl7IlR5cGUiOjUsIk1lc3NhZ2UiOiJhIiwiVHJhY2luZ0lkIjpudWxsfcA=",
      ],
      [
        new TunnelConnectionCloseMessage("a"),
        "LgAAAJMH2Sl7IlR5cGUiOjcsIk1lc3NhZ2UiOiJhIiwiVHJhY2luZ0lkIjpudWxsfcA=",
      ],
      [
        new TunnelHttpRequestMessage(1, true, "a", "HEAD", "a", { a: ["b"] }, utf8Encode("Hello")),
        "igAAAJMB2X97IlR5cGUiOjEsIkFja0lkIjoxLCJIdHRwTWV0aG9kIjoiSEVBRCIsIlVybCI6ImEiLCJIZWFkZXJzIjp7ImEiOlsiYiJdfSwiTG9jYWxSb3V0aW5nIjp0cnVlLCJDaGFubmVsTmFtZSI6ImEiLCJUcmFjaW5nSWQiOm51bGx9xAVIZWxsbw==",
      ],
      [
        new TunnelHttpResponseMessage(1, true, 200, "a", { a: ["b"] }, utf8Encode("Hello")),
        "fQAAAJMC2XJ7IlR5cGUiOjIsIkFja0lkIjoxLCJTdGF0dXNDb2RlIjoyMDAsIkhlYWRlcnMiOnsiYSI6WyJiIl19LCJMb2NhbFJvdXRpbmciOnRydWUsIkNoYW5uZWxOYW1lIjoiYSIsIlRyYWNpbmdJZCI6bnVsbH3EBUhlbGxv",
      ],
    ];

    base64Messages.forEach((item) => {
      const binaryString = atob(item[1]);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const msg = TunnelMessageProtocol.instance.parseMessage(bytes);
      normalizeAndAssertEqual(msg, item[0]);
    });
  });
});

function testCore<T extends TunnelMessage>(message: T): T {
  const bytes = TunnelMessageProtocol.instance.getBytes(message);
  console.debug(`(new ${message.constructor.name}(), "${base64String(bytes)}"),`);
  const msg = TunnelMessageProtocol.instance.parseMessage(bytes);
  expect(msg).toBeDefined();
  expect(msg!.Type).toEqual(message.Type);
  return msg as T;
}

function base64String(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function utf8Encode(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

function normalizeAndAssertEqual(msg: any, expected: any) {
  expect(msg.Type).toEqual(expected.Type);
  for (const key in msg) {
    if (msg.hasOwnProperty(key)) {
      if (msg[key] === null) {
        delete msg[key];
      }
    }
  }

  expect(msg).toEqual(expected);
}
