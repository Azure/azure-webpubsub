import { WebPubSubServiceClient } from "@azure/web-pubsub";
import {
	Adapter as NativeInMemoryAdapter,
	BroadcastOptions,
	Room,
	SocketId,
} from "socket.io-adapter";
import { Namespace, Server as SioServer } from "socket.io";

/**
 * Socket.IO Server uses method `io.Adapter(AdapterClass))` to set the adapter. `AdatperClass` is not an instansized object, but a class.
 * The actual adapter is instansized inside server logic.
 * Thus its constructor parameters of the adapter class is out of our control.
 * So a proxy class is necessary to wrap the adapter class for customimzed constructor parameters.
 * How to use:
 *  1. Instansize a `WebPubSubAdapterProxy` object: `const webPubSubAdapterProxy = new WebPubSubAdapterProxy(extraOptions);`
 *  2. Set the adapter: `io.adapter(WebPubSubAdapterProxy);`, thus additional options are controllable.
 */
export class WebPubSubAdapterProxy {
	constructor(extraArgForWpsAdapter: any) {
		var proxyHandler = {
			construct: (target, args) =>
				new target(...args, extraArgForWpsAdapter),
		};
		return new Proxy(WebPubSubAdapterInternal, proxyHandler);
	}
}

export class WebPubSubAdapterInternal extends NativeInMemoryAdapter {
	/**
	 * Azure Web PubSub Socket.IO Adapter constructor.
	 *
	 * @param {Namespace} nsp
	 */
	constructor(readonly nsp: any, extraArgForWpsAdapter: any) {
		super(nsp);
	}

	private getEioSocketSid(sioSid: string): string {
		throw new Error("Not implemented");
	}

	/**
	 * Broadcasts a packet.
	 *
	 * Options:
	 *  - `flags` {Object} flags for this packet
	 *  - `except` {Array} sids that should be excluded
	 *  - `rooms` {Array} list of rooms to broadcast to
	 *
	 * @param {Object} packet   the packet object
	 * @param {Object} opts     the options
	 * @public
	 */
	public override broadcast(packet: any, opts: BroadcastOptions): void {}

	/**
	 * Makes the matching socket instances join the specified rooms
	 *
	 * @param opts - the filters to apply
	 * @param rooms - the rooms to join
	 */
	public addSockets(opts: BroadcastOptions, rooms: Room[]): void {}

	/**
	 * Adds a socket to a list of room.
	 *
	 * @param {SocketId}  id      the socket id
	 * @param {Set<Room>} rooms   a set of rooms
	 * @public
	 */
	public async addAll(id: SocketId, rooms: Set<Room>): Promise<void> {}

	/**
	 * Removes a socket from a room.
	 *
	 * @param {SocketId} id     the socket id
	 * @param {Room}     room   the room name
	 */
	public del(id: SocketId, room: Room): Promise<void> | void {}

	/**
	 * Removes a socket from all rooms it's joined.
	 *
	 * @param {SocketId} id   the socket id
	 */
	public delAll(id: SocketId): void {}

	/**
	 * Broadcasts a packet and expects multiple acknowledgements.
	 *
	 * Options:
	 *  - `flags` {Object} flags for this packet
	 *  - `except` {Array} sids that should be excluded
	 *  - `rooms` {Array} list of rooms to broadcast to
	 *
	 * @param {Object} packet   the packet object
	 * @param {Object} opts     the options
	 * @param clientCountCallback - the number of clients that received the packet
	 * @param ack                 - the callback that will be called for each client response
	 *
	 * @public
	 */
	public broadcastWithAck(
		packet: any,
		opts: BroadcastOptions,
		clientCountCallback: (clientCount: number) => void,
		ack: (...args: any[]) => void
	) {
		throw new Error("Not implemented");
	}

	/**
	 * Gets a list of sockets by sid.
	 *
	 * @param {Set<Room>} rooms   the explicit set of rooms to check.
	 */
	public sockets(rooms: Set<Room>): Promise<Set<SocketId>> {
		// const sids = new Set<SocketId>();
		// this.apply({ rooms }, (socket) => {
		//     sids.add(socket.id);
		// });
		// return Promise.resolve(sids);
		throw new Error("Not implemented");
	}

	// Unsupported Methods

	/**
	 * Gets the list of rooms a given socket has joined.
	 *
	 * @param {SocketId} id   the socket id
	 */
	public socketRooms(id: SocketId): Set<Room> | undefined {
		throw new Error("Not implemented");
	}
	/**
	 * Returns the matching socket instances
	 *
	 * @param opts - the filters to apply
	 */
	public fetchSockets(opts: BroadcastOptions): Promise<any[]> {
		throw new Error("Not implemented");
	}

	/**
	 * Makes the matching socket instances leave the specified rooms
	 *
	 * @param opts - the filters to apply
	 * @param rooms - the rooms to leave
	 */
	public delSockets(opts: BroadcastOptions, rooms: Room[]): void {
		throw new Error("Not implemented");
	}
	/**
	 * Send a packet to the other Socket.IO servers in the cluster
	 * @param packet - an array of arguments, which may include an acknowledgement callback at the end
	 */
	public override serverSideEmit(packet: any[]): void {
		throw new Error("Not implemented");
	}

	/**
	 * Makes the matching socket instances disconnect
	 *
	 * @param opts - the filters to apply
	 * @param close - whether to close the underlying connection
	 */
	public disconnectSockets(opts: BroadcastOptions, close: boolean): void {
		throw new Error("Not implemented");
	}
}
