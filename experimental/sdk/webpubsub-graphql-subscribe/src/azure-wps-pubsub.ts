import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { EventEmitter } from 'events';
import { PubSubEngine } from 'graphql-subscriptions'

import { LOG , log, config} from './utils';
import { v4 as uuidv4 } from 'uuid';
const WebSocket = require('ws');

export interface PubSubOptions {
	eventEmitter?: EventEmitter;
}


/** 
  * `WpsPubsub` implements the `PubSubEngine` Interface from the `graphql-subscriptions` package using Azure Web PubSub service.
  * It replaces the original in-memory event system `PubSub` and 
  * allows you to connect your subscriptions manager to an Azure Web PubSub service to support multiple subscription manager instances.
 */
export class WpsPubSub extends PubSubEngine {
	protected ee: EventEmitter;
	subscriptions: { [key: string]: [string, (...args: any[]) => void] } = {};
	subIdCounter: number = 0;
	ackId: number = 1;
	serviceClient: WebPubSubServiceClient;
	wps_userId: string;
	ws: any;
	
	constructor(webpubsub_conn_string: string) {
		super();
		this.serviceClient = new WebPubSubServiceClient(webpubsub_conn_string, config.DEFAULT_WPS_PUBSUB_PUB);
		this.wps_userId = `pubsubEngine-${uuidv4()}`;
		this.ws = undefined;
	}

	public static get_eventName(eventName: string) { return `event-${eventName}`}

	@LOG("[wpsPubSub] initWebSocket")
	public async initWebSocket() {
		let token = await this.serviceClient.getAuthenticationToken({ 
			userId: this.wps_userId, 
			roles: ["webpubsub.joinLeaveGroup", "webpubsub.sendToGroup"]}
		);
		log(`[wps-pubsub-ws-url] = ${token.url.substr(0, 30)}..., [userId] = ${this.wps_userId}`);
		this.ws = new WebSocket(token.url, "json.webpubsub.azure.v1");
		return new Promise((resolve:any, reject:any) => {
			this.ws.on('open', () => { 
				log('wps-pubsub connected');
				log(`[ end ] [initWebSocket] isOpen = ${this.ws.readyState === WebSocket.OPEN}`);
				resolve();
			});
			this.ws.on('message', (req: any) => {
				req = JSON.parse(req);
				log(`onMessage req = `, req, `req.type = ${req.type}`);
				if (req.type === "message") {
					this.ws.emit(req.group, req.data);
				}
			})
			this.ws.on('error', (err: any) => {
				log(err);
				reject(err);
			});
			
		});
	}


	public async publish(eventName: string, payload: any): Promise<void> {
		log(`publish <${eventName}> `, payload, ` ackId= ${this.ackId} isOpen= ${this.ws.readyState === WebSocket.OPEN} `);

		this.ws.send(JSON.stringify({
			type: "sendToGroup",
			group: WpsPubSub.get_eventName(eventName),
			data: payload,
			// ackId: this.ackId
		}));
		this.ackId++;
		return Promise.resolve();
	}

	public async subscribe(eventName: string, onMessage: (...args: any[]) => void): Promise<number> {
		log(`subscribe <${eventName}> ackId= ${this.ackId} isOpen= ${this.ws.readyState === WebSocket.OPEN}`);

		this.subIdCounter = this.subIdCounter + 1;
		this.subscriptions[this.subIdCounter] = [eventName, onMessage];
		this.ws.send(JSON.stringify({
			type: "joinGroup",
			group: WpsPubSub.get_eventName(eventName),
			// ackId: this.ackId
		}));
		this.ackId++;
		this.ws.addListener(WpsPubSub.get_eventName(eventName), onMessage);
		return Promise.resolve(this.subIdCounter);
	}

	public unsubscribe(subId: number) {
		const [eventName, onMessage] = this.subscriptions[subId];
		delete this.subscriptions[subId];

		this.ws.send(JSON.stringify({
			type: "leaveGroup",
			group: WpsPubSub.get_eventName(eventName),
		}));
		this.ws.removeListener(WpsPubSub.get_eventName(eventName), onMessage);
	}
}