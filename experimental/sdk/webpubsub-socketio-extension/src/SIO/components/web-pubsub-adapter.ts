// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule } from "../../common/utils";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { Packet, Encoder } from "socket.io-parser";
import { Namespace, Server as SioServer } from "socket.io";
import { Adapter as NativeInMemoryAdapter, BroadcastOptions, Room, SocketId } from "socket.io-adapter";
import base64url from "base64url";

const debug = debugModule("wps-sio-ext:SIO:Adapter");

const GROUP_DELIMITER = String.fromCharCode(31);
const NotImplementedError = new Error("Not Implemented. This feature will be available in further version.");
const NotSupportedError = new Error("Not Supported.");

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
  public serivce: WebPubSubServiceClient;
  public sioServer: SioServer;

  constructor(serviceClient: WebPubSubServiceClient) {
    this.serivce = serviceClient;

    const proxyHandler = {
      construct: (target, args) => new target(...args, serviceClient),
    };
    return new Proxy(WebPubSubAdapterInternal, proxyHandler);
  }
}

export class WebPubSubAdapterInternal extends NativeInMemoryAdapter {
  public service: WebPubSubServiceClient;
  private _encoder: Encoder;

  /**
   * Azure Web PubSub Socket.IO Adapter constructor.
   *
   * @param nsp - Namespace
   * @param extraArgForWpsAdapter - extra argument for WebPubSubAdapter
   */
  constructor(readonly nsp: Namespace, serviceClient: WebPubSubServiceClient) {
    debug(`constructor nsp.name = ${nsp.name}, serviceClient = ${serviceClient}`);
    super(nsp);
    this.service = serviceClient;
    // Fixed to use the default encoder https://github.com/socketio/socket.io-adapter
    this._encoder = new Encoder();
  }

  /**
   * Broadcasts a packet.
   *
   * @param packet - the packet object
   * @param opts - the options
   */
  public override async broadcast(packet: Packet, opts: BroadcastOptions): Promise<void> {
    debug(`broadcast packet ${JSON.stringify(packet)}`);

    // Modified from https://github.com/socketio/socket.io-adapter/blob/2.5.2/lib/index.ts#L233
    const encodedPackets = this._encoder.encode(packet);

    const oDataFilter = this._buildODataFilter(opts.rooms, opts.except);

    debug(`broadcast encodedPackets = ${encodedPackets}, oDataFilter = ${oDataFilter}`);

    const packets = Array.isArray(encodedPackets) ? encodedPackets : [encodedPackets];
    var sendOptions = { filter: oDataFilter };
    for (let encodedPacket of packets) {
      if (typeof encodedPacket === "string") {
        encodedPacket = "4" + encodedPacket.toString();
        sendOptions["contentType"] = "text/plain";
      } else {
        sendOptions["contentType"] = "application/octet-stream";
      }

      await this.service.sendToAll(encodedPacket, sendOptions);
    }
  }

  /**
   * Makes the matching socket instances join the specified rooms
   *
   * @param opts - the filters to apply
   * @param rooms - the rooms to join
   */
  public addSockets(opts: BroadcastOptions, rooms: Room[]): void {
    throw NotImplementedError;
  }

  /**
   * Adds a socket to a list of room.
   *
   * @param id - the socket id
   * @param rooms - a set of rooms
   */
  public async addAll(id: SocketId, rooms: Set<Room>): Promise<void> {
    // TODO: RT should support a new API AddConnectionsToGroups
    debug(`addAll SocketId = ${id}, |rooms| = ${rooms.size}`);

    const eioSid = this._getEioSid(id);

    // TODO: Temporary mitigation. This behaviour should be taken only one time and by service
    rooms = rooms.add(""); // add namespace default room

    for (const room of rooms) {
      const groupName = this._getGroupName(this.nsp.name, room);
      debug(
        `Try to add connection ${eioSid} to group ${groupName}, convert from ns#room = ${this.nsp.name}#${room}, SocketId = ${id}`
      );

      await this.service.group(groupName).addConnection(eioSid);
    }
  }

