// a command tool accepting parameters
// host the website
// start the server connection
import { Server, Socket } from "socket.io";
import { ConnectionStatus, ConnectionStatusPair, HttpHistoryItem, ConnectionStatusPairs } from "../client/src/models";
import http from "http";
import { HttpServerProxy } from "./serverProxies";

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
  constructor(server: http.Server, tunnel: HttpServerProxy, upstreamUrl: string) {
  const io = this.io = new Server(server);
  DataHub.endpoint = tunnel.endpoint;
  DataHub.clientUrl = getClientAccessUrl();
  DataHub.hub = tunnel.hub;
  DataHub.upstreamServerUrl = upstreamUrl;
  DataHub.livetraceUrl = getLiveTraceUrl();
  // Socket.io event handling
  io.on("connection", (socket: Socket) => {
    console.log("A Socketio client connected");

    socket.on("getCurrentModel", (callback) => {
      callback({
        ready: true,
        state: {
          endpoint: DataHub.endpoint,
          hub: DataHub.hub,
          clientUrl: DataHub.clientUrl,
          liveTraceUrl: DataHub.livetraceUrl,
          upstreamServerUrl: DataHub.upstreamServerUrl,
          tunnelConnectionStatus: DataHub.tunnelConnectionStatus,
          tunnelServerStatus: DataHub.tunnelServerStatus,
        },
        trafficHistory: DataHub.trafficHistory,
        logs: [],
      });
      socket.on("getClientAccessUrl", (callback) => {
        const url = DataHub.clientUrl = getClientAccessUrl();
        callback(url);
      });
    });

    socket.on("disconnect", () => {
      console.log("A Socketio client disconnected");
    });
  });
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

function getClientAccessUrl() {
  return "http://ABC";
}

function getLiveTraceUrl() {
  return "http://D";
}