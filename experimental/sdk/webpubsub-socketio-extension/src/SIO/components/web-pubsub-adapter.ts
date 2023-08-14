// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule, toOptionsString, toString } from "../../common/utils";
import { getSingleEioEncodedPayload } from "./encoder";
import { Packet as SioPacket, PacketType as SioPacketType, Decoder as SioDecoder } from "socket.io-parser";
import * as EioParser from "engine.io-parser";
import { Namespace, Server as SioServer } from "socket.io";
import { Adapter as NativeInMemoryAdapter, BroadcastOptions, Room, SocketId } from "socket.io-adapter";
import { WebPubSubServiceCaller } from "../../serverProxies";
import { Mutex, MutexInterface } from "async-mutex";
import base64url from "base64url";
import { TextDecoder } from "util";

const debug = debugModule("wps-sio-ext:SIO:Adapter");

const GROUP_DELIMITER = "~";
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
  public serivce: WebPubSubServiceCaller;
  public sioServer: SioServer;

  constructor(serviceClient: WebPubSubServiceCaller) {
    this.serivce = serviceClient;

    const proxyHandler = {
      construct: (target, args) => new target(...args, serviceClient),
    };
    return new Proxy(WebPubSubAdapterInternal, proxyHandler);
  }
}

export class WebPubSubAdapterInternal extends NativeInMemoryAdapter {
  public service: WebPubSubServiceCaller;
  private _roomOperationLock: Map<SocketId, Mutex> = new Map();
  private _sioDecoder: SioDecoder;
  private _utf8Decoder = new TextDecoder("utf-8");

  /**
   * Azure Web PubSub Socket.IO Adapter constructor.
   *
   * @param nsp - Namespace
   * @param extraArgForWpsAdapter - extra argument for WebPubSubAdapter
   */
  constructor(readonly nsp: Namespace, serviceClient: WebPubSubServiceCaller) {
    debug(`constructor nsp.name = ${nsp.name}, serviceClient = ${serviceClient}`);
    super(nsp);
    this.service = serviceClient;
    this._sioDecoder = new SioDecoder();
  }

  /**
   * Broadcasts a packet.
   *
   * @param packet - the packet object
   * @param opts - the options
   */
  public override async broadcast(packet: SioPacket, opts: BroadcastOptions): Promise<void> {
    debug(`broadcast, start, packet = ${JSON.stringify(packet)},\
opts = ${toOptionsString(opts)}, namespace = "${this.nsp.name}"`);
    try {
      packet.nsp = this.nsp.name;

      const encodedPayload = await getSingleEioEncodedPayload(packet);

      // optimize
      if (opts.rooms.size === 1) {
        const oDataFilter = this._buildODataFilterForExceptsOnly(opts.except);
        const sendOptions = { filter: oDataFilter, contentType: "text/plain" };
        debug(`broadcast, encodedPayload = "${encodedPayload}", sendOptions = "${JSON.stringify(sendOptions)}"`);
        const encodedGroupName = this._getGroupName(this.nsp.name, opts.rooms.values().next().value);
        await this.service.group(encodedGroupName).sendToAll(encodedPayload, sendOptions);
        debug(`broadcast, finish`);
      } else {
        const oDataFilter = this._buildODataFilter(opts.rooms, opts.except);
        const sendOptions = { filter: oDataFilter, contentType: "text/plain" };
        debug(`broadcast, encodedPayload = "${encodedPayload}", sendOptions = "${JSON.stringify(sendOptions)}"`);
        await this.service.sendToAll(encodedPayload, sendOptions);
        debug(`broadcast, finish`);
      }
    } catch (e) {
      debug(`broadcast, error, packet = ${JSON.stringify(packet)},\
opts = ${toOptionsString(opts)}, namespace = "${this.nsp.name}", error = ${e}`);
    }
  }

