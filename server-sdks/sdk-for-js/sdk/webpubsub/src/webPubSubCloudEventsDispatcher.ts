// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CloudEvent, Message, HTTP } from "cloudevents";
import { IncomingMessage, ServerResponse } from "http";
import { decode } from "typescript-base64-arraybuffer";
import {
  ConnectRequest,
  ConnectResponse,
  UserEventRequest,
  DisconnectedRequest,
  ConnectedRequest,
  ConnectionContext
} from "./webPubSubCloudEventsProtocols";

class ConnectResponseHandler {
  constructor(private response: ServerResponse) { }
  public success(response?: ConnectResponse): void {
    this.response.statusCode = 200;
    this.response.setHeader("Content-Type", "application/json");
    this.response.end(JSON.stringify(response));
  }
  public fail(code: 400 | 401 | 500, detail?: string): void {
    this.response.statusCode = code;
    this.response.end(detail ?? "");
  }
}

class UserEventResponseHandler {
  constructor(private response: ServerResponse) { }
  public success(data?: string | ArrayBuffer, dataType?: 'binary' | 'text' | 'json'): void {
    this.response.statusCode = 200;
    switch (dataType) {
      case 'json':
        this.response.setHeader("Content-Type", "application/json;charset=utf-8");
        break;
      case 'text':
        this.response.setHeader("Content-Type", "text/plain; charset=utf-8");
        break;
      default:
        this.response.setHeader("Content-Type", "application/octet-stream");
        break;
    }
    this.response.end(data ?? "");
  }
  public fail(code: 400 | 401 | 500, detail?: string): void {
    this.response.statusCode = code;
    this.response.end(detail ?? "");
  }
}

/**
 * Options to define the event handlers for each event
 */
export interface WebPubSubEventHandler {
  handleConnect?: (connectRequest: ConnectRequest, connectResponse: ConnectResponseHandler) => Promise<void>;
  handleUserEvent?: (userEventRequest: UserEventRequest, userEventResponse: UserEventResponseHandler) => Promise<void>;
  onConnected?: (connectedRequest: ConnectedRequest) => Promise<void>;
  onDisconnected?: (disconnectedRequest: DisconnectedRequest) => Promise<void>;
}

export class CloudEventsDispatcher {
  constructor(
    private hub: string,
    private eventHandler?: WebPubSubEventHandler,
    private dumpRequest?: boolean
  ) { }

  public async processRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    // check if hub matches
    if (!this.eventHandler || request.headers["ce-hub"] !== this.hub) {
      return false;
    }

    var eventRequest = await this.convertHttpToEvent(request);
    const receivedEvent = HTTP.toEvent(eventRequest);

    if (this.dumpRequest === true) {
      console.log(receivedEvent);
    }

    var type = receivedEvent.type.toLowerCase();
    switch (type) {
      case "azure.webpubsub.sys.connect": {
        var handler = new ConnectResponseHandler(response);
        if (!this.eventHandler?.handleConnect) {
          handler.fail(401);
          return true;
        }
        var connectRequest = receivedEvent.data as ConnectRequest;
        connectRequest.context = this.GetContext(receivedEvent, request.headers.host!);
        this.eventHandler.handleConnect(connectRequest, handler);
        return true;
      }
      case "azure.webpubsub.sys.connected": {
        if (this.eventHandler?.onConnected) {

          var connectedRequest = receivedEvent.data as ConnectedRequest;
          connectedRequest.context = this.GetContext(receivedEvent, request.headers.host!);
          this.eventHandler.onConnected(connectedRequest);
        }
        return true;
      }
      case "azure.webpubsub.sys.disconnected": {
        if (this.eventHandler?.onDisconnected) {

          var disconnectedRequest = receivedEvent.data as DisconnectedRequest;
          disconnectedRequest.context = this.GetContext(receivedEvent, request.headers.host!);
          this.eventHandler.onDisconnected(disconnectedRequest);
        }
        return true;
      }
      default:
        if (type.startsWith("azure.webpubsub.user")) {
          var eventHandler = new UserEventResponseHandler(response);
          if (!this.eventHandler?.handleUserEvent) {
            eventHandler.success();
            return true;
          }
          var data: ArrayBuffer | string;
          var dataType: "binary" | "text" | "json" = 'binary';

          if (receivedEvent.data) {
            data = receivedEvent.data as string;
            dataType =
              receivedEvent.datacontenttype === "application/json"
                ? 'json'
                : 'text';
          } else if (receivedEvent.data_base64) {
            data = decode(receivedEvent.data_base64);
          } else {
            throw new Error("empty data payload");
          }

          var userRequest: UserEventRequest = {
            context: this.GetContext(receivedEvent, request.headers.host!),
            data: data,
            dataType: dataType
          };
          this.eventHandler.handleUserEvent(userRequest, eventHandler);
          return true;
        }
        else {
          // unknown cloud events
          return false;
        }
    }
  }

  private GetContext(ce: CloudEvent, host: string): ConnectionContext {
    var context = {
      signature: ce["signature"] as string,
      userId: ce["userid"] as string,
      hub: ce["hub"] as string,
      connectionId: ce["connectionid"] as string,
      eventName: ce["eventname"] as string,
      host: host
    };

    // TODO: validation
    return context;
  }

  private async convertHttpToEvent(request: IncomingMessage): Promise<Message> {
    const normalized: Message = {
      headers: {},
      body: ""
    };
    if (request.headers) {
      for (const key in request.headers) {
        if (Object.prototype.hasOwnProperty.call(request.headers, key)) {
          const element = request.headers[key];
          if (element === undefined) {
            continue;
          }
          if (typeof element === "string") {
            normalized.headers[key] = element;
          } else {
            normalized.headers[key] = element.join(",");
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
      req.on("data", function (chunk) {
        body += chunk;
      });
      req.on("end", function () {
        resolve(body);
      });
      // reject on request error
      req.on("error", function (err) {
        // This is not a "Second reject", just a different sort of failure
        reject(err);
      });
    });
  }
}
