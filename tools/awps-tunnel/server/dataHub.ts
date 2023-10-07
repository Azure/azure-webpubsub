// a command tool accepting parameters
// host the website
// start the server connection
import { Server, Socket } from "socket.io";
import { ConnectionStatus, ConnectionStatusPair, HttpHistoryItem, ConnectionStatusPairs } from "../client/src/models";
import http from "http";
import { HttpServerProxy } from "./serverProxies";
import { DataRepo } from "./dataRepo";

// singleton per hub?
export class DataHub {
  public tunnelConnectionStatus = ConnectionStatus.Connecting;
  public tunnelServerStatus = ConnectionStatusPairs.Disconnected;
  public livetraceUrl = "";
  public clientUrl = "";
  public endpoint = "";
  public upstreamServerUrl = "";
  public hub = "";
  private io: Server;
  private repo: DataRepo;
  constructor(server: http.Server, private tunnel: HttpServerProxy, upstreamUrl: string, dbFile: string) {
    const io = (this.io = new Server(server));
    this.repo = new DataRepo(dbFile);
    this.endpoint = tunnel.endpoint;
    this.hub = tunnel.hub;
    this.upstreamServerUrl = upstreamUrl;
    // Socket.io event handling
    io.on("connection", (socket: Socket) => {
      console.log("A Socketio client connected");

      socket.on("getCurrentModel", async (callback) => {
        callback({
          ready: true,
          state: {
            endpoint: this.endpoint,
            hub: this.hub,
            clientUrl: await this.GetClientAccessUrl(),
            liveTraceUrl: await this.GetLiveTraceUrl(),
            upstreamServerUrl: this.upstreamServerUrl,
            tunnelConnectionStatus: this.tunnelConnectionStatus,
            tunnelServerStatus: this.tunnelServerStatus,
          },
          trafficHistory: await this.getHttpHistory(),
          logs: [],
        });
        socket.on("getClientAccessUrl", async (callback) => {
          const url = await this.GetClientAccessUrl();
          callback(url);
        });
      });

      socket.on("disconnect", () => {
        console.log("A Socketio client disconnected");
      });
    });
  }

  async GetClientAccessUrl(): Promise<string> {
    const url = (this.clientUrl = await this.tunnel.getClientAccessUrl());
    return url;
  }

  async GetLiveTraceUrl(): Promise<string> {
    const url = (this.livetraceUrl = await this.tunnel.getLiveTraceUrl());
    return url;
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
    await this.repo.updateDataAsync({
      Request: {
        TracingId: item.tracingId,
        RequestAt: item.requestAtOffset,
        MethodName: item.methodName,
        Url: item.url,
        RequestRaw: item.requestRaw,
      },
      Response: {
        Code: item.code,
        ResponseRaw: item.responseRaw,
        RespondAt: item.responseAtOffset,
      },
    });
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