  /**
   * Makes the matching socket instances join the specified rooms
   *
   * @param opts - the filters to apply
   * @param rooms - the rooms to join
   */
  public async addSockets(opts: BroadcastOptions, rooms: Room[]): Promise<void> {
    debug(`addSockets, start, rooms = ${toString(rooms)}, opts = ${toOptionsString(opts)}`);
    const localSockets = await super.fetchSockets(opts);
    try {
      const oDataFilter = this._buildODataFilter(opts.rooms, opts.except);
      const groupNames = Array.from(rooms).map((room) => this._getGroupName(this.nsp.name, room));
      await this.service.addConnectionsToGroups(groupNames, oDataFilter);
      debug(`addSockets, call API addConnectionsToGroups, finish, \
rooms = ${toString(rooms)}, opts = ${toOptionsString(opts)}`);
      super.addSockets(opts, rooms);
    } catch (e) {
      debug(`addSockets, error, rooms = ${toString(rooms)}, opts = ${toOptionsString(opts)}, \
error.message = ${e.message}, error = ${e}`);
    }
  }

  /**
   * Adds a socket to a list of room.
   *
   * @param id - the socket id
   * @param rooms - a set of rooms
   */
  public async addAll(id: SocketId, rooms: Set<Room>): Promise<void> {
    debug(`addAll, start, id = ${id}, rooms = ${toString(rooms)}}`);
    const release = await this._getLock(id);
    try {
      const eioSid = this._getEioSid(id);
      const connectionFilter = `connectionId eq '${eioSid}'`;
      const groupNames = Array.from(rooms).map((room) => this._getGroupName(this.nsp.name, room));

      debug(`addAll, connectionFilter = "${connectionFilter}", groupNames = "${toString(groupNames)}"`);
      await this.service.addConnectionsToGroups(groupNames, connectionFilter);

      debug(`addAll, call API AddConnectionsToGroups, finish, \
groupNames = ${toString(rooms)}, connectionId(eioSid) = ${this._getEioSid(id)}`);
      super.addAll(id, rooms);
    } catch (e) {
      debug(`addAll, error, SocketId = ${id}, rooms = ${toString(rooms)}, error = ${e}`);
    } finally {
      release();
    }
    debug(`addAll, finish, SocketId = ${id}, rooms = ${toString(rooms)}, id.rooms = ${toString(this.sids.get(id))}`);
  }

  /**
   * Removes a socket from a room.
   *
   * @param id - the socket id
   * @param room - the room name
   */
  public async del(id: SocketId, room: Room): Promise<void> {
    debug(`del, start, id = ${id}, room = ${room}`);
    const release = await this._getLock(id);
    try {
      const eioSid = this._getEioSid(id);
      const groupName = this._getGroupName(this.nsp.name, room);

      await this.service.group(groupName).removeConnection(eioSid);

      debug(
        `del, call API RemoveConnectionFromGroup, finish, groupName = ${groupName}, connectionId(eioSid) = ${eioSid}`
      );
      super.del(id, room);
    } catch (e) {
      debug(`del, error, SocketId = ${id}, room = ${room}, error = ${e}`);
    } finally {
      release();
    }
    debug(`del, finish, SocketId = ${id}, room = ${room}, id.rooms = ${toString(this.sids.get(id))}`);
  }

  /**
   * Removes a socket from all rooms it's joined.
   *
   * @param id - the socket id
   */
  public async delAll(id: SocketId): Promise<void> {
    debug(`delAll, start, id = ${id}`);
    const release = await this._getLock(id);
    debug(`delAll, lock acquired`);
    try {
      // send disconnect packet to socketio connection by leveraging private room whose name == sid
      const packet: SioPacket = { type: SioPacketType.DISCONNECT } as SioPacket;
      const opts: BroadcastOptions = { rooms: new Set([id]) } as BroadcastOptions;
      debug(`delAll, call adapter.broadcast`);

      await this.broadcast(packet, opts);

      super.delAll(id);
    } catch (e) {
      debug(`delAll, error, SocketId = ${id}, error = ${e}`);
    } finally {
      release();
    }
    debug(`delAll, finish, SocketId = ${id}, id.rooms = ${toString(this.sids.get(id))}`);
  }

