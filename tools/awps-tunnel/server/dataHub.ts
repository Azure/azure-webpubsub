// a command tool accepting parameters
// host the website
// start the server connection
import { Server, Socket } from "socket.io";
import { ConnectionStatus, ConnectionStatusPair, HttpHistoryItem, ConnectionStatusPairs, ServiceConfiguration } from "../client/src/models";
import http from "http";
import { HttpServerProxy } from "./serverProxies";
import { DataRepo } from "./dataRepo";
import { startUpstreamServer } from "./upstream";
import { printer } from "./output";

// singleton per hub?
export class DataHub {
  // make sure only one server is there
  public static upstreamServer?: http.Server;
  public tunnelConnectionStatus = ConnectionStatus.Connecting;
  public tunnelServerStatus = ConnectionStatusPairs.None;
  public serviceConfiguration?: ServiceConfiguration = undefined;
  public livetraceUrl = "";
  public clientUrl = "";
  public endpoint = "";
  public upstreamServerUrl = "";
  public hub = "";
  private io: Server;
  private repo: DataRepo;
  constructor(server: http.Server, private tunnel: HttpServerProxy, upstreamUrl: URL, dbFile: string) {
    const io = (this.io = new Server(server));
    printer.log("Webview client connecting to get the latest status");
    this.repo = new DataRepo(dbFile);
    this.endpoint = tunnel.endpoint;
    this.livetraceUrl = tunnel.getLiveTraceUrl();
    this.hub = tunnel.hub;
    this.upstreamServerUrl = upstreamUrl.toString();
    // Socket.io event handling
    io.on("connection", (socket: Socket) => {
      printer.log("A webview client connected");

      socket.on("startEmbeddedUpstream", async (callback) => {
        if (DataHub.upstreamServer) {
          const message = "Built-in Echo Server already started";
          printer.status(`[Upstream] ${message}`);
          callback({ success: true, message: message });
          return;
        }
        const url = new URL(upstreamUrl);
        try {
          DataHub.upstreamServer = await startUpstreamServer(Number.parseInt(url.port), tunnel.hub, "/eventHandler");
          this.io.emit("reportBuiltinUpstreamServerStarted", DataHub.upstreamServer !== undefined);
          const message = "Built-in Echo Server started at port " + url.port;
          printer.status(`[Upstream] ${message}`);
          callback({ success: true, message: message });
        } catch (err) {
          const message = `Built-in Echo Server failed to start at port ${url.port}:${err}`;
          this.io.emit("reportBuiltinUpstreamServerStarted", DataHub.upstreamServer !== undefined);
          printer.error(`[Upstream] ${message}`);
          callback({ success: true, message: message });
        }
      });

      socket.on("stopEmbeddedUpstream", (callback) => {
        try {
          DataHub.upstreamServer?.close();
          DataHub.upstreamServer = undefined;
          const message = `Built-in Echo Server successfully stopped`;
          this.io.emit("reportBuiltinUpstreamServerStarted", DataHub.upstreamServer !== undefined);
          printer.status(`[Upstream] ${message}`);
          callback({ success: true, message: message });
        } catch (err) {
          const message = `Built-in Echo Server failed to stop:${err}`;
          this.io.emit("reportBuiltinUpstreamServerStarted", DataHub.upstreamServer !== undefined);
          printer.error(`[Upstream] ${message}`);
          callback({ success: true, message: message });
        }
      });

      socket.on("getCurrentModel", async (callback) => {
        callback({
          ready: true,
          state: {
            endpoint: this.endpoint,
            hub: this.hub,
            clientUrl: await this.GetClientAccessUrl(),
            liveTraceUrl: this.livetraceUrl,
            upstreamServerUrl: this.upstreamServerUrl,
            tunnelConnectionStatus: this.tunnelConnectionStatus,
            tunnelServerStatus: this.tunnelServerStatus,
            serviceConfiguration: this.serviceConfiguration,
            builtinUpstreamServerStarted: DataHub.upstreamServer !== undefined,
          },
          trafficHistory: await this.getHttpHistory(),
          logs: [],
        });
      });

      socket.on("getClientAccessUrl", async (userId: string, roles: string[], groups: string[], callback) => {
        const url = await this.GetClientAccessUrl(userId, roles, groups);
        callback(url);
      });

      socket.on("generateLiveTraceToken", async (callback) => {
        const token = await this.tunnel.getLiveTraceToken();
        callback(token);
      });
      socket.on("disconnect", () => {
        printer.log("A webview client connected");
      });

      socket.on("clearTrafficHistory", async () => {
        await this.repo.clearDataAsync();
        this.io.emit("clearTraffic");
      });
    });
  }

  async GetClientAccessUrl(userId?: string, roles?: string[], groups?: string[]): Promise<string> {
    try {
      const url = (this.clientUrl = await this.tunnel.getClientAccessUrl(userId, roles, groups));
      return url;
    } catch (err) {
      printer.error(`Unable to get client access URL: ${err}`);
      return "";
    }
  }

  async AddTraffic(item: HttpHistoryItem) {
    item.id = await this.repo.insertDataAsync({
      Request: {
        TracingId: item.tracingId,
        RequestAt: item.requestAtOffset,
        MethodName: item.methodName,
        Url: item.url,
        RequestRaw: item.requestRaw,
      },
    });
    this.io.emit("addTraffic", item);
  }

  async UpdateTraffic(item: HttpHistoryItem) {
    if (!item.id) throw new Error("Id shouldn't be undefined when calling update");
    await this.repo.updateDataAsync(
      item.id,
      JSON.stringify({
        Code: item.code,
        ResponseRaw: item.responseRaw,
        RespondAt: item.responseAtOffset,
      }),
    );
    this.io.emit("updateTraffic", item);
  }

  UpdateLogs(logs: string[]) {
    this.io.emit("updateLogs", logs);
  }
  ReportLiveTraceUrl(url: string) {
    this.livetraceUrl = url;
    this.io.emit("reportLiveTraceUrl", url);
  }
  ReportServiceEndpoint(url: string) {
    this.endpoint = url;
    this.io.emit("reportServiceEndpoint", url);
  }
  ReportLocalServerUrl(url: string) {
    this.upstreamServerUrl = url;
    this.io.emit("reportLocalServerUrl", url);
  }
  ReportStatusChange(status: ConnectionStatus) {
    this.tunnelConnectionStatus = status;
    this.io.emit("reportStatusChange", status);
  }
  ReportTunnelToLocalServerStatus(status: ConnectionStatusPair) {
    this.tunnelServerStatus = status;
    this.io.emit("reportTunnelToLocalServerStatus", status);
  }
  ReportServiceConfiguration(config: ServiceConfiguration) {
    this.serviceConfiguration = config;
    this.io.emit("reportServiceConfiguration", config);
  }

  async getHttpHistory(): Promise<HttpHistoryItem[]> {
    const data = await this.repo.getAsync(50);
    const result: HttpHistoryItem[] = [];
    for (const item of data) {
      result.push({
        id: item.Id,
        tracingId: item.Request.TracingId,
        requestAtOffset: item.Request.RequestAt,
        responseAtOffset: item.Response?.RespondAt,
        code: item.Response?.Code,
        methodName: item.Request.MethodName,
        url: item.Request.Url,
        requestRaw: item.Request.RequestRaw,
        responseRaw: item.Response?.ResponseRaw,
        unread: false, //TODO: store in db?
      });
    }

    return result;
  }
}
