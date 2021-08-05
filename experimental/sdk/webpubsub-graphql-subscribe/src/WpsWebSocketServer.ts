import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";
import { ApolloServer} from "apollo-server-express";
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import WebSocket from "ws";
import { WpsPubSub } from "./azure-wps-pubsub";

/**
  * a virtual WebSocket.Server without real server
 */
class VirtualWebSocketServer extends WebSocket.Server{
	protocol: string = "graphql-ws";
	readyState: number = WebSocket.OPEN;

	constructor() {
		 super({port: undefined, noServer: true}); 
	}
}

/** 
  * A VirtualWebSocketServer which is binded to an Azure Web PubSub client connection according to `servecClient` and `connectionId`
  * It overrides method `send` and send all message to its binded connection in JSON format.
 */
class ClientConnectionContext extends VirtualWebSocketServer{
	serviceClient: WebPubSubServiceClient;
	connectionId: string;

	constructor(serviceClient: WebPubSubServiceClient, connectionId: string) {
		super();
		this.serviceClient = serviceClient;
		this.connectionId = connectionId;
	}

	send(data: any) { this.serviceClient.sendToConnection(this.connectionId, data, { contentType: "text/plain" }); }
}

/** 
  * A `VirtualWebSocketServer` which replaces original `WebSocket.Server` to communicate between the server and WebPub service using HTTP protocol
  * `connectionId_to_ws` records the mapping from the `connectionId` of each client to its corrsponding `ClientConnectionContext`.
  * Finally `ClientConnectionContext` sends messages to Web PubSub service.
  * 
 */
class ConnectionContext extends VirtualWebSocketServer {
	app: any;
	connectionIdToWs: Map<string, ClientConnectionContext> = new Map();
	serviceClient: WebPubSubServiceClient;

	constructor(wpsConnString: string, options: any, expressApp?: any){
	// constructor(wpsHttpPort: number, wpsConnString: string, hubName: string, expressApp?: any){
		super();
		this.serviceClient = new WebPubSubServiceClient(wpsConnString, options.hubName);
		this.app = expressApp ? expressApp : express();

		let handler = new WebPubSubEventHandler(options.hubName, ['*'], {
			path: options.eventHandlerUrl,
			handleConnect: (req, res) => {
				let connectionId = req.context.connectionId;
				this.connectionIdToWs.set(connectionId, new ClientConnectionContext(this.serviceClient, connectionId));
				this.emit("connection", this.connectionIdToWs.get(connectionId), req);
				res.success({
					groups: ['users'],	// join into <groups>
					subprotocol: "graphql-ws"
				});
			},

			onConnected: async req => {
				console.log(`userId = ${req.context.connectionId} is connected with Web PubSub service`);
			}, 

			handleUserEvent: async (req, res) => {
				if (req.context.eventName === 'message') {	// connection ? message ? 
					let connectionId = req.context.connectionId;
					if (this.connectionIdToWs.has(connectionId)) {
						this.connectionIdToWs.get(connectionId).emit("message", req.data);
						return res.success();
					}
			  	}
			  	return res.success();
			},

			onDisconnected: async req => {
				let connectionId = req.context.connectionId;
				if (this.connectionIdToWs.has(connectionId)) {
					this.connectionIdToWs.get(connectionId).readyState = WebSocket.CLOSED;
					this.connectionIdToWs.delete(connectionId);
				}
			}, 
		});
		this.app.use(handler.getMiddleware());
		this.app.listen(options.httpPort, () => { });
	}
	
	async getWebSocketUrl() {
		let token = await this.serviceClient.getAuthenticationToken({ userId: `ApolloServer-${uuidv4()}` } );
		return token.url;
	}
}

/**
 * Create a `ConnectionContext` and initialize a `WpsPubSub` 
 */
async function getWebPubSubServerOptions(apolloServer: ApolloServer, pubsub: WpsPubSub, wpsConnString: any, options: any) {
	var wpsServer = new ConnectionContext(wpsConnString, options);
	apolloServer.subscriptionsPath = await wpsServer.getWebSocketUrl();
	await pubsub.initWebSocket();
	return wpsServer;
}

export { ConnectionContext, getWebPubSubServerOptions};