  /**
   * Broadcasts a packet and expects multiple acknowledgements.
   *
   * @param packet - the packet object
   * @param opts - the options
   * @param clientCountCallback - the number of clients that received the packet
   * @param ack - the callback that will be called for each client response
   */
  public async broadcastWithAck(
    packet: SioPacket,
    opts: BroadcastOptions,
    clientCountCallback: (clientCount: number) => void,
    ack: (...args: unknown[]) => void
  ): Promise<void> {
    debug(`broadcastWithAck, start, packet = ${JSON.stringify(packet)},\
  opts = ${toOptionsString(opts)}, namespace = "${this.nsp.name}"`);

    let accumulatedData = "";
    let count = 0;

    const streamHandleResponse = (chunk: string) => {
      const handleJsonLines = (lines: string[], onPacket: (SioPacket) => void) => {
        /**
         * Line 1: {xxx}
         * Line 2: {xxx}
         * ..
         * Line N: {xx   // maybe not complete
         */
        for (let i = 0; i < lines.length - 1; i++) {
          if (lines[i]) {
            const emitWithAckResponse = JSON.parse(lines[i]);
            // The payload is UTF-8 encoded EIO payload, we need to decode it and only ack the data
            const eioPackets = EioParser.decodePayload(emitWithAckResponse.Payload);
            this._sioDecoder.on("decoded", (packet: SioPacket) => onPacket(packet));
            eioPackets.forEach((element) => {
              this._sioDecoder.add(element.data);
            });
            this._sioDecoder.off("decoded");
          }
        }
      };

      accumulatedData += chunk.toString();
      const lines = accumulatedData.split("\n");
      handleJsonLines(lines, (packet: SioPacket) => {
        ack(...packet.data);
        count++;
      });
      accumulatedData = lines[lines.length - 1];
    };

    const bodyHandler = (value: Uint8Array | undefined, end: boolean) => {
      if (value) {
        const text = this._utf8Decoder.decode(value);
        streamHandleResponse(text);
      }
      if (end) {
        clientCountCallback(count);
        return;
      }
    };

    try {
      packet.nsp = this.nsp.name;
      const encodedPayload = await getSingleEioEncodedPayload(packet);
      const oDataFilter = this._buildODataFilter(opts.rooms, opts.except);

      await this.service.invoke(encodedPayload, bodyHandler, { filter: oDataFilter, contentType: "text/plain" });

      debug(`broadcastWithAck, finish`);
    } catch (e) {
      debug(`broadcastWithAck, error, packet = ${JSON.stringify(packet)},\
opts = ${toOptionsString(opts)}, namespace = "${this.nsp.name}, error = ${e}"`);
    }
  }

  /**
   * Gets a list of sockets by sid.
   *
   * @param rooms - the explicit set of rooms to check.
   */
  public sockets(rooms: Set<Room>): Promise<Set<SocketId>> {
    throw NotSupportedError;
  }

  /**
   * Gets the list of rooms a given socket has joined.
   *
   * @param id - the socket id
   */
  public socketRooms(id: SocketId): Set<Room> | undefined {
    debug(`socketRooms, start, id = ${id}`);
    // Follow the same handling logic as RedisAdapter. Though it's incorrect strictly for multiple server condition.
    const ret = super.socketRooms(id);
    debug(`socketRooms, finish, id = ${id} ${toString(ret)}`);
    return ret;
  }

  /**
   * Returns the matching socket instances
   *
   * @param opts - the filters to apply
   */
  public fetchSockets(opts: BroadcastOptions): Promise<unknown[]> {
    debug(`fetchSockets, start, opts = ${toOptionsString(opts)}`);
    if (opts.flags.local) {
      return super.fetchSockets(opts);
    } else {
      throw NotSupportedError;
    }
  }

