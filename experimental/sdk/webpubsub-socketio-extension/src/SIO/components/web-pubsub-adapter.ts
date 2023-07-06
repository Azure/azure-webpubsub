// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { debugModule } from "../../common/utils";
import { WebPubSubServiceClient, HubSendTextToAllOptions } from "@azure/web-pubsub";
import { getSingleEioEncodedPayload } from "./encoder";
import { Packet as SioPacket, PacketType as SioPacketType, Decoder as SioDecoder } from "socket.io-parser";
import * as EioParser from "engine.io-parser";
import { Namespace, Server as SioServer } from "socket.io";
import { Adapter as NativeInMemoryAdapter, BroadcastOptions, Room, SocketId } from "socket.io-adapter";
import base64url from "base64url";
import {InvokeOperationSpec} from "./operation-spec"
import * as coreClient from "@azure/core-client";

const debug = debugModule("wps-sio-ext:SIO:Adapter");

const GROUP_DELIMITER = "~";
const NotImplementedError = new Error("Not Implemented. This feature will be available in further version.");
const NotSupportedError = new Error("Not Supported.");
const NonLocalNotSupported = new Error("Non-local condition is not Supported.");

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
  private _sioDecoder: SioDecoder;
  public service: WebPubSubServiceClient;

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
    this._sioDecoder = new SioDecoder();
  }

  /**
   * Broadcasts a packet.
   *
   * @param packet - the packet object
   * @param opts - the options
   */
  public override async broadcast(packet: SioPacket, opts: BroadcastOptions): Promise<void> {
    debug(`broadcast, start, packet ${JSON.stringify(packet)}`);
    packet.nsp = this.nsp.name;

    const encodedPayload = await getSingleEioEncodedPayload(packet);

    const oDataFilter = this._buildODataFilter(opts.rooms, opts.except);
    const sendOptions = { filter: oDataFilter, contentType: "text/plain" };
    debug(`broadcast, encodedPayload = "${encodedPayload}", sendOptions = "${JSON.stringify(sendOptions)}"`);

    await this.service.sendToAll(encodedPayload, sendOptions as HubSendTextToAllOptions);
    debug(`broadcast, finish`);
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

    for (const room of rooms) {
      const groupName = this._getGroupName(this.nsp.name, room);
      debug(
        `Try to add EIO connection ${eioSid} to group ${groupName}, converted from (ns="${this.nsp.name}", room="${room}"), SocketId = ${id}`
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
  public async del(id: SocketId, room: Room): Promise<void> {
    debug(`del SocketId = ${id}, room = ${room}`);
    const eioSid = this._getEioSid(id);
    const groupName = this._getGroupName(this.nsp.name, room);
    debug(
      `Try to remove connection ${eioSid} from group ${groupName}, convert from ns#room = ${this.nsp.name}#${room}, SocketId = ${id}`
    );
    await this.service.group(groupName).removeConnection(eioSid);
  }

  /**
   * Removes a socket from all rooms it's joined.
   *
   * @param id - the socket id
   */
  public async delAll(id: SocketId): Promise<void> {
    debug(`delAll SocketId = ${id}`);

    // send disconnect packet to socketio connection by leveraging private room whose name == sid
    const groupName = this._getGroupName(this.nsp.name, id);
    const opts = { rooms: new Set([groupName]) } as BroadcastOptions;
    await this.broadcast({ type: SioPacketType.DISCONNECT, nsp: this.nsp.name } as SioPacket, opts);
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
    const onResponse = (rawResponse, flatResponse, error?) => {
      let accumulatedData = '';
      if (rawResponse.status !== 200) {
        clientCountCallback(0);
      }
      if (rawResponse.browserStreamBody) {
      } else {
        let count = 0;
        let stream = rawResponse.readableStreamBody;
        stream.on("data", chunk => {
          accumulatedData += chunk.toString();
          const lines = accumulatedData.split('\n');

          for (let i = 0; i < lines.length - 1; i ++) {
            if (lines[i]) {
              const emitWithAckResponse = JSON.parse(lines[i]);

              // The payload is utf-8 encoded engineio payload, we need to decode it and only ack the data
              let eioPackets = EioParser.decodePayload(emitWithAckResponse.Payload);
              this._sioDecoder.on('decoded', (packet: SioPacket) => {
                ack(packet.data);
                count++;
              });
              eioPackets.forEach(element => {
                this._sioDecoder.add(element.data);
              });
              this._sioDecoder.off('decoded');
            }
          }
          accumulatedData = lines[lines.length - 1];
        });
        
        stream.on("end", () => {
          clientCountCallback(count);
        })
      }
    }

    const options: coreClient.OperationOptions = { onResponse: onResponse };

    const encodedPayload = await getSingleEioEncodedPayload(packet);

    const operationArguments = {
      hub: this.service.hubName,
      contentType: "text/plain",
      message: encodedPayload,
      options: options
    };

    await ((this.service as any).client as coreClient.ServiceClient).sendOperationRequest(operationArguments, InvokeOperationSpec);
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
    if (this.nsp.sockets.has(id)) {
      throw NonLocalNotSupported;
    }
    const socket = this.nsp.sockets.get(id);
    return socket.rooms;
  }
  /**
   * Returns the matching socket instances
   *
   * @param opts - the filters to apply
   */
  public fetchSockets(opts: BroadcastOptions): Promise<unknown[]> {
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
  public delSockets(opts: BroadcastOptions, rooms: Room[]): void {
    throw NotImplementedError;
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
    await this.broadcast({ type: SioPacketType.DISCONNECT, nsp: this.nsp.name, data: { close } } as SioPacket, opts);
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
    debug(`Get EIO socket by Sid ${sioSid} from nsp.sockets`);
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
}
