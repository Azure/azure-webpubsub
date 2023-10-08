import { Socket, io } from "socket.io-client";
import { ConnectionStatus, ConnectionStatusPairs, DataModel } from "../models";
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
    tunnelServerStatus: ConnectionStatusPairs.None,
    serviceConfiguration: { loaded: false, resourceName: "" },
    trafficHistory: [],
    logs: [],
  };

  protected abstract _createConnection(): Promise<signalR.HubConnection | Socket>;
  protected abstract _startConnection(connection: signalR.HubConnection | Socket): Promise<void>;
  protected abstract _invoke(connection: signalR.HubConnection | Socket, method: string, ...args: any[]): Promise<any>;
  constructor(private setData: (model: DataModel) => void) {
    this._start();
  }

  public invoke(method: string, ...args: any[]) {
    if (!this._connection) {
      throw new Error("Tunnel connection is not yet ready.");
    }
    return this._invoke(this._connection, method, ...args);
  }

  private _connection: signalR.HubConnection | Socket | undefined;
  private async _start() {
    const newConnection = (this._connection = await this._createConnection());

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

    await this._startConnection(newConnection);

    const serverModel = await this._invoke(newConnection, "getCurrentModel");
    setInterval(async () => {
      const clientUrl = await this._invoke(newConnection, "getClientAccessUrl");
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
  async _createConnection(): Promise<signalR.HubConnection | Socket> {
    return new signalR.HubConnectionBuilder().withUrl("/dataHub").withAutomaticReconnect().build();
  }
  async _startConnection(connection: signalR.HubConnection | Socket): Promise<void> {
    try {
      await (connection as signalR.HubConnection).start();
      console.log(`SignalR connection established.`);
    } catch (err) {
      console.log("SignalR connection failed: " + err);
    }
  }
  async _invoke(connection: signalR.HubConnection | Socket, method: string, ...args: any[]): Promise<any> {
    return (connection as signalR.HubConnection).invoke(method, ...args);
  }
}

export class SocketIODataFetcher extends ConnectionBasedDataFether {
  async _createConnection(): Promise<signalR.HubConnection | Socket> {
    return io();
  }
  async _startConnection(_: signalR.HubConnection | Socket): Promise<void> {
    console.log("SocketIO connection established.");
  }
  async _invoke(connection: signalR.HubConnection | Socket, method: string, ...args: any[]): Promise<any> {
    return (connection as Socket).emitWithAck(method, ...args);
  }
}
