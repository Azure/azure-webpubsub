import { Socket, io } from "socket.io-client";
import { ConnectionStatus, ConnectionStatusPairs, DataModel } from "../models";
import { IDataFetcher } from "./IDataFetcher";

abstract class ConnectionBasedDataFether implements IDataFetcher {
  public model: DataModel = {
    ready: false,
    endpoint: "",
    hub: "",
    liveTraceUrl: "",
    upstreamServerUrl: "",
    tunnelConnectionStatus: ConnectionStatus.None,
    tunnelServerStatus: ConnectionStatusPairs.None,
    serviceConfiguration: { loaded: false, resourceName: "" },
    builtinUpstreamServerStarted: false,
    trafficHistory: [],
    logs: [],
  };

  protected abstract _createConnection(): Promise<Socket>;
  protected abstract _startConnection(connection: Socket): Promise<void>;
  protected abstract _invoke(connection: Socket, method: string, ...args: any[]): Promise<any>;
  constructor(private setData: (model: DataModel) => void) {
    this._start().catch((e) => {
      this._connectionStartedTcs.reject(e);
      throw e;
    });
  }

  public async invoke(method: string, ...args: any[]) {
    await this._connectionStartedTcs.promise;
    if (!this._connection){
      // defense code, should not happen
      throw new Error("Connection is not established.");
    }
    return await this._invoke(this._connection, method, ...args);
  }

  private _connection: Socket | undefined;
  private _connectionStartedTcs = new TaskCompletionSource<void>();
  
  private async _start() {
    const newConnection = this._connection = await this._createConnection();

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
    newConnection.on("reportBuiltinUpstreamServerStarted", (status) => {
      this.model = { ...this.model, builtinUpstreamServerStarted: status };
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

    newConnection.on("clearTraffic", () => {
      this.model = { ...this.model, trafficHistory: [] };
      this.setData(this.model);
    });
    await this._startConnection(newConnection);
    // add a tcs for connection started
    this._connectionStartedTcs.resolve();
    const serverModel = await this._invoke(newConnection, "getCurrentModel");
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

export class SocketIODataFetcher extends ConnectionBasedDataFether {
  async _createConnection(): Promise<Socket> {
    return io();
  }
  async _startConnection(_: Socket): Promise<void> {
    console.log("SocketIO connection established.");
  }
  async _invoke(connection: Socket, method: string, ...args: any[]): Promise<any> {
    return (connection as Socket).emitWithAck(method, ...args);
  }
}

class TaskCompletionSource<T> {
  private _promise: Promise<T>;
  private _resolve: ((value: T | PromiseLike<T>) => void) | undefined = undefined ;
  private _reject: ((reason: any) => void) | undefined = undefined;

  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  get promise(): Promise<T> {
    return this._promise;
  }

  resolve(value: T | PromiseLike<T>): void {
    if (this._resolve) {
      this._resolve(value);
      this._resolve = undefined;
      this._reject = undefined;
    }
  }

  reject(reason?: any): void {
    if (this._reject) {
      this._reject(reason);
      this._resolve = undefined;
      this._reject = undefined;
    }
  }
}
