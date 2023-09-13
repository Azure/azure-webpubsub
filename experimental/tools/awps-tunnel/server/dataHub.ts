// a command tool accepting parameters
// host the website
// start the server connection
import { Server, Socket } from "socket.io";
import { ConnectionStatus, ConnectionStatusPair, HttpHistoryItem, ConnectionStatusPairs } from "../client/src/models";
import http from "http";
import { HttpServerProxy } from "./serverProxies";
import { TokenCredential, AzureKeyCredential, isTokenCredential } from "@azure/core-auth";
import jwt from "jsonwebtoken";

export class DataHub {
  public static tunnelConnectionStatus = ConnectionStatus.Connecting;
  public static tunnelServerStatus = ConnectionStatusPairs.Disconnected;
  public static trafficHistory: HttpHistoryItem[] = [];
  public static livetraceUrl = "";
  public static clientUrl = "";
  public static endpoint = "";
  public static upstreamServerUrl = "";
  public static hub = "";

  private io: Server;
  constructor(server: http.Server, private tunnel: HttpServerProxy, upstreamUrl: string) {
    const io = (this.io = new Server(server));
    DataHub.endpoint = tunnel.endpoint;
    DataHub.hub = tunnel.hub;
    DataHub.upstreamServerUrl = upstreamUrl;
    // Socket.io event handling
    io.on("connection", (socket: Socket) => {
      console.log("A Socketio client connected");

      socket.on("getCurrentModel", async (callback) => {
        callback({
          ready: true,
          state: {
            endpoint: DataHub.endpoint,
            hub: DataHub.hub,
            clientUrl: await this.GetClientAccessUrl(),
            liveTraceUrl: await this.GetLiveTraceUrl(),
            upstreamServerUrl: DataHub.upstreamServerUrl,
            tunnelConnectionStatus: DataHub.tunnelConnectionStatus,
            tunnelServerStatus: DataHub.tunnelServerStatus,
          },
          trafficHistory: DataHub.trafficHistory,
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

  async GetClientAccessUrl(): Promise<string>{
    const url = DataHub.clientUrl = await this.tunnel.getClientAccessUrl();
    return url;
  }

  async GetLiveTraceUrl(): Promise<string>{
    const url = DataHub.livetraceUrl = await this.tunnel.getLiveTraceUrl();
    return url;
  }

  UpdateTraffics(trafficHistory: HttpHistoryItem[]) {
    DataHub.trafficHistory.push(...trafficHistory);
    this.io.emit("updateTraffics", trafficHistory);
  }
  UpdateLogs(logs: string[]) {
    this.io.emit("updateLogs", logs);
  }
  ReportLiveTraceUrl(url: string) {
    DataHub.livetraceUrl = url;
    this.io.emit("reportLiveTraceUrl", url);
  }
  ReportServiceEndpoint(url: string) {
    DataHub.endpoint = url;
    this.io.emit("reportServiceEndpoint", url);
  }
  ReportLocalServerUrl(url: string) {
    DataHub.upstreamServerUrl = url;
    this.io.emit("reportLocalServerUrl", url);
  }
  ReportStatusChange(status: ConnectionStatus) {
    DataHub.tunnelConnectionStatus = status;
    this.io.emit("reportStatusChange", status);
  }
  ReportTunnelToLocalServerStatus(status: ConnectionStatusPair) {
    DataHub.tunnelServerStatus = status;
    this.io.emit("reportTunnelToLocalServerStatus", status);
  }
}