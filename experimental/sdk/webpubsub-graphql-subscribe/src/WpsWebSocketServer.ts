
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";
import { ApolloServer} from "apollo-server-express";
import { execute, GraphQLSchema, subscribe } from "graphql";
import { SubscriptionServer } from 'subscriptions-transport-ws';
import express from 'express';
import WebSocket from "ws";
import { WpsPubSub } from "./azure-wps-pubsub";
import {LOG, log, config} from "./utils"

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
class SubWpsWebSocketServer extends VirtualWebSocketServer{
	serviceClient: WebPubSubServiceClient;
	connectionId: string;

	constructor(serviceClient: WebPubSubServiceClient, connectionId: string) {
		super();
		this.serviceClient = serviceClient;
		this.connectionId = connectionId;
	}

	@LOG("[send] [SubWsServer]")
	send(data: any) { this.serviceClient.sendToConnection(this.connectionId, JSON.parse(data)); }
}

/** 
  * A `VirtualWebSocketServer` which replaces original `WebSocket.Server` to communicate between the server and WebPub service using HTTP protocol
  * `connectionId_to_ws` records the mapping from the `connectionId` of each client to its corrsponding `SubWpsWebSocketServer`.
  * Finally `SubWpsWebSocketServer` sends messages to Web PubSub service.
  * 
 */
class WpsWebSocketServer extends VirtualWebSocketServer {
	app: any;
	connectionId_to_ws: { [key:string]: SubWpsWebSocketServer } = {};
	serviceClient: WebPubSubServiceClient;

	constructor(wps_http_port: number, wps_conn_string: string, hub_name: string, express_server?: any){
		super();
		this.serviceClient = new WebPubSubServiceClient(wps_conn_string, hub_name);
		this.app = express_server ? express_server : express();

		let handler = new WebPubSubEventHandler(hub_name, ['*'], {
			path: config.DEFAULT_WPS_MAIN_HANDLER_URL,
			handleConnect: (req, res) => {
				log(`[begin] handleConnect`);
				let connectionId = req.context.connectionId;
				this.connectionId_to_ws[connectionId] = new SubWpsWebSocketServer(this.serviceClient, connectionId);
				this.emit("connection", this.connectionId_to_ws[connectionId], req);
				res.success({
					groups: ['users'],	// join into <groups>
					subprotocol: "graphql-ws"
				});
				this.readyState = WebSocket.OPEN;
				log(`[ end ] handleConnect`);
			},

			onConnected: async req => {
				log(`[onConnected] ${req.context.userId}`);
			}, 

			handleUserEvent: async (req, res) => {
				log(`[begin] handleUserEvent = ${req.context.eventName}`);
				if (req.context.eventName === 'message') {	// connection ? message ? 
					this.connectionId_to_ws[req.context.connectionId].emit("message", req.data);
			  	}
			  	res.success();
				log(`[ end ] handleUserEvent = ${req.context.eventName}`);
			},

			onDisconnected: async req => {
				if (req.context.connectionId in Object.keys(this.connectionId_to_ws)) {
					this.connectionId_to_ws[req.context.connectionId].readyState = WebSocket.CLOSED;
					log(`[onDisconnected] ${req.context.userId}`);
				}
			}, 
		});
		this.app.use(handler.getMiddleware());
		this.app.get('/', (req:any, res:any) => { res.send("WpsWebSocketServer"); });
		this.app.listen(wps_http_port, () => {
			log(`Web PubSub EventHandler HTTP Server started at http://localhost:${wps_http_port}`);
		});
	}
	
	async getWebSocketUrl(id:string ="apol") {
		let token = await this.serviceClient.getAuthenticationToken({ userId: id });
		return token.url;
	}

}


/**
 * Create a `subscriptionServer` based on `class WpsWebSocketServer` and initialize `pubsub`
 */
async function create_webpubsub_subscribe_server(apolloServer: ApolloServer, schema: GraphQLSchema, pubsub: WpsPubSub, webpubsub_conn_string: string) {
	var wpsServer = new WpsWebSocketServer(config.DEFAULT_WPS_HTTP_PORT, webpubsub_conn_string, config.DEFAULT_WPS_MAIN_PUB);
	apolloServer.subscriptionsPath = await wpsServer.getWebSocketUrl();
	await pubsub.initWebSocket();
	SubscriptionServer.create(
		{ schema, execute, subscribe },
		wpsServer
	);
}

export { WpsWebSocketServer, create_webpubsub_subscribe_server};


/**
 * use Azure Web PubSub service to handle GraphQL subscriptions query in Apollo server
 * create WpsWebSocketServer, set the `subscriptionsPath`
 * use `installSubscriptionHandlers` to make `wpsServer` handle GraphQL subsciption query
 */
// async function applyWpsToApolloServer(apolloServer: ApolloServer, config:any) {
// 	var wpsServer = new WpsWebSocketServer(config.DEFAULT_WPS_HTTP_PORT, config.DEFAULT_WPS_CONN_STRING, config.DEFAULT_WPS_MAIN_PUB);
// 	apolloServer.subscriptionsPath = await wpsServer.getWebSocketUrl();
// 	apolloServer.installSubscriptionHandlers(wpsServer);
// }

// export default WpsWebSocketServer;
