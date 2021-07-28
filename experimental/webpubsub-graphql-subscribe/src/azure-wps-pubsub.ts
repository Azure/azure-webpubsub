import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { EventEmitter } from 'events';
import { PubSubEngine } from './graphql-pubsub-common/pubsub-engine';
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

/* ---------------------------- Original pubsub.ts ----------------------------
import { EventEmitter } from 'events';
import { PubSubEngine } from './pubsub-engine';

export interface PubSubOptions {
  eventEmitter?: EventEmitter;
}

export class PubSub extends PubSubEngine {
  protected ee: EventEmitter;
  private subscriptions: { [key: string]: [string, (...args: any[]) => void] };
  private subIdCounter: number;

  constructor(options: PubSubOptions = {}) {
    super();
    this.ee = options.eventEmitter || new EventEmitter();
    this.subscriptions = {};
    this.subIdCounter = 0;
  }

  public publish(triggerName: string, payload: any): Promise<void> {
    this.ee.emit(triggerName, payload);
    return Promise.resolve();
  }

  public subscribe(triggerName: string, onMessage: (...args: any[]) => void): Promise<number> {
    this.ee.addListener(triggerName, onMessage);
    this.subIdCounter = this.subIdCounter + 1;
    this.subscriptions[this.subIdCounter] = [triggerName, onMessage];

    return Promise.resolve(this.subIdCounter);
  }

  public unsubscribe(subId: number) {
    const [triggerName, onMessage] = this.subscriptions[subId];
    delete this.subscriptions[subId];
    this.ee.removeListener(triggerName, onMessage);
  }
}
*/

/*
constructor(app: any) {
	super();
	this.subscriptions = {};
	this.subIdCounter = 0;
	
	this.serviceClient = new WebPubSubServiceClient(config.DEFAULT_WPS_CONN_STRING, config.DEFAULT_WPS_PUBSUB_PUB);
	this.wps_userId = `pubsubEngine-${uuidv4()}`;
	this.ws = undefined;
	this.ackId = 1;

	let handler = new WebPubSubEventHandler(config.DEFAULT_WPS_PUBSUB_PUB, ['*'], {
		path: config.DEFAULT_PUBSUB_ENGINE_HANDLER_URL,
		handleConnect: (req, res) => {
			log("handleConnect req.context = ", req.context)
			res.success({groups: ['pubsub-users'],	subprotocol: "json.webpubsub.azure.v1"});
		},

		onConnected: async req => {
			log(`onConnected`);
		}, 

		handleUserEvent: async (req, res) => {
			log("handleUserEvent", req.data);
			res.success();
		},

		onDisconnected: async req => {
			log(`[onDisconnected] ${req.context.userId}`);
		}
	});
	app.use(handler.getMiddleware());
}
}
*/