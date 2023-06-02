// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Packet } from "engine.io-parser";
import { Namespace } from "socket.io";
import {
  Adapter as NativeInMemoryAdapter,
  BroadcastOptions,
  Room,
  SocketId,
} from "socket.io-adapter";

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
  constructor(extraArgForWpsAdapter: string) {
    const proxyHandler = {
      construct: (target, args) => new target(...args, extraArgForWpsAdapter),
    };
    return new Proxy(WebPubSubAdapterInternal, proxyHandler);
  }
}

export class WebPubSubAdapterInternal extends NativeInMemoryAdapter {
  /**
   * Azure Web PubSub Socket.IO Adapter constructor.
   *
   * @param nsp - Namespace
   * @param extraArgForWpsAdapter - extra argument for WebPubSubAdapter
   */
  constructor(readonly nsp: Namespace, extraArgForWpsAdapter: string) {
    super(nsp);
  }

  private getEioSocketSid(sioSid: string): string {
    throw new Error("Not implemented");
  }

  /**
   * Broadcasts a packet.
   *
   * @param packet - the packet object
   * @param opts - the options
   */
  public override broadcast(packet: Packet, opts: BroadcastOptions): void {
    // TODO: Implement this method.
    // For now, it is intentionally empty.
  }

  /**
   * Makes the matching socket instances join the specified rooms
   *
   * @param opts - the filters to apply
   * @param rooms - the rooms to join
   */
  public addSockets(opts: BroadcastOptions, rooms: Room[]): void {
    // TODO: Implement this method.
    // For now, it is intentionally empty.
  }

  /**
   * Adds a socket to a list of room.
   *
   * @param id - the socket id
   * @param rooms - a set of rooms
   */
  public async addAll(id: SocketId, rooms: Set<Room>): Promise<void> {
    // TODO: Implement this method.
    // For now, it is intentionally empty.
  }

  /**
   * Removes a socket from a room.
   *
   * @param id - the socket id
   * @param room - the room name
   */
  public del(id: SocketId, room: Room): Promise<void> | void {
    // TODO: Implement this method.
    // For now, it is intentionally empty.
  }

  /**
   * Removes a socket from all rooms it's joined.
   *
   * @param id - the socket id
   */
  public delAll(id: SocketId): void {
    // TODO: Implement this method.
    // For now, it is intentionally empty.
  }

  /**
   * Broadcasts a packet and expects multiple acknowledgements.
   *
   * @param packet - the packet object
   * @param opts - the options
   * @param clientCountCallback - the number of clients that received the packet
   * @param ack - the callback that will be called for each client response
   */
  public broadcastWithAck(
    packet: Packet,
    opts: BroadcastOptions,
    clientCountCallback: (clientCount: number) => void,
    ack: (...args: any[]) => void
  ): void {
    throw new Error("Not implemented");
  }

  /**
   * Gets a list of sockets by sid.
   *
   * @param rooms - the explicit set of rooms to check.
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
   * @param id - the socket id
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
