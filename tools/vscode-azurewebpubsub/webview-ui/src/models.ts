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
  hubNames?: string[];
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
  /**
   * The service configuration
   */
  serviceConfiguration: ServiceConfiguration;
}
