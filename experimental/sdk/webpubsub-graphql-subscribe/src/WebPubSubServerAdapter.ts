import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";
import WebSocket from "ws";
import * as core from "express-serve-static-core";

/**
 * a virtual WebSocket.Server without real server
 */
class VirtualWebSocketServer extends WebSocket.Server {
  protocol: string = "graphql-ws";
  readyState: number = WebSocket.OPEN;

  constructor() {
    super({ port: undefined, noServer: true });
  }
}

/**
 * A logical ClientConnectionContext that stands for a GraphQL client connection, every connection has a unique `connectionId`
 * It overrides method `send` and send messages back to its connection through Azure Web PubSub using `WebPubSubServiceClient`
 */
class ClientConnectionContext extends VirtualWebSocketServer {
  serviceClient: WebPubSubServiceClient;
  connectionId: string;

  constructor(serviceClient: WebPubSubServiceClient, connectionId: string) {
    super();
    this.serviceClient = serviceClient;
    this.connectionId = connectionId;
  }

  send(data: any) {
    this.serviceClient.sendToConnection(this.connectionId, data, {
      contentType: "text/plain",
    });
  }
}

export interface WebPubSubServerAdapterOptions {
  connectionString: string;
  hub: string;
  path: string;
}

/**
 * A `WebPubSubServerAdapter` which replaces original `WebSocket.Server` to communicate between the GraphQL server and the Azure Web PubSub service
 * `clientConnections` records the mapping from the `connectionId` of each client to its corresponding logical `ClientConnectionContext`.
 */
export class WebPubSubServerAdapter extends VirtualWebSocketServer {
  path: string;
  clientConnections: Map<string, ClientConnectionContext> = new Map();
  serviceClient: WebPubSubServiceClient;

  constructor(
    options: WebPubSubServerAdapterOptions,
    expressApp: core.Express
  ) {
    super();
    this.serviceClient = new WebPubSubServiceClient(
      options.connectionString,
      options.hub, 
      { allowInsecureConnection: true }
    );
    let handler = new WebPubSubEventHandler(options.hub, ["*"], {
      path: options.path,
      handleConnect: (req, res) => {
        let connectionId = req.context.connectionId;
        this.clientConnections.set(
          connectionId,
          new ClientConnectionContext(this.serviceClient, connectionId)
        );
        this.emit("connection", this.clientConnections.get(connectionId), req);
        res.success({
          subprotocol: "graphql-ws",
        });
      },
      onConnected: async (req) => {
        console.log(
          `connectionId = ${req.context.connectionId} is connected with Web PubSub service`
        );
      },
      handleUserEvent: async (req, res) => {
        let connectionId = req.context.connectionId;
        if (this.clientConnections.has(connectionId)) {
          this.clientConnections.get(connectionId).emit("message", req.data);
        }
        return res.success();
      },
      onDisconnected: async (req) => {
        let connectionId = req.context.connectionId;
        if (this.clientConnections.has(connectionId)) {
          this.clientConnections.get(connectionId).readyState = WebSocket.CLOSED;
          this.clientConnections.delete(connectionId);
        }
      },
    });
    expressApp.use(handler.getMiddleware());
    this.path = handler.path;
  }

  async getSubscriptionPath() {
    let token = await this.serviceClient.getAuthenticationToken();
    return token.baseUrl;
  }
}