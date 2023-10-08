import { Socket, io } from "socket.io-client";
import { ConnectionStatus, DataModel } from "../models";
import { IDataFetcher } from "./IDataFetcher";
import * as signalR from "@microsoft/signalr";

abstract class ConnectionBasedDataFether implements IDataFetcher {
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
    serviceConfiguration: { loaded: false, resourceName: ""},
    trafficHistory: [],
    logs: [],
  };

  abstract createConnection(): Promise<signalR.HubConnection | Socket>;
  abstract startConnection(connection: signalR.HubConnection | Socket): Promise<void>;
  abstract invoke(connection: signalR.HubConnection | Socket, method: string): Promise<any>;
  constructor(private setData: (model: DataModel) => void) {
    this._start();
  }

  private async _start() {
    const newConnection = await this.createConnection();

    newConnection.on("updateLogs", (logs) => {
      this.model = { ...this.model, logs: [...this.model.logs, ...logs] };
      this.setData(this.model);
    });

    newConnection.on("reportLiveTraceUrl", (url) => {
      this.model = { ...this.model, liveTraceUrl: url };
      this.setData(this.model);
    });

    newConnection.on("reportServiceEndpoint", (url) => {
      this.model = { ...this.model, endpoint: url };
      this.setData(this.model);
    });
    newConnection.on("reportLocalServerUrl", (url) => {
      this.model = { ...this.model, upstreamServerUrl: url };
      this.setData(this.model);
    });
    newConnection.on("reportStatusChange", (status) => {
      this.model = { ...this.model, tunnelConnectionStatus: status };
      this.setData(this.model);
    });
    newConnection.on("reportTunnelToLocalServerStatus", (status) => {
      this.model = { ...this.model, tunnelServerStatus: status };
      this.setData(this.model);
    });

    newConnection.on("reportServiceConfiguration", (config) => {
      this.model = { ...this.model, serviceConfiguration: config };
      this.setData(this.model);
    });

    newConnection.on("addTraffic", (item) => {
      const currentItems = [item, ...this.model.trafficHistory];
      this.model = { ...this.model, trafficHistory: currentItems };
      this.setData(this.model);
    });

    newConnection.on("updateTraffic", (item) => {
      let currentItems = this.model.trafficHistory.map((i) => {
        if (i.id === item.id) {
          return item;
        }
        return i;
      });
      this.model = { ...this.model, trafficHistory: currentItems };
      this.setData(this.model);
    });

    await this.startConnection(newConnection);

    const serverModel = await this.invoke(newConnection, "getCurrentModel");
    setInterval(async () => {
      const clientUrl = await this.invoke(newConnection, "getClientAccessUrl");
      this.model = { ...this.model, clientUrl };
      this.setData(this.model);
    }, 3000 * 1000);
    this.model = {
      ...this.model,
      logs: serverModel.logs,
      trafficHistory: serverModel.trafficHistory,
      ...serverModel.state,
      ready: true,
    };
    this.setData(this.model);
  }
}

export class SignalRDataFetcher extends ConnectionBasedDataFether {
  async createConnection(): Promise<signalR.HubConnection | Socket> {
    return new signalR.HubConnectionBuilder().withUrl("/dataHub").withAutomaticReconnect().build();
  }
  async startConnection(connection: signalR.HubConnection | Socket): Promise<void> {
    try {
      await (connection as signalR.HubConnection).start();
      console.log(`SignalR connection established.`);
    } catch (err) {
      console.log("SignalR connection failed: " + err);
    }
  }
  async invoke(connection: signalR.HubConnection | Socket, method: string): Promise<any> {
    return (connection as signalR.HubConnection).invoke(method);
  }
}

export class SocketIODataFetcher extends ConnectionBasedDataFether {
  async createConnection(): Promise<signalR.HubConnection | Socket> {
    return io();
  }
  async startConnection(_: signalR.HubConnection | Socket): Promise<void> {
    console.log("SocketIO connection established.");
  }
  async invoke(connection: signalR.HubConnection | Socket, method: string): Promise<any> {
    return (connection as Socket).emitWithAck(method);
  }
}

