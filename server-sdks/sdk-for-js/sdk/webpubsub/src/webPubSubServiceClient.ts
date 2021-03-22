// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSub, WebPubSubServiceClient as GeneratedClient} from "./generated/webPubSubServiceClient";
import { WebPubSubKeyCredentials } from "./webPubSubKeyCredentials";
import { Enum0 as Permission } from "./generated/index";
import jwt from "jsonwebtoken";
import { ServiceClientCredentials, RestError, RestResponse, HttpRequestBody, HttpPipelineLogLevel, HttpPipelineLogger, RequestPolicyFactory, logPolicy } from "@azure/core-http";
/**
 * Options for auth a client
 */
export interface GetAuthenticationTokenOptions {
  /**
   * The userId for the client
   */
  userId?: string;
  /**
   * The custom claims for the client, e.g. role
   */
  claims?: { [key: string]: string[] };
}

/**
 * Response for the authed client, including the url and the jwt token
 */
export interface GetAuthenticationTokenResponse {
  /**
   * The URL client connects to
   */
  baseUrl: string;

  /**
   * The JWT token the client uses to connect
   */
  token: string;

  /**
   * The URL client connects to with access_token query string
   */
  url: string;
}

export interface OperationOptions {
  apiVersion?: string;
  plainText?: boolean;
}

/**
 * Options for closing a connection to a hub.
 */
export interface CloseConnectionOptions extends OperationOptions {
  /**
   * Reason the connection is being closed.
   */
  reason?: string;
}

export interface ClientAuthOptions {
  userId?: string;
  claims?: { [key: string]: string[] };
}

export interface ClientAuthResponse {
  url: string;
  token: string;
}

/**
 * Options for sending messages to hubs, groups, users, or connections.
 */
export interface HubBroadcastOptions extends OperationOptions {
  /**
   * Connection ids to exclude from receiving this message.
   */
  excludedConnections?: string[];
}

export interface WebPubSubServiceRestClientOptions {
  dumpRequest?: boolean;
}

export class ConsoleHttpPipelineLogger implements HttpPipelineLogger {
  /**
   * Create a new ConsoleHttpPipelineLogger.
   * @param minimumLogLevel The log level threshold for what logs will be logged.
   */
  constructor(public minimumLogLevel: HttpPipelineLogLevel) {
  }

  /**
   * Log the provided message.
   * @param logLevel The HttpLogDetailLevel associated with this message.
   * @param message The message to log.
   */
  log(logLevel: HttpPipelineLogLevel, message: string): void {
    const logMessage = `${HttpPipelineLogLevel[logLevel]}: ${message}`;
    switch (logLevel) {
      case HttpPipelineLogLevel.ERROR:
        console.error(logMessage);
        break;

      case HttpPipelineLogLevel.WARNING:
        console.warn(logMessage);
        break;

      case HttpPipelineLogLevel.INFO:
        console.log(logMessage);
        break;
    }
  }
}

/**
 * Client for connecting to a SignalR hub
 */
export class WebPubSubServiceClient {
  private readonly client: GeneratedClient;
  private readonly sender: WebPubSub;
  private credential!: WebPubSubKeyCredentials;

  /**
   * The name of the hub this client is connected to
   */
  public readonly hub: string;

  /**
   * The SignalR API version being used by this client
   */
  public readonly apiVersion: string = "2020-10-01";

  /**
   * The endpoint this client is connected to
   */
  public serviceUrl!: URL;

  private _endpoint: string;

  constructor(conn: string, hub: string, options?: WebPubSubServiceRestClientOptions) {
    const parsedCs = parseConnectionString(conn);
    this._endpoint = parsedCs.endpoint;
    this.credential = parsedCs.credential;

    this.hub = hub;
    this.client = new GeneratedClient(this.credential, this._endpoint, {
      //httpPipelineLogger: options?.dumpRequest ? new ConsoleHttpPipelineLogger(HttpPipelineLogLevel.INFO) : undefined,
      requestPolicyFactories: options?.dumpRequest ? this.getFactoryWithLogPolicy : undefined,
    });
    this.sender = new WebPubSub(this.client);
  }