  /**
   * Removes a socket from a room.
   *
   * @param id - the socket id
   * @param room - the room name
   */
  public del(id: SocketId, room: Room): Promise<void> | void {
    debug(`del SocketId = ${id}, room = ${room}`);
    const eioSid = this._getEioSid(id);
    const groupName = this._getGroupName(this.nsp.name, room);
    debug(
      `Try to remove connection ${eioSid} from group ${groupName}, convert from ns#room = ${this.nsp.name}#${room}, SocketId = ${id}`
    );
    this.service.group(groupName).removeConnection(eioSid);
  }

  /**
   * Removes a socket from all rooms it's joined.
   *
   * @param id - the socket id
   */
  public delAll(id: SocketId): void {
    debug(`delAll SocketId = ${id}`);

    const eioSid = this._getEioSid(id);
    const groupName = this._getGroupName(this.nsp.name, "");
    debug(
      `Try to remove connection ${eioSid} from group ${groupName}, convert from ns#room = ${this.nsp.name}#, SocketId = ${id}`
    );
    this.service.group(groupName).removeConnection(eioSid);
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
    throw NotImplementedError;
  }

  /**
   * Gets a list of sockets by sid.
   *
   * @param rooms - the explicit set of rooms to check.
   */
  public sockets(rooms: Set<Room>): Promise<Set<SocketId>> {
    throw NotSupportedError;
  }

  // Unsupported Methods

  /**
   * Gets the list of rooms a given socket has joined.
   *
   * @param id - the socket id
   */
  public socketRooms(id: SocketId): Set<Room> | undefined {
    throw NotSupportedError;
  }
  /**
   * Returns the matching socket instances
   *
   * @param opts - the filters to apply
   */
  public fetchSockets(opts: BroadcastOptions): Promise<any[]> {
    throw NotSupportedError;
  }

  /**
   * Makes the matching socket instances leave the specified rooms
   *
   * @param opts - the filters to apply
   * @param rooms - the rooms to leave
   */
  public delSockets(opts: BroadcastOptions, rooms: Room[]): void {
    throw NotImplementedError;
  }

  /**
   * Send a packet to the other Socket.IO servers in the cluster
   * @param packet - an array of arguments, which may include an acknowledgement callback at the end
   */
  public override serverSideEmit(packet: any[]): void {
    throw NotSupportedError;
  }

  /**
   * Makes the matching socket instances disconnect
   *
   * @param opts - the filters to apply
   * @param close - whether to close the underlying connection
   */
  public disconnectSockets(opts: BroadcastOptions, close: boolean): void {
    throw NotSupportedError;
  }

  /**
   * Generates OData filter string for Web PubSub service from a set of rooms and a set of exceptions
   * @param rooms - a set of Rooms to include
   * @param except - a set of Rooms to exclude
   * @returns OData - filter string
   */
  private _buildODataFilter(rooms: Set<string>, excepts: Set<string> | undefined): string {
    debug("_buildODataFilter");
    let allowFilter = "";
    let room_idx = 0,
      except_idx = 0;

    if (rooms.size === 0) rooms = new Set([""]);
    for (const room of rooms) {
      const groupName = this._getGroupName(this.nsp.name, room);
      allowFilter += `'${groupName}' in groups` + (room_idx === rooms.size - 1 ? "" : " or ");
      room_idx++;
    }

    let denyFilter = "";
    if (excepts) {
      for (const except of excepts) {
        const exceptGroupName = this._getGroupName(this.nsp.name, except);
        denyFilter += `not ('${exceptGroupName}' in groups)` + (except_idx === excepts.size - 1 ? "" : " and ");
        except_idx++;
      }
    }

    let result = "";
    if (allowFilter.length > 0) {
      result = allowFilter + (denyFilter.length > 0 ? " and " + denyFilter : "");
    } else result = denyFilter.length > 0 ? `${denyFilter}` : "";
    debug(`_buildODataFilter result = ${result}`);
    return result;
  }

  private _getEioSid(sioSid: string): string {
    return (this.nsp.sockets.get(sioSid).conn as any).id;
  }

  /**
   * `namespace` and `room` are concpets from Socket.IO.
   * `group` is a concept from Azure Web PubSub.
   */
  private _getGroupName(namespace: string, room?: string): string {
    const ret = namespace + GROUP_DELIMITER + (room && room.length ? room : "");
    debug(`convert namespace::room ${namespace}::${room} => ${ret}`);
    return base64url(ret);
  }
}