  /**
   * Makes the matching socket instances leave the specified rooms
   *
   * @param opts - the filters to apply
   * @param rooms - the rooms to leave
   */
  public async delSockets(opts: BroadcastOptions, rooms: Room[]): Promise<void> {
    debug(`delSockets, start, rooms = ${toString(rooms)}, opts = ${toOptionsString(opts)}`);
    try {
      const oDataFilter = this._buildODataFilter(opts.rooms, opts.except);
      const groupNames = Array.from(rooms).map((room) => this._getGroupName(this.nsp.name, room));
      await this.service.removeConnectionsFromGroups(groupNames, oDataFilter);
      debug(`delSockets, call API removeConnectionsFromGroups, finish, \
rooms = ${toString(rooms)}, opts = ${toOptionsString(opts)}`);
      super.delSockets(opts, rooms);
    } catch (e) {
      debug(`delSockets, error, rooms = ${toString(rooms)}, \
opts = ${toOptionsString(opts)}, error = ${e}`);
    }
  }

  /**
   * Send a packet to the other Socket.IO servers in the cluster
   * @param packet - an array of arguments, which may include an acknowledgement callback at the end
   */
  public override serverSideEmit(packet: unknown[]): void {
    throw NotSupportedError;
  }

  /**
   * Makes the matching socket instances disconnect
   *
   * @param opts - the filters to apply
   * @param close - whether to close the underlying connection
   */
  public async disconnectSockets(opts: BroadcastOptions, close: boolean): Promise<void> {
    debug(`disconnectSockets, start, opts = ${toOptionsString(opts)}, close = ${close}`);
    await this.broadcast(
      { type: SioPacketType.DISCONNECT, nsp: this.nsp.name, data: { close: close } } as SioPacket,
      opts
    );
    /**
     * Server should not call Socket.disconnect(close) for each socket as `super.disconnectSockets` does.
     * Server should wait for EIO CLOSE packet or SIO DISCONNECT packet sent from service.
     */
    debug(`disconnectSockets, finish, opts = ${toOptionsString(opts)}, close = ${close}`);
  }

  /**
   * Generates OData filter string for Web PubSub service from a set of rooms and a set of exceptions
   * @param rooms - a set of Rooms to include
   * @param except - a set of Rooms to exclude
   * @returns OData - filter string
   */
  private _buildODataFilter(rooms: Set<string>, excepts?: Set<string> | undefined): string {
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

  /**
   * Generates OData filter string for Web PubSub service from a set of rooms and a set of exceptions
   * @param rooms - a set of Rooms to include
   * @param except - a set of Rooms to exclude
   * @returns OData - filter string
   */
  private _buildODataFilterForExceptsOnly(excepts?: Set<string> | undefined): string {
    debug("_buildODataFilter");
    let except_idx = 0;

    let denyFilter = "";
    if (excepts) {
      for (const except of excepts) {
        const exceptGroupName = this._getGroupName(this.nsp.name, except);
        denyFilter += `not ('${exceptGroupName}' in groups)` + (except_idx === excepts.size - 1 ? "" : " and ");
        except_idx++;
      }
    }

    let result = denyFilter.length > 0 ? `${denyFilter}` : "";
    debug(`_buildODataFilter result = ${result}`);
    return result;
  }

  private _getEioSid(sioSid: string): string {
    debug(`Get EIO socket, id = "${sioSid}", nsp.sockets = ${toString(this.nsp.sockets.keys())}`);
    return this.nsp.sockets.get(sioSid).conn["id"];
  }

  /**
   * `namespace` and `room` are concpets from Socket.IO.
   * `group` is a concept from Azure Web PubSub.
   */
  private _getGroupName(namespace: string, room?: string): string {
    let ret = `0${GROUP_DELIMITER}${base64url(namespace)}${GROUP_DELIMITER}`;
    if (room && room.length > 0) {
      ret += base64url(room);
    }
    debug(`convert (ns="${namespace}", room="${room}") => groupName = "${ret}"`);
    return ret;
  }

  private async _getLock(id: SocketId): Promise<MutexInterface.Releaser> {
    debug(`_getLock, start, id = ${id}`);

    if (!this._roomOperationLock.has(id)) {
      this._roomOperationLock.set(id, new Mutex());
    }
    const lock = this._roomOperationLock.get(id);
    const release = await lock.acquire();

    debug(`_getLock, finish, id = ${id}`);
    return release;
  }
}