  /**
   * Auth the client connection with userId and custom claims if any
   * @param options The options that the client has
   */
  public async getAuthenticationToken(
    options?: GetAuthenticationTokenOptions
  ): Promise<GetAuthenticationTokenResponse> {
    const endpoint = this._endpoint.endsWith("/") ? this._endpoint : this._endpoint + "/";
    const key = this.credential.key;
    const hub = this.hub;
    var clientEndpoint = endpoint.replace(/(http)(s?:\/\/)/gi, "ws$2");
    var clientUrl = `${clientEndpoint}client/hubs/${hub}`;
    const audience = `${endpoint}client/hubs/${hub}`;
    var payload = options?.claims ?? {};
    var signOptions: jwt.SignOptions = {
      audience: audience,
      expiresIn: "1h",
      algorithm: "HS256"
    };
    if (options?.userId) {
      signOptions.subject = options?.userId;
    }
    const token = jwt.sign(payload, key, signOptions);
    const url = `${clientUrl}?access_token=${token}`;
    return {
      baseUrl: clientUrl,
      token: jwt.sign(payload, key, signOptions),
      url: url
    };
  }


  private getFactoryWithLogPolicy(defaultRequestPolicyFactories: RequestPolicyFactory[]): void {
    logPolicy
    defaultRequestPolicyFactories.push(logPolicy());
  }

  /**
   * Check if the service is healthy
   *
   * @param options Additional options
   */
  public async serviceIsHealthy(options: OperationOptions = {}): Promise<boolean> {
    try {
      await this.client.healthApi.getHealthStatus({
      });
      return true;
    } catch {
      return false;
    } finally {
    }
  }

