export enum TunnelMessageType {
  None = 0,
  HttpRequest = 1,
  HttpResponse = 2,
  ServiceStatus = 5,
  ConnectionReconnect = 6,
  ConnectionClose = 7,
  ConnectionRebalance = 8,
  ConnectionConnected = 10,
}

export abstract class TunnelMessage {
  abstract Type: TunnelMessageType;
  public TracingId?: number;
}

export abstract class TunnelByteContentMessage extends TunnelMessage {
  constructor(public Content?: Uint8Array) {
    super();
  }
}

export class TunnelHttpRequestMessage extends TunnelByteContentMessage {
  public readonly Type = TunnelMessageType.HttpRequest;

  constructor(
    public readonly AckId: number,
    public readonly LocalRouting: boolean,
    public readonly ChannelName: string,
    public readonly HttpMethod: string,
    public readonly Url: string,
    public readonly Headers?: Record<string, string[]>,
    public Content?: Uint8Array
  ) {
    super(Content);
  }
}

export class TunnelHttpResponseMessage extends TunnelByteContentMessage {
  public readonly Type = TunnelMessageType.HttpResponse;

  constructor(
    public readonly AckId: number,
    public readonly LocalRouting: boolean,
    public readonly StatusCode: number,
    public readonly ChannelName: string,
    public readonly NotCompleted: boolean,
    public readonly Headers?: Record<string, string[]>,
    public Content?: Uint8Array
  ) {
    super(Content);
  }
}

export class TunnelConnectionReconnectMessage extends TunnelMessage {
  public readonly Type = TunnelMessageType.ConnectionReconnect;

  constructor(
    public readonly TargetId: string,
    public readonly Endpoint: string,
    public readonly Message: string
  ) {
    super();
  }
}

export class TunnelConnectionCloseMessage extends TunnelMessage {
  public readonly Type = TunnelMessageType.ConnectionClose;

  constructor(public readonly Message: string) {
    super();
  }
}

export class TunnelServiceStatusMessage extends TunnelMessage {
  public readonly Type = TunnelMessageType.ServiceStatus;

  constructor(public readonly Message: string) {
    super();
  }
}

export class TunnelConnectionRebalanceMessage extends TunnelMessage {
  public readonly Type = TunnelMessageType.ConnectionRebalance;

  constructor(
    public readonly TargetId: string,
    public readonly Endpoint: string,
    public readonly Message: string
  ) {
    super();
  }
}

export class TunnelConnectionConnectedMessage extends TunnelMessage {
  public readonly Type = TunnelMessageType.ConnectionConnected;

  constructor(
    public readonly ConnectionId: string,
    public readonly UserId?: string,
    public readonly ReconnectionToken?: string
  ) {
    super();
  }
}