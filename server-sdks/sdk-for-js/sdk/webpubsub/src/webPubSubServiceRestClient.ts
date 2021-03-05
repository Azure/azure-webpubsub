// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebPubSubServiceClient as GeneratedClient } from "./generated/webPubSubServiceClient";
import { ServiceClientCredentials, RestResponse, RestError, HttpRequestBody, HttpPipelineLogLevel, HttpPipelineLogger, RequestPolicyFactory, logPolicy } from "@azure/ms-rest-js";

import { WebPubSubSendApi } from "./webPubSubApiExtensions";
import { WebPubSubKeyCredentials } from "./webPubSubKeyCredentials";
import { URL } from "url";

export interface OperationOptions {
  apiVersion?: string;
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

interface ServiceEndpoint {
  host: string;
  audience: string;
  key: string;
  wshost: string;
}

/**
 * Client for connecting to a SignalR hub
 */
export class WebPubSubServiceRestClient {
  private readonly client: GeneratedClient;
  private readonly sender: WebPubSubSendApi;
  private credential!: ServiceClientCredentials;

  /**
   * The name of the hub this client is connected to
   */
  public readonly hub: string;
  /**
   * The SignalR API version being used by this client
   */
  public readonly apiVersion: string = "2020-10-01";

  constructor(connectionString: string, hub: string, options?: WebPubSubServiceRestClientOptions) {
    this.hub = hub;

    var endpoint = this.parseConnectionString(connectionString);
    if (endpoint === null) {
      throw new RestError("Invalid connection string: " + connectionString);
    }

    this.credential = new WebPubSubKeyCredentials(endpoint.key);
    this.client = new GeneratedClient(this.credential, {
      //httpPipelineLogger: options?.dumpRequest ? new ConsoleHttpPipelineLogger(HttpPipelineLogLevel.INFO) : undefined,
      baseUri: endpoint.host,
      requestPolicyFactories: options?.dumpRequest ? this.getFactoryWithLogPolicy : undefined,
    });
    this.sender = new WebPubSubSendApi(this.client);
  }

  private getFactoryWithLogPolicy(defaultRequestPolicyFactories: RequestPolicyFactory[]): void {
    logPolicy
    defaultRequestPolicyFactories.push(logPolicy());
  }

  private parseConnectionString(conn: string): ServiceEndpoint | null {
    const em = /Endpoint=(.*?)(;|$)/g.exec(conn);
    if (!em) return null;
    const endpoint = em[1];
    const km = /AccessKey=(.*?)(;|$)/g.exec(conn);
    if (!km) return null;
    const key = km[1];
    if (!endpoint || !key) return null;
    const pm = /Port=(.*?)(;|$)/g.exec(conn);
    const port = pm == null ? '' : pm[1];
    var url = new URL(endpoint);
    url.port = port;
    const host = url.toString();
    url.port = '';
    const audience = url.toString();
    return {
      host: host,
      audience: audience,
      key: key,
      wshost: host.replace('https://', 'wss://').replace('http://', 'ws://')
    };
  }

  /**
   * Check if the service is healthy
   *
   * @param options Additional options
   */
  public async serviceIsHealthy(options: OperationOptions = {}): Promise<boolean> {
    try {
      await this.client.healthApi.getHealthStatus({
        apiVersion: options.apiVersion
      });
      return true;
    } catch {
      return false;
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
      var res = await this.sender.sendToAll(this.hub, message, {
        apiVersion: options.apiVersion,
        hub: this.hub,
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
      var res = await this.sender.sendToUser(this.hub, username, message, {
        apiVersion: options.apiVersion,
        hub: this.hub
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
      var res = await this.sender.sendToConnection(this.hub, connectionId, message, {
        apiVersion: options.apiVersion,
        hub: this.hub
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
          apiVersion: options.apiVersion,
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
          apiVersion: options.apiVersion,
          hub: this.hub,
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
          apiVersion: options.apiVersion,
          hub: this.hub,
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
          apiVersion: options.apiVersion,
          hub: this.hub,
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
          apiVersion: options.apiVersion,
          hub: this.hub,
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
          apiVersion: options.apiVersion,
          hub: this.hub
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
          apiVersion: options.apiVersion,
          hub: this.hub
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
          apiVersion: options.apiVersion,
          hub: this.hub
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
          apiVersion: options.apiVersion,
          hub: this.hub
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
          apiVersion: options.apiVersion,
          hub: this.hub
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
        groupName,
        message,
        {
          apiVersion: options.apiVersion,
          hub: this.hub,
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
