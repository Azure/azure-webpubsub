export interface HttpHistoryItem {
  requestAtOffset: number;
  code: number;
  methodName: string;
  url: string;
  requestRaw: string;
  responseRaw: string;
  unread: boolean;
}

export interface LogItem {
  level: LogLevel;
  message: string;
  time: Date;
}

export enum LogLevel {
  Trace,
  Debug,
  Info,
  Warning,
  Error,
}

export enum ConnectionStatus {
  Connecting = "Connecting",
  Connected = "Connected",
  Reconnecting = "Reconnecting",
  Disconnected = "Disconnected",
}

export interface ConnectionStatusPair {
  statusOut: ConnectionStatus;
  statusIn: ConnectionStatus;
}

export interface DataModel {
  /**
   * Whether the data is loaded
   */
  ready: boolean;
  /**
   * Endpoint part of the connection string, or the endpoint parameter,
   *  e.g. https://xxx.webpubsub.azure.com
   */
  endpoint: string;
  /** The hub the tunnel is connecting to
   * each hub is an isolation boudary
   */
  hub: string;
  /**
   * The generated URL for the WebSocket client to connect to, including the access_token
   * e.g. https://xxx.webpubsub.azure.com/client/hubs/chat?access_token=xxx
   */
  clientUrl: string;
  /**
   * The Live Trace URL that this Web PubSub service uses, it can be opened in a browser
   */
  liveTraceUrl: string;
  /**
   * The URL of the local server that the tunnel is connecting to
   */
  upstreamServerUrl: string;
  /**
   * The status of the tunnel connections connecting to Web PubSub service
   */
  tunnelConnectionStatus: ConnectionStatus;
  /**
   * The status pair of the HTTP request invoking the local server
   */
  tunnelServerStatus: ConnectionStatusPair;
  /**
   * The traffic history stored in local storage
   */
  trafficHistory: HttpHistoryItem[];
  /**
   * The logs for current round
   */
  logs: LogItem[];
}
