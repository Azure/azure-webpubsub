import { ConnectionStatus, LogLevel, HttpHistoryItem, DataModel } from "./models";
import { IDataFetcher } from "./IDataFetcher";
import * as signalR from "@microsoft/signalr";

export class SignalRDataFetcher implements IDataFetcher {
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
    this.fetch().then((model) => this._updateModel({ ...model, ready: true }));
  }

  fetch(): Promise<DataModel> {
    return this._startConnection();
  }

  async _startConnection() {
    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl("/dataHub")
      .withAutomaticReconnect()
      .build();

    newConnection.on("UpdateLogs", (logs) => {
      console.log(logs);
      this._updateModel({ ...this.model, logs: [...this.model.logs, ...logs] });
    });

    newConnection.on("UpdateState", (state) => {
      console.log(state);
      this._updateModel({ ...this.model, ...state });
    });

    newConnection.on("UpdateTraffics", (items) => {
      console.log(items);

      this._updateModel({
        ...this.model,
        trafficHistory: [...items, ...this.model.trafficHistory],
      });
    });

    console.log("SignalR connection established.");
    try {
      await newConnection.start();
    } catch (err) {
      console.log("SignalR connection failed: " + err);
    }
    const serverModel = await newConnection.invoke("GetCurrentModel");
    return {
      logs: serverModel.logs,
      trafficHistory: serverModel.trafficHistory,
      ...serverModel.state,
    };
  }

  _updateModel(current: DataModel): void {
    console.log(current);
    this.model = current;
    this.onModelUpdate(this.model);
  }
}
