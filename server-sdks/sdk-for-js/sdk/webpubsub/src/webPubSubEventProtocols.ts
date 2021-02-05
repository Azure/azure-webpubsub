// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CloudEvent, Message, HTTP } from "cloudevents";
import { IncomingMessage } from "http";

export interface EventHandlerOptions {
  onConnect?: (r: ConnectRequest) => ConnectResponse | ErrorResponse | Promise<ConnectResponse> | Promise<ErrorResponse>;
  onConnected?: (r: ConnectedRequest) => ConnectedResponse | ErrorResponse;
  onDisconnected?: (r: DisconnectedRequest) => DisconnectedResponse | ErrorResponse;
  onUserEvent?: (r: UserEventRequest)=> UserEventResponse | ErrorResponse;
}

export class DefaultEventHandler {
  private options?: EventHandlerOptions;
  constructor(options?: EventHandlerOptions){
    this.options = options;
  }
  
  onMessage(r: UserEventRequest): ErrorResponse | UserEventResponse {
    if (this.options?.onUserEvent === undefined) {
      return {}
    }

    return this.options?.onUserEvent(r);
  }

  onConnect(r: ConnectRequest): ConnectResponse | ErrorResponse | Promise<ConnectResponse> | Promise<ErrorResponse> {
    if (this.options?.onConnect === undefined) {
      return {}
    }

    return this.options?.onConnect(r);
  }

  onConnected(r: ConnectedRequest): ConnectedResponse | ErrorResponse{
    
    if (this.options?.onConnected === undefined) {
      return {}
    }

    return this.options?.onConnected(r);
  }
  onDisconnected(r: DisconnectedRequest): DisconnectedResponse | ErrorResponse{
    
    if (this.options?.onDisconnected === undefined) {
      return {}
    }

    return this.options?.onDisconnected(r);
  }
}

export interface EventResponse {
  body: string | Blob | undefined
}

export interface EventRequest extends Message {
}

export class ProtocolParser {
  public readonly eventHandler?: DefaultEventHandler;
  constructor(eventHandler?: DefaultEventHandler) {
    this.eventHandler = eventHandler;
  }
  
  public async processNodeHttpRequest(request: IncomingMessage): Promise<EventResponse| undefined>  {
    var response = await this.convertHttpToEvent(request);
    return this.getResponse(response);
  }

  public getResponse(request: EventRequest): EventResponse | undefined {
    if (this.eventHandler === undefined) {
      return;
    }

    const receivedEvent = HTTP.toEvent(request);
    var type = receivedEvent.type.toLowerCase();
    var context = this.GetContext(receivedEvent);
    // TODO: valid request is a valid cloud event with WebPubSub extension
    if (type === "azure.webpubsub.sys.connect") {
      var req = receivedEvent.data as ConnectRequest;
      if (!req) {
        throw new Error("Data is expected");
      }

      console.log(request);
      req.context = context;
      var response = this.eventHandler.onConnect(req);
      return {
        body: JSON.stringify(response)
      };
    } else if (type === "azure.webpubsub.sys.connected") {

    } else if (type === "azure.webpubsub.sys.disconnected") {

    } else if (type.startsWith("azure.webpubsub.user")) {

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
      userId: ce["userId"] as string,
      hub: ce["hub"] as string,
      connectionId: ce["connectionId"] as string,
      eventName: ce["eventName"] as string
    }

    // TODO: validation
    return context;
  }

  private async convertHttpToEvent(request: IncomingMessage) : Promise<EventRequest>{
    const normalized: EventRequest = {
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

export interface ErrorResponse {
  error: string;
  code: number;
}

export interface ConnectionContext {
  signature: string;
  userId?: string;
  hub?: string;
  connectionId: string;
  eventName: string;
}

export interface EventMessageBase {
  context: ConnectionContext,
}

export interface EventRequestBase extends EventMessageBase {
}

export interface EventResponseBase {

}

export interface ConnectRequest extends EventRequestBase {
  claims: { [key: string]: string[] };
  queries: { [key: string]: string[] };
  subprotocols: string[];
  clientCertificates: Certificate[];
}

export interface Certificate {
  thumbprint: string;
}

interface ConnectResponse extends EventResponseBase {
  groups?: string[];
  roles?: string[];
  userId?: string;
  subprotocol?: string;
  headers?: { [key: string]: string[] };
}

export interface ConnectedRequest extends EventRequestBase {
}

export interface ConnectedResponse extends EventResponseBase {

}

export interface UserEventRequest extends EventRequestBase {
  eventName: string;
}

export interface UserEventResponse extends EventResponseBase {

}

export interface DisconnectedRequest extends EventRequestBase {

}

export interface DisconnectedResponse extends EventResponseBase {

}