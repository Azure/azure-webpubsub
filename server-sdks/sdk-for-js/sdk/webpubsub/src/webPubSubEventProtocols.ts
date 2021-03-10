// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CloudEvent, Message, HTTP } from "cloudevents";
import { IncomingMessage } from "http";
import { decode } from 'typescript-base64-arraybuffer';

export interface EventHandlerOptions {
  onConnect?: (r: ConnectRequest) => ConnectResponse | Promise<ConnectResponse>
  onUserEvent?: (r: UserEventRequest) => UserEventResponse | Promise<UserEventResponse>
  onConnected?: (r: ConnectedRequest) => void | Promise<void>;
  onDisconnected?: (r: DisconnectedRequest) => void | Promise<void>;
}

export interface ErrorResponse {
  code: ErrorCode;
  detail?: string;
}

export enum ErrorCode {
  serverError, // Response to service using 500
  userError, // Response to service using 400
  unauthorized, // Response to service using 401
}

export interface ConnectResponse {
  error?: ErrorResponse; // If error is set, we consider this a failed response
  groups?: string[];
  roles?: string[];
  userId?: string;
  subprotocol?: string;
}

export interface UserEventResponse {
  error?: ErrorResponse, // If error is set, we consider this a failed response
  payload?: PayloadData;
}

export interface ConnectionContext {
  hub: string;
  connectionId: string;
  eventName: string;
  userId?: string;
}

export interface ConnectRequest {
  context: ConnectionContext,
  claims?: { [key: string]: string[] };
  queries?: { [key: string]: string[] };
  subprotocols?: string[];
  clientCertificates?: Certificate[];
}

export interface Certificate {
  thumbprint: string;
}

export interface ConnectedRequest {
  context: ConnectionContext,
}

export interface UserEventRequest {
  context: ConnectionContext,
  eventName: string;
  payload: PayloadData;
}

export interface PayloadData {
  data: string | ArrayBuffer;
  dataType: PayloadDataType;
}

enum PayloadDataType {
  binary,
  text,
  json,
}

export interface DisconnectedRequest {
  context: ConnectionContext,
  reason?: string;
}

export class DefaultEventHandler {
  private options?: EventHandlerOptions;
  constructor(options?: EventHandlerOptions) {
    this.options = options;
  }

  onMessage(r: UserEventRequest): UserEventResponse | undefined | Promise<UserEventResponse | undefined> {
    if (this.options?.onUserEvent === undefined) {
      return undefined;
    }

    return this.options?.onUserEvent(r);
  }

  onConnect(r: ConnectRequest): ConnectResponse | undefined | Promise<ConnectResponse | undefined> {
    if (this.options?.onConnect === undefined) {
      return undefined;
    }

    return this.options?.onConnect(r);
  }

  onConnected(r: ConnectedRequest): void {

    if (this.options?.onConnected === undefined) {
      return;
    }

    this.options?.onConnected(r);
  }
  onDisconnected(r: DisconnectedRequest): void {

    if (this.options?.onDisconnected === undefined) {
      return;
    }

    this.options?.onDisconnected(r);
  }
}

export class ProtocolParser {
  constructor(private hub: string, private eventHandler?: DefaultEventHandler, private dumpRequest?: boolean) {
  }

  public async processNodeHttpRequest(request: IncomingMessage): Promise<UserEventResponse | undefined> {
    try {
      var eventRequest = await this.convertHttpToEvent(request);
      return this.getResponse(eventRequest);
    } catch (err) {
      console.error(`Error processing request ${request}: ${err}`);
      return {
        error: {
          code: ErrorCode.serverError,
          detail: err.message,
        }
      };
    }
  }

  public async getResponse(request: Message): Promise<UserEventResponse | undefined> {
    if (this.eventHandler === undefined) {
      return;
    }

    const receivedEvent = HTTP.toEvent(request);

    if (this.dumpRequest === true) {
      console.log(receivedEvent);
    }

    var type = receivedEvent.type.toLowerCase();
    var context = this.GetContext(receivedEvent);
    if (context.hub !== this.hub) {
      console.warn(`Incoming request is for hub '${this.hub}' while the incoming request is for hub '${context.hub}'`);
      return;
    }

    // TODO: valid request is a valid cloud event with WebPubSub extension
    if (type === "azure.webpubsub.sys.connect") {
      var connectRequest = receivedEvent.data as ConnectRequest;
      if (!connectRequest) {
        throw new Error("Data is expected");
      }

      connectRequest.context = context;
      var connectResponse = await this.eventHandler.onConnect(connectRequest);
      if (connectRequest) {
        return {
          payload:{
            data: JSON.stringify(connectResponse),
            dataType: PayloadDataType.json
          } 
        };
      } else {
        return;
      }
    } else if (type === "azure.webpubsub.sys.connected") {
      var connectedRequest = receivedEvent.data as ConnectedRequest;
      if (!connectedRequest) {
        throw new Error("Data is expected");
      }

      connectedRequest.context = context;
      this.eventHandler.onConnected(connectedRequest);
    } else if (type === "azure.webpubsub.sys.disconnected") {
      var disconnectedRequest = receivedEvent.data as DisconnectedRequest;
      if (!disconnectedRequest) {
        throw new Error("Data is expected");
      }

      disconnectedRequest.context = context;
      this.eventHandler.onDisconnected(disconnectedRequest);
    } else if (type.startsWith("azure.webpubsub.user")) {
      var data: ArrayBuffer | string;
      var dataType = PayloadDataType.binary;
      if (receivedEvent.data) {
        data = receivedEvent.data as string;
        dataType = receivedEvent.datacontenttype === 'application/json' ? PayloadDataType.json : PayloadDataType.text;
      } else if (receivedEvent.data_base64) {
        data = decode(receivedEvent.data_base64);
      } else {
        throw new Error("empty data payload");
      }
      var userRequest: UserEventRequest = {
        eventName: context.eventName,
        context: context,
          payload:{
            data: data,
            dataType: dataType
          }
      };
      console.log(userRequest);
      if (!userRequest) {
        throw new Error("Data is expected");
      }

      userRequest.context = context;
      return await this.eventHandler.onMessage(userRequest);
    }
    /* for subprotocol
    else if (type === "azure.webpubsub.sys.publish") {

    }  else if (type === "azure.webpubsub.sys.published") {

    }  else if (type === "azure.webpubsub.sys.join") {

    } else if (type === "azure.webpubsub.sys.joined") {

    }  else if (type === "azure.webpubsub.sys.leave") {

    } else if (type === "azure.webpubsub.sys.left") {

    } 
    */
    else {
      throw new Error("Not supported event: " + type);
    }
  }

  private GetContext(ce: CloudEvent): ConnectionContext {
    var context = {
      signature: ce["signature"] as string,
      userId: ce["userid"] as string,
      hub: ce["hub"] as string,
      connectionId: ce["connectionid"] as string,
      eventName: ce["eventname"] as string
    }

    // TODO: validation
    return context;
  }

  private async convertHttpToEvent(request: IncomingMessage): Promise<Message> {
    const normalized: Message = {
      headers: {},
      body: ''
    };
    if (request.headers) {
      for (const key in request.headers) {
        if (Object.prototype.hasOwnProperty.call(request.headers, key)) {
          const element = request.headers[key];
          if (element === undefined) {
            continue;
          }
          if (typeof element === 'string') {
            normalized.headers[key] = element;
          } else {
            normalized.headers[key] = element.join(',');
          }
        }
      }
    }

    normalized.body = await this.readRequestBody(request);
    return normalized;
  }

  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise(function (resolve, reject) {
      var body = "";
      req.on('data', function (chunk) {
        body += chunk;
      });
      req.on('end', function () {
        resolve(body);
      });
      // reject on request error
      req.on('error', function (err) {
        // This is not a "Second reject", just a different sort of failure
        reject(err);
      });
    });
  }
}