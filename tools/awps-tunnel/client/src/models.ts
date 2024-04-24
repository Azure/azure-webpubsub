export interface HttpHistoryItem {
  id?: number;
  tracingId?: number;
  requestAtOffset: number;
  responseAtOffset?: number;
  code?: number;
  methodName: string;
  url: string;
  requestRaw: string;
  responseRaw?: string;
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

export interface EventHandlerSetting {
  urlTemplate: string;
  userEventPattern: string;
  systemEvents: SystemEvent[];
}

export interface ServiceConfiguration {
  eventHandlers?: EventHandlerSetting[];
  message?: string;
  subscriptionId?: string;
  resourceGroup?: string;
  resourceName: string;
  loaded: boolean;
}

export enum ConnectionStatus {
  None = "None",
  Connecting = "Connecting",
  Connected = "Connected",
  Reconnecting = "Reconnecting",
  Disconnected = "Disconnected",
  Disconnecting = "Disconnecting",
}

export enum SystemEvent {
  Connect = "connect",
  Connected = "connected",
  Disconnected = "disconnected",
}

export interface ConnectionStatusPair {
  statusOut: ConnectionStatus;
  statusIn: ConnectionStatus;
}
export class ConnectionStatusPairs {
  public static readonly None: ConnectionStatusPair = { statusOut: ConnectionStatus.None, statusIn: ConnectionStatus.None };
  public static readonly Connected: ConnectionStatusPair = { statusOut: ConnectionStatus.Connected, statusIn: ConnectionStatus.Connected };
  public static readonly Disconnected: ConnectionStatusPair = { statusOut: ConnectionStatus.Disconnected, statusIn: ConnectionStatus.Disconnected };
  public static readonly ErrorResponse: ConnectionStatusPair = { statusOut: ConnectionStatus.Connected, statusIn: ConnectionStatus.Disconnected };
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
  /**
   * The service configuration
   */
  serviceConfiguration: ServiceConfiguration;
  /**
   * Whether the built-in upstream server is started in the server
   */
  builtinUpstreamServerStarted: boolean;
}

export interface RESTApi {
  swagger: string,
  info: {
    title: string,
    version: string
  },
  paths: { [key: string]: PathItem }
}

export interface PathItem {
  get?: Operation
  post?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
  patch?: Operation;
  put?: Operation;
  parameters?: Parameter[];
}

export interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  consumes?: string[];
  produces?: string[];
  parameters?: Parameter[];
  responses: { [status: string]: APIResponse };
  deprecated?: boolean;
  // x-ms-examples?: any;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'formData' | 'body';
  description?: string;
  required?: boolean;
  type?: string;
  format?: string;
  schema?: Schema;
  items?: Items;
  collectionFormat?: 'csv' | 'ssv' | 'tsv' | 'pipes' | 'multi';
  default?: any;
  pattern?: string;
}

export interface Items {
  type: string;
  items?: Items;
  collectionFormat?: 'csv' | 'ssv' | 'tsv' | 'pipes' | 'multi';
  default?: any;
}

export interface Schema {
  $ref?: string;
  type?: string;
  items?: Items;
}

export interface APIResponse {
  description: string;
  schema?: Schema;
  headers?: { [key: string]: Header };
  examples?: any;
  // x-ms-error-response?: boolean;
}

export interface Header {
  type: string;
  format?: string;
  items?: Items;
  collectionFormat?: 'csv' | 'ssv' | 'tsv' | 'pipes' | 'multi';
  default?: any;
}

// Definitions could be added here if more details are provided about them
interface Definitions {
  ErrorDetail?: any;
  AddToGroupsRequest?: any;
}

