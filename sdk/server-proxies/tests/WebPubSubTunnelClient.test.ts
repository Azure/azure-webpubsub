import { AzureKeyCredential } from "@azure/core-auth";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { WebPubSubTunnelClient } from "../src/tunnels/WebPubSubTunnelClient";

jest.mock("@azure/web-pubsub-client", () => ({
  WebPubSubClient: jest.fn(() => ({
    _getWebSocketClientFactory: jest.fn(() => ({
      create: jest.fn(),
    })),
    on: jest.fn(),
  })),
}));

describe("WebPubSubTunnelClient", () => {
  it("disables Web PubSub protocol keepalive", () => {
    new WebPubSubTunnelClient(
      {
        endpoint: new URL("https://example.webpubsub.azure.com/client/hubs/test"),
        reverseProxyEndpoint: undefined,
      },
      new AzureKeyCredential("key"),
      "user",
    );

    expect(WebPubSubClient).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        autoReconnect: true,
        keepAliveIntervalInMs: 0,
        keepAliveTimeoutInMs: 0,
      }),
    );
  });
});
