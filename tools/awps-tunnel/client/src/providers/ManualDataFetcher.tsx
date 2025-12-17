import { ConnectionStatus, ConnectionStatusPairs, DataModel, RESTApi } from "../models";
import { loadApiSpec } from "../utils";
import { IDataFetcher } from "./IDataFetcher";

const MANUAL_URL_STORAGE_KEY = "awps.manualClientUrl";

export class ManualDataFetcher implements IDataFetcher {
  public kind = "manual" as const;
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
    apiSpec: {} as RESTApi,
  };

  private _clientUrl: string = "";

  constructor(private onModelUpdate: (model: DataModel) => void) {
    this._init();
  }

  async invoke(method: string, ...args: any[]): Promise<any> {
    switch (method) {
      case "getClientAccessUrl":
        return this._clientUrl;
      case "setClientAccessUrl": {
        const updated = (args[0] as string | undefined)?.trim() ?? "";
        this._clientUrl = updated;
        this._persistUrl(updated);
        return this._clientUrl;
      }
      case "clearTrafficHistory":
        this.model = { ...this.model, trafficHistory: [] };
        this.onModelUpdate(this.model);
        return;
      default:
        return undefined;
    }
  }

  private async _init(): Promise<void> {
    this._clientUrl = this._loadStoredUrl();
    const apiSpec = await loadApiSpec();
    this.model = { ...this.model, apiSpec, ready: true };
    this.onModelUpdate(this.model);
  }

  private _loadStoredUrl(): string {
    try {
      return localStorage.getItem(MANUAL_URL_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  }

  private _persistUrl(url: string): void {
    try {
      localStorage.setItem(MANUAL_URL_STORAGE_KEY, url);
    } catch {
      // best-effort persistence
    }
  }
}
