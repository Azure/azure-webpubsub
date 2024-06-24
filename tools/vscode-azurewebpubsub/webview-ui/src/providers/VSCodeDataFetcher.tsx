// import { Socket, io } from "socket.io-client";
import { stringify } from "querystring";
import { ConnectionStatus, ConnectionStatusPairs, DataModel } from "../models";
import { vscode } from "../utilities/vscode";
import { IDataFetcher } from "./IDataFetcher";

// Behave like a soccket.io client Socket
class VSCodeVirtualSocket {
  public socketId?: string;
  public ackId = 0;
  public listeners: { [commandName: string]: (data: any) => void } = {};

  constructor() {
    let previousState = vscode.getState() || {};
    let previousSocketCount = (previousState as any)["socketCount"];
    console.log(`ctor, previousState: ${JSON.stringify(previousState)}`);

    this.socketId = previousSocketCount ? (previousSocketCount + 1) : 1;

    vscode.setState({ ...(previousState as any), socketCount: this.socketId });
  }

  /**
   * Send a message { method, ...args } to host VSCode Extension
   * @param method 
   * @param args 
   */
  public emit(method: string, ...args: any[]) {
    console.log(`Socket ${this.socketId} emit ${method} with args: ${JSON.stringify(args)}`);
    vscode.postMessage({ method, args });
  }

  /**
   * Send a message { method, ...args } to host VSCode Extension and wait for an ack
   * @param method 
   * @param args 
   * @returns the payload in the ack message
   */
  public emitWithAck(method: string, ...args: any[]): Promise<unknown> {
    console.log(`Socket ${this.socketId} emitWithAck ${method} with args: ${JSON.stringify(args)}, previous ackId: ${this.ackId}`);

    this.ackId++;
    const promise = new Promise((resolve, reject) => {
      const eventName = `ack-${this.ackId}`;
      this.on(eventName, (payload: any) => {
        resolve(payload);
      });
    });
    this.emit(`$ackable-${method}`, args);
    return promise;
  }

  /**
   * Register a callback for when the WebView receives a specific event from host VSCode Extension
   * @param eventName 
   * @param callback 
   */
  public on(eventName: string, callback: (payload: any) => void) {
    const methodName = `socket-${this.socketId}-event-${eventName}`;
    this.listeners[methodName] = (event: any) => {
      const data = event.data;
      const methodInReq = data["method"];
      const payloadInReq = data["payload"];
      if (methodInReq === methodName) {
        callback(payloadInReq);
      }
    };
    // Note: "message" is a fixed event name in VSCode Webview, do not change it.
    window.addEventListener("message", this.listeners[methodName]);
  }

  /**
   * Close the virtual connection betweeen WebView and host VSCode Extension
   */
  public close() {
    for (const key in this.listeners) {
      window.removeEventListener("message", this.listeners[key]);
    }
  }
}

export class VSCodeBasedDataFetcher implements IDataFetcher {
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

  protected _createConnection(): Promise<VSCodeVirtualSocket> {
    return Promise.resolve(new VSCodeVirtualSocket());
  }

  protected _startConnection(connection: VSCodeVirtualSocket): Promise<void> {
    console.log("VSCode connection established.");
    return Promise.resolve();
  }

  protected _invoke(connection: VSCodeVirtualSocket, method: string, ...args: any[]): Promise<any> {
      return connection.emitWithAck(method, ...args);
  }

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

  private _connection: VSCodeVirtualSocket | undefined;
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