  public async hasPermission(connectionId: string, permission: Permission, group?: string, options: OperationOptions = {}): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.checkPermission(this.hub,
        permission, 
        connectionId,
        {
          targetName: group
        }
      );
      return this.verifyResponse(res, 200, 404);
    } finally {
    }
  }

  public async grantPermission(connectionId: string, permission: Permission, group?: string, options: OperationOptions = {}): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.grantPermission(this.hub,
        permission, 
        connectionId,
        {
          targetName: group
        }
      );
      return this.verifyResponse(res, 200);
    } finally {
    }
  }

  public async revokePermission(connectionId: string, permission: Permission, group?: string, options: OperationOptions = {}): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.revokePermission(this.hub,
        permission, 
        connectionId,
        {
          targetName: group
        }
      );
      return this.verifyResponse(res, 200);
    } finally {
    }
  }

  /**
   * Broadcast a text message to all connections on this hub.
   *
   * @param message The message to send
   * @param options Additional options
   */
  public async sendToAll(message: string, options?: HubBroadcastOptions): Promise<boolean>;
  /**
   * Broadcast a binary message to all connections on this hub.
   *
   * @param message The message to send
   * @param options Additional options
   */
  public async sendToAll(
    message: Blob | ArrayBuffer | ArrayBufferView,
    options?: HubBroadcastOptions
  ): Promise<boolean>;

  public async sendToAll(
    message: string | HttpRequestBody,
    options: HubBroadcastOptions = {}
  ): Promise<boolean> {
    try {
      var res = typeof message === "string" ?
      (options.plainText ?
        await this.sender.sendToAll(this.hub, "text/plain", message, {
          excluded: options.excludedConnections
        })  : 
        await this.sender.sendToAll(this.hub, "application/json", message, {
          excluded: options.excludedConnections
        }) ):
        await this.sender.sendToAll(this.hub, "application/octet-stream", message, {
          excluded: options.excludedConnections
        });
      return this.verifyResponse(res, 202);
    } finally {
    }
  }

  /**
   * Send a text message to a specific user
   *
   * @param username User name to send to
   * @param message The message to send
   * @param options Additional options
   */
  public sendToUser(
    username: string,
    message: string,
    options?: OperationOptions
  ): Promise<boolean>;

  /**
   * Send a binary message to a specific user
   *
   * @param username The user name to send to
   * @param message The binary message to send
   * @param options Additional options
   */
  public sendToUser(
    username: string,
    message: HttpRequestBody,
    options?: OperationOptions
  ): Promise<boolean>;
  public async sendToUser(
    username: string,
    message: string | HttpRequestBody,
    options: OperationOptions = {}
  ): Promise<boolean> {
    try {
      var res = typeof message === "string" ?
       (options.plainText ?
        await this.sender.sendToUser(this.hub, username, "text/plain", message, {
        }) : await this.sender.sendToUser(this.hub, username, "application/json", message, {
        }))
        :
        await this.sender.sendToUser(this.hub, username, "application/octet-stream", message, {
        });
      return this.verifyResponse(res, 202);
    } finally {
    };
  }

  /**
   * Send a text message to a specific connection
   *
   * @param connectionId Connection id to send to
   * @param message The text message
   * @param options Additional options
   */
  public sendToConnection(
    connectionId: string,
    message: string,
    options?: OperationOptions
  ): Promise<boolean>;
  /**
   * Send a binary message to a specific connection
   *
   * @param connectionId Connection id to send to
   * @param message The binary message
   * @param options Additional options
   */
  public sendToConnection(
    connectionId: string,
    message: HttpRequestBody,
    options?: OperationOptions
  ): Promise<boolean>;
  public async sendToConnection(
    connectionId: string,
    message: string | HttpRequestBody,
    options: OperationOptions = {}
  ): Promise<boolean> {
    try {
      
      var res = typeof message === "string" ?
      (options.plainText ?
       await this.sender.sendToConnection(this.hub, connectionId, "text/plain", message, {
       }) : await this.sender.sendToConnection(this.hub, connectionId, "application/json", message, {
       })):
        await this.sender.sendToConnection(this.hub, connectionId, "application/octet-stream", message, {
        });
      return this.verifyResponse(res, 202);
    } finally {
    }
  }

  /**
   * Check if a specific connection is connected to this hub
   *
   * @param connectionId Connection id to check
   * @param options Additional options
   */
  public async hasConnection(
    connectionId: string,
    options: OperationOptions = {}
  ): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.checkConnectionExistence(this.hub,
        connectionId,
        {
        }
      );
      return this.verifyResponse(res, 200, 404);
    } finally {
    }
  }

  /**
   * Close a specific connection to this hub
   *
   * @param connectionId Connection id to close
   * @param options Additional options
   */
  public async closeConnection(
    connectionId: string,
    options: CloseConnectionOptions = {}
  ): Promise<boolean> {
    try {
      var res = await this.client.webPubSubApi.closeClientConnection(this.hub,
        connectionId,
        {
          reason: options.reason
        }
      );
      return this.verifyResponse(res, 200);
    } finally {
    }
  }

  /**
   * Remove a specific user from all groups they are joined to
   * @param userId The user id to remove from all groups
   * @param options Additional options
   */
  public async removeUserFromAllGroups(
    userId: string,
    options: CloseConnectionOptions = {}
  ): Promise<boolean> {
    try {
      var res = await this.client.webPubSubApi.removeUserFromAllGroups(this.hub,
        userId,
        {
        }
      );

      return this.verifyResponse(res, 202);

    } finally {
    }
  }

  /**
   * Check if a particular group exists (i.e. has active connections).
   *
   * @param groupName The group name to check for
   * @param options Additional options
   */
  public async hasGroup(groupName: string, options: OperationOptions = {}): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.checkGroupExistence(this.hub,
        groupName,
        {
        }
      );
      return this.verifyResponse(res, 200, 404);

    } finally {
    }
  }

  /**
   * Check if a particular user is connected to this hub.
   *
   * @param username The user name to check for
   * @param options Additional options
   */
  public async hasUser(username: string, options: OperationOptions = {}): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.checkUserExistence(this.hub,
        username,
        {
        }
      );
      return this.verifyResponse(res, 200, 404);
    } finally {
    }
  }

  /**
   * Add a specific connection to this group
   *
   * @param connectionId The connection id to add to this group
   * @param options Additional options
   */
  public async addConnectionToGroup(groupName: string,
    connectionId: string,
    options: OperationOptions = {}
  ): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.addConnectionToGroup(this.hub,
        groupName, connectionId,
        {
        }
      );
      return this.verifyResponse(res, 202);
    } finally {
    }
  }

  /**
   * Remove a specific connection from this group
   *
   * @param connectionId The connection id to remove from this group
   * @param options Additional options
   */
  public async removeConnectionFromGroup(groupName: string,
    connectionId: string,
    options: OperationOptions = {}
  ): Promise<boolean> {
    try {
      const res = await this.client.webPubSubApi.removeConnectionFromGroup(this.hub,
        groupName, connectionId,
        {
        }
      );
      return this.verifyResponse(res, 202);

    } finally {
    }
  }

  /**
   * Add a user to this group
   *
   * @param username The user name to add
   * @param options Additional options
   */
  public async addUserToGroup(groupName: string, username: string, options: OperationOptions = {}): Promise<boolean> {
    try {
      var res = await this.client.webPubSubApi.addUserToGroup(this.hub,
        groupName,
        username,
        {
        }
      );

      return this.verifyResponse(res, 202);
    } finally {
    }
  }

  /**
   * Check if a user is in this group
   *
   * @param groupName The group name to check for
   * @param username The user name to check for
   * @param options Additional options
   */
  public async hasUserInGroup(groupName: string, username: string, options: OperationOptions = {}): Promise<boolean> {

    try {
      const res = await this.client.webPubSubApi.checkUserExistenceInGroup(this.hub,
        groupName,
        username,

        {
        }
      );
      return this.verifyResponse(res, 200, 404);

    } finally {
    }
  }

  /**
   * Remove a user from this group
   *
   * @param groupName The group name to check for
   * @param username The user name to remove
   * @param options Additional options
   */
  public async removeUserFromGroup(groupName: string, username: string, options: OperationOptions = {}): Promise<boolean> {

    try {
      var res = await this.client.webPubSubApi.removeUserFromGroup(this.hub,
        groupName,
        username,
        {
        }
      );

      // FOR now it is still 202, we are changing the service to support 200 soon
      return this.verifyResponse(res, 200, 404);
    } finally {
    }
  }

  /**
   * Send a text message to every connection in this group
   *
   * @param groupName The group name to check for
   * @param message The message to send
   * @param options Additional options
   */
  public async publish(groupName: string, message: string, options?: HubBroadcastOptions): Promise<boolean>;

  /**
   * Send a binary message to every connection in this group
   *
   * @param groupName The group name to check for
   * @param message The binary message to send
   * @param options Additional options
   */
  public async publish(groupName: string,
    message: HttpRequestBody,
    options?: HubBroadcastOptions
  ): Promise<boolean>;
  public async publish(groupName: string,
    message: string | HttpRequestBody,
    options: HubBroadcastOptions = {}
  ): Promise<boolean> {

    try {
      var res = await this.sender.sendToGroup(
        this.hub,
        groupName,
        "application/octet-stream",
        message,
        {
          excluded: options.excludedConnections
        }
      );
      return this.verifyResponse(res, 200);
    } finally {
    }
  }

  private verifyResponse(res: RestResponse, successStatus?: number, failureStatus?: number): boolean {
    if (successStatus !== undefined && res._response.status === successStatus) {
      return true;
    }

    if (failureStatus !== undefined && res._response.status === failureStatus) {
      return false;
    }

    else {
      // this is sad - wish this was handled by autorest.
      throw new RestError(
        res._response.bodyAsText!,
        undefined,
        res._response.status,
        res._response.request,
        res._response
      );
    }
  }
}

interface ParsedConnectionString {
  credential: WebPubSubKeyCredentials;
  endpoint: string;
}
function parseConnectionString(conn: string): ParsedConnectionString {
  const em = /Endpoint=(.*?)(;|$)/g.exec(conn);
  if (!em) throw new TypeError("connection string missing endpoint");
  const endpointPart = em[1];
  const km = /AccessKey=(.*?)(;|$)/g.exec(conn);
  if (!km) throw new Error("connection string missing access key");
  const key = km[1];
  const credential = new WebPubSubKeyCredentials(key);
  const pm = /Port=(.*?)(;|$)/g.exec(conn);
  const port = pm == null ? "" : pm[1];
  const url = new URL(endpointPart);
  url.port = port;
  const endpoint = url.toString();
  url.port = "";
  // todo: Support PORT with audience n stuff.
  // this.audience = url.toString();

  return { credential, endpoint: (endpoint.endsWith("/") ? endpoint : endpoint + "/") };
}