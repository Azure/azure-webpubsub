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
    tunnelConnectionStatus: ConnectionStatus.Connecting,
    tunnelServerStatus: {
      statusIn: ConnectionStatus.Disconnected,
      statusOut: ConnectionStatus.Disconnected,
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
      liveTraceUrl: "https://www.google.com",
      endpoint: "https://www.service.com",
      upstreamServerUrl: "https://www.server.com",
      tunnelConnectionStatus: ConnectionStatus.Connected,
      tunnelServerStatus: {
        statusIn: ConnectionStatus.Disconnected,
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
    methodName: "GET",
    url: "https://www.google.com",
    requestRaw: "ABC",
    responseRaw: "DEF",
    unread: true,
    id: id++,
  };
}
