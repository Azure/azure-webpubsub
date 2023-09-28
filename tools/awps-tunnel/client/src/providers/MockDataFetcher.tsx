import { ConnectionStatus, LogLevel, HttpHistoryItem, DataModel } from "../models";
import { IDataFetcher } from "./IDataFetcher";

export class MockDataFetcher implements IDataFetcher {
  public model: DataModel = {
    ready: false,
    endpoint: "",
    hub: "",
    clientUrl: "",
    liveTraceUrl: "",
    upstreamServerUrl: "",
    tunnelConnectionStatus: ConnectionStatus.Connected,
    tunnelServerStatus: {
      statusIn: ConnectionStatus.Connected,
      statusOut: ConnectionStatus.Connected,
    },
    trafficHistory: [],
    logs: [],
  };
  constructor(private onModelUpdate: (model: DataModel) => void) {
    this.fetch().then((s) => {
      this._updateModel(s);
    });
    setInterval(() => this._updateModel(this.model), 5000);
  }

  fetch(): Promise<DataModel> {
    const current = {
      ready: true,
      clientUrl: "ws://abc/client",
      liveTraceUrl: "https://xxx.webpubsub.azure.com",
      endpoint: "https://xxx.webpubsub.azure.com",
      upstreamServerUrl: "http://localhost:3000",
      tunnelConnectionStatus: ConnectionStatus.Connected,
      tunnelServerStatus: {
        statusIn: ConnectionStatus.Connected,
        statusOut: ConnectionStatus.Connected,
      },
      hub: "chat",
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
Content-Type: text/plain; charset=utf-8

Hello`,
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
