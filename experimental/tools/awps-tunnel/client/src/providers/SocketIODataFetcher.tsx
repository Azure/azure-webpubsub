import { ConnectionStatus, HttpHistoryItem, DataModel } from "../models";
import { IDataFetcher } from "./IDataFetcher";
import { io } from "socket.io-client";
function loadTrafficHistory() {
  const trafficHistory = localStorage.getItem("trafficHistory");
  if (trafficHistory) {
    return JSON.parse(trafficHistory);
  }
  return [];
}
function updateTrafficHistory(items: HttpHistoryItem[]) {
  localStorage.setItem("trafficHistory", JSON.stringify(items));
}

export class SocketIODataFetcher implements IDataFetcher {
  // load data from local storage
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
    trafficHistory: loadTrafficHistory(),
    logs: [],
  };

  constructor(private onModelUpdate: (model: DataModel) => void) {
    this._startConnection();
  }

  async _startConnection() {
    const newConnection = io();

    newConnection.on("updateLogs", (logs) => {
      console.log(logs);
      this.model.logs = [...this.model.logs, ...logs];
      this.onModelUpdate(this.model);
    });

    newConnection.on("reportLiveTraceUrl", (url) => {
      console.log(url);
      this.model.liveTraceUrl = url;
      this.onModelUpdate(this.model);
    });

    newConnection.on("reportServiceEndpoint", (url) => {
      console.log(url);
      this.model.endpoint = url;
    });
    newConnection.on("reportLocalServerUrl", (url) => {
      console.log(url);
      this.model.upstreamServerUrl = url;
      this.onModelUpdate(this.model);
    });
    newConnection.on("reportStatusChange", (status) => {
      console.log(status);
      this.model.tunnelConnectionStatus = status;
      this.onModelUpdate(this.model);
    });
    newConnection.on("reportTunnelToLocalServerStatus", (status) => {
      console.log(status);
      this.model.tunnelServerStatus = status;
      this.onModelUpdate(this.model);
    });
    newConnection.on("updateTraffics", (items) => {
      console.log(items);
      // only takes 50 items;
      const currentItems = [...items, ...this.model.trafficHistory].slice(0, 50);
      updateTrafficHistory(currentItems);
      this.model.trafficHistory = currentItems;
      this.onModelUpdate(this.model);
    });

    console.log("SocketIO connection established.");
    const serverModel = await newConnection.emitWithAck("getCurrentModel");
    setInterval(async () => {
      this.model.clientUrl = await newConnection.emitWithAck("getClientAccessUrl");
      this.onModelUpdate(this.model);
    }, 10 * 1000);
    this.model = {
      ...this.model,
      logs: serverModel.logs,
      ...serverModel.state,
      ready: true,
    };
    this.onModelUpdate(this.model);
  }
}
