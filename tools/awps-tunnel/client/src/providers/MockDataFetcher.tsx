import { ConnectionStatus, LogLevel, HttpHistoryItem, DataModel, SystemEvent, ConnectionStatusPairs } from "../models";
import { IDataFetcher } from "./IDataFetcher";

export class MockDataFetcher implements IDataFetcher {
  public model: DataModel = {
    ready: false,
    endpoint: "",
    hub: "",
    liveTraceUrl: "",
    upstreamServerUrl: "",
    tunnelConnectionStatus: ConnectionStatus.Connected,
    tunnelServerStatus: {
      statusIn: ConnectionStatus.Connected,
      statusOut: ConnectionStatus.Connected,
    },
    serviceConfiguration: { loaded: false, resourceName: "abc" },
    builtinUpstreamServerStarted: false,
    trafficHistory: [],
    logs: [],
  };
  constructor(private onModelUpdate: (model: DataModel) => void) {
    this.fetch().then((s) => {
      this._updateModel(s);
    });
    setInterval(() => this._updateModel(this.model), 5000);
  }
  async invoke(method: string, ...args: any[]): Promise<any> {
    if (method === "clearTrafficHistory") {
      this.model = { ...this.model, trafficHistory: [] };
      this.onModelUpdate(this.model);
      return;
    }

    if (method === "getClientAccessUrl") {
      console.log(args);
      return "wss://mock-free.webpubsub.azure.com/client/hubs/mock";
    }
    await delay(1000);
    return { success: true, message: method };
  }
  fetch(): Promise<DataModel> {
    const current = {
      ready: true,
      clientUrl: "wss://mock-free.webpubsub.azure.com/client/hubs/mock",
      liveTraceUrl: "https://xxx.webpubsub.azure.com",
      endpoint: "https://mock-free.webpubsub.azure.com",
      upstreamServerUrl: "http://localhost:3000",
      tunnelConnectionStatus: ConnectionStatus.Connected,
      tunnelServerStatus: ConnectionStatusPairs.Connected,
      builtinUpstreamServerStarted: true,
      hub: "mock",
      serviceConfiguration: {
        loaded: true,
        message: "Not configured",
        resourceName: "b",
        eventHandlers: [
          {
            systemEvents: [SystemEvent.Connect, SystemEvent.Disconnected],
            urlTemplate: "http://localhost:3000/eventhandler",
            userEventPattern: "*",
          },
          {
            systemEvents: [SystemEvent.Connect, SystemEvent.Disconnected],
            urlTemplate: "http://localhost:3000/eventhandler",
            userEventPattern: "*",
          },
        ],
      },
      trafficHistory: [generateMockHttpItem()],
      logs: [
        {
          level: LogLevel.Info,
          message: "This is a log message",
          time: new Date(),
        },
      ],
    };
    return new Promise((resolve, reject) => {
      resolve(current);
    });
  }

  _updateModel(current: DataModel): void {
    const item = generateMockHttpItem();
    this.model = { ...current, trafficHistory: [item, ...current.trafficHistory] };
    this.onModelUpdate(this.model);
  }
}

let id = 0;

export function generateMockHttpItem(): HttpHistoryItem {
  return {
    requestAtOffset: Date.now(),
    code: 200,
    methodName: "POST",
    url: "http://localhost:3000/eventhandler",
    requestRaw: `POST http://localhost:3000/eventhandler HTTP/1.1
ce-specversion: 1.0
ce-awpsversion: 1.0
ce-type: azure.webpubsub.user.message
ce-source: /hubs/chat/client/xxx
ce-time: 2023-09-28T01:46:50Z
ce-connectionId: xxx
ce-hub: chat
ce-eventName: message
WebHook-Request-Origin: xxx.webpubsub.azure.com
ce-signature: sha256=xxx
ce-signature: sha256=xxx
ce-id: 2
Content-Type: application/json

{"claims":{},"query":{"id":"aaa"},"headers":{"Connection":["Upgrade"],"Host":["lianwei-preserve.webpubsub.azure.com"],"User-Agent":["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0"],"Accept-Encoding":["gzip, deflate, br, zstd"],"Accept-Language":["en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7"],"Cache-Control":["no-cache"],"Origin":["http://127.0.0.1:8080"],"Pragma":["no-cache"],"traceparent":["00-be2b36b7e46e36dd9baf3d5ad1bfd3ba-5875cb9fb1aef1c0-01"],"tracestate":[""],"Upgrade":["websocket"],"x-request-id":["64b1f8c8061b371cca71fb399d7b8002"],"x-real-ip":["2404:f801:9000:18:6fec:f611"],"x-forwarded-for":["2404:f801:9000:18:6fec:f611"],"x-forwarded-host":["lianwei-preserve.webpubsub.azure.com"],"x-forwarded-port":["443"],"x-forwarded-proto":["https"],"x-scheme":["https"],"Sec-WebSocket-Version":["13"],"Sec-WebSocket-Key":["EYJSkky1qtlq3porGJD6Q=="],"Sec-WebSocket-Extensions":["permessage-deflate; client_max_window_bits"],"subprotocols":[],"clientCertificates":[]}}`,
    responseRaw: `HTTP/1.1 200
x-powered-by: Express
content-type: text/plain; charset=utf-8
date: Thu, 28 Sep 2023 01:46:50 GMT
connection: close
content-length: 9

Hey Hello`,
    unread: true,
    id: id++,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}