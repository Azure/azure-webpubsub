// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CloudEvent, Message, HTTP } from "cloudevents";
import { IncomingMessage, ServerResponse } from "http";
import { decode } from 'typescript-base64-arraybuffer';


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
  connection: ConnectionContext,
  claims?: { [key: string]: string[] };
  queries?: { [key: string]: string[] };
  subprotocols?: string[];
  clientCertificates?: Certificate[];
}

export interface Certificate {
  thumbprint: string;
}

export interface ConnectedRequest {
  connection: ConnectionContext,
}

export interface UserEventRequest {
  connection: ConnectionContext,
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
  connection: ConnectionContext,
  reason?: string;
}
export interface ProtocolParserEventHandler {
  onConnect?: (r: ConnectRequest) => Promise<ConnectResponse>
  onUserEvent?: (r: UserEventRequest) => Promise<UserEventResponse>
  onConnected?: (r: ConnectedRequest) => Promise<void>;
  onDisconnected?: (r: DisconnectedRequest) => Promise<void>;
}

export class ProtocolParser {
  constructor(private hub: string, private eventHandler?: ProtocolParserEventHandler, private dumpRequest?: boolean) {
  }

  public async processNodeHttpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.eventHandler) {
      response.end();
      return;
    }
    try {
      var eventRequest = await this.convertHttpToEvent(request);
      var eventResponse = await this.getResponse(eventRequest);
      if (!eventResponse) {
        // we consider no response as 200 valid response
        response.end();
        return;
      }
      if (eventResponse.error) {
        switch (eventResponse.error.code) {
          case ErrorCode.userError:
            response.statusCode = 400;
            break;
          case ErrorCode.unauthorized:
            response.statusCode = 402;
            break;
          default:
            response.statusCode = 500;
            break;
        }
        response.end(eventResponse.error.detail ?? '');
        return;
      }

      if (eventResponse?.payload) {
        if (eventResponse.payload.dataType === PayloadDataType.binary) {
          response.setHeader("Content-Type", "application/octet-stream");

        } else if (eventResponse.payload.dataType === PayloadDataType.json) {
          response.setHeader("Content-Type", "application/json");

        } else {
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        response.end(eventResponse.payload?.data ?? '');
      }
    } catch (err) {
      console.error(`Error processing request ${request}: ${err}`);
      response.statusCode = 500;
      response.end(err.message);
    }
  }

  private async getResponse(request: Message): Promise<UserEventResponse | undefined> {
    const receivedEvent = HTTP.toEvent(request);

    if (this.dumpRequest === true) {
      console.log(receivedEvent);
    }

    var type = receivedEvent.type.toLowerCase();
    var context = this.GetContext(receivedEvent);
    if (context.hub !== this.hub) {
      // it is possible when multiple hubs share the same handler
      console.info(`Incoming request is for hub '${this.hub}' while the incoming request is for hub '${context.hub}'`);
      return;
    }

    // TODO: valid request is a valid cloud event with WebPubSub extension
    if (type === "azure.webpubsub.sys.connect" && this.eventHandler?.onConnect) {
      var connectRequest = receivedEvent.data as ConnectRequest;
      if (!connectRequest) {
        throw new Error("Data is expected");
      }

      connectRequest.connection = context;
      var connectResponse = await this.eventHandler.onConnect(connectRequest);
      if (connectRequest) {
        return {
          payload: {
            data: JSON.stringify(connectResponse),
            dataType: PayloadDataType.json
          }
        };
      } else {
        return;
      }
    } else if (type === "azure.webpubsub.sys.connected" && this.eventHandler?.onConnected) {
      var connectedRequest = receivedEvent.data as ConnectedRequest;
      if (!connectedRequest) {
        throw new Error("Data is expected");
      }

      connectedRequest.connection = context;
      this.eventHandler.onConnected(connectedRequest);
    } else if (type === "azure.webpubsub.sys.disconnected" && this.eventHandler?.onDisconnected) {
      var disconnectedRequest = receivedEvent.data as DisconnectedRequest;
      if (!disconnectedRequest) {
        throw new Error("Data is expected");
      }

      disconnectedRequest.connection = context;
      this.eventHandler.onDisconnected(disconnectedRequest);
    } else if (type.startsWith("azure.webpubsub.user") && this.eventHandler?.onUserEvent) {
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
        connection: context,
        payload: {
          data: data,
          dataType: dataType
        }
      };

      if (!userRequest) {
        throw new Error("Data is expected");
      }

      userRequest.connection = context;
      return await this.eventHandler.onUserEvent(userRequest);
    }
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