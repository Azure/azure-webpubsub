// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CloudEvent, Message, HTTP } from "cloudevents";
import { IncomingMessage } from "http";
import {decode, encode} from 'typescript-base64-arraybuffer';

export interface EventHandlerOptions {
  onConnect?: (r: ConnectRequest) => ConnectResponse | ErrorResponse | Promise<ConnectResponse> | Promise<ErrorResponse>;
  onUserEvent?: (r: UserEventRequest)=> EventResponse | ErrorResponse | Promise<EventResponse> | Promise<ErrorResponse>;
  onConnected?: (r: ConnectedRequest) => void;
  onDisconnected?: (r: DisconnectedRequest) => void;
}

export interface ConnectResponse {
  groups?: string[];
  roles?: string[];
  userId?: string;
  subprotocol?: string;
  headers?: { [key: string]: string[] };
}

export interface EventResponse {
  body: string | ArrayBuffer | undefined,
  error: ErrorResponse
}

export interface ErrorResponse {
  error: string | undefined;
  code: number;
}

export interface ConnectionContext {
  signature: string;
  userId?: string;
  hub?: string;
  connectionId: string;
  eventName: string;
}

export interface EventRequestBase {
  context: ConnectionContext,
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

export interface ConnectedRequest extends EventRequestBase {
}

export interface UserEventRequest extends EventRequestBase {
  eventName: string;
  data: string | ArrayBuffer;
}

export interface DisconnectedRequest extends EventRequestBase {
  reason?: string;
}

export class DefaultEventHandler {
  private options?: EventHandlerOptions;
  constructor(options?: EventHandlerOptions){
    this.options = options;
  }
  
  onMessage(r: UserEventRequest): ErrorResponse | EventResponse| undefined | Promise<EventResponse | ErrorResponse | undefined> {
    if (this.options?.onUserEvent === undefined) {
      return undefined;
    }

    return this.options?.onUserEvent(r);
  }

  onConnect(r: ConnectRequest): ConnectResponse | ErrorResponse | undefined | Promise<ConnectResponse | ErrorResponse | undefined> {
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
  constructor(private hub: string, private eventHandler?: DefaultEventHandler) {
  }
  
  public async processNodeHttpRequest(request: IncomingMessage): Promise<EventResponse | undefined>  {
    try {
      var eventRequest = await this.convertHttpToEvent(request);
      return this.getResponse(eventRequest);
    } catch (err){
      console.error(`Error processing request ${request}: ${err}`);
      return {
        error: err.message,
        code: 500,
      } as ErrorResponse;
    }
  }

  public async getResponse(request: Message): Promise<EventResponse| undefined>  {
    if (this.eventHandler === undefined) {
      return;
    }

    const receivedEvent = HTTP.toEvent(request);
      console.log(receivedEvent);
      var type = receivedEvent.type.toLowerCase();
    var context = this.GetContext(receivedEvent);
    if (context.hub !== this.hub){
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
      return {
        body: JSON.stringify(connectResponse)
      };
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
      console.log(receivedEvent);
      var data : ArrayBuffer | string;
      if (receivedEvent.data){
        data = receivedEvent.data as string;
      } else if (receivedEvent.data_base64){
        data = decode(receivedEvent.data_base64);
      } else{
        throw new Error("empty data payload");
      }
      var userRequest : UserEventRequest = {
        eventName: context.eventName,
        context: context,
        data: data
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

  private async convertHttpToEvent(request: IncomingMessage) : Promise<Message>{
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