const encoding = require("lib0/dist/encoding.cjs");
const decoding = require("lib0/dist/decoding.cjs");

const syncProtocol = require("y-protocols/dist/sync.cjs");

import { Doc } from "yjs";

const messageSync = 0;

import { WebPubSubServiceClient } from "@azure/web-pubsub";
import {
  ConnectedRequest,
  ConnectionContext,
  ConnectRequest,
  ConnectResponseHandler,
  DisconnectedRequest,
  UserEventRequest,
  UserEventResponseHandler,
  WebPubSubEventHandler,
} from "@azure/web-pubsub-express";

import { Connection as ServerConnection } from "./SyncConnection";

function Arr2Buf(array: Uint8Array): ArrayBuffer {
  return array.buffer.slice(
    array.byteOffset,
    array.byteLength + array.byteOffset
  );
}

class WSSharedDoc extends Doc {
  conns: Map<string, ConnectionContext>;
  awareness: any;

  constructor(client: WebPubSubServiceClient) {
    super({ gc: true });
    this.conns = new Map();

    const updateHandler = (update, origin, doc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = Arr2Buf(encoding.toUint8Array(encoder));
      doc.conns.forEach((_: any, connId: string) =>
        client.sendToConnection(connId, message)
      );
    };

    this.on("update", updateHandler);
  }
}

export default class YjsHandler extends WebPubSubEventHandler {
  doc: WSSharedDoc;
  client: WebPubSubServiceClient;

  constructor(hub: string, path: string, client: WebPubSubServiceClient) {
    super(hub, {
      path: path,
      onConnected: (req: ConnectedRequest) => this.onConnected(req),
      onDisconnected: (req: DisconnectedRequest) => this.onDisconnected(req),
      handleConnect: (req: ConnectRequest, res: ConnectResponseHandler) =>
        this.handleConnect(req, res),
      handleUserEvent: (req: UserEventRequest, res: UserEventResponseHandler) =>
        this.handleUserEvent(req, res),
    });
    this.client = client;
    this.doc = new WSSharedDoc(client);
  }

  onConnected(req: ConnectedRequest) {
    let connId = req.context.connectionId;

    this.doc.conns.set(connId, req.context);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    var message = Arr2Buf(encoding.toUint8Array(encoder));
    this.client.sendToConnection(connId, message);
  }

  onDisconnected(req: DisconnectedRequest) {
    let connId = req.context.connectionId;
    console.log(`${connId} disconnected`);
  }

  handleConnect(req: ConnectRequest, res: ConnectResponseHandler) {
    let connId = req.context.connectionId;
    console.log(`${connId} connect`);
    res.success();
  }

  handleUserEvent(req: UserEventRequest, res: UserEventResponseHandler) {
    let connId = req.context.connectionId;

    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(req.data);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, null);
          if (encoding.length(encoder) > 1) {
            this.client.sendToConnection(
              connId,
              Arr2Buf(encoding.toUint8Array(encoder))
            );
          }
          break;
      }
    } catch (err) {
      console.error(err);
      this.doc.emit("error", [err]);
    }

    res.success();
  }

  async negotiate(req: any, res: any) {
    let group = req.query.id ?? "default";
    let token = await this.client.getClientAccessToken({
      roles: [
        `webpubsub.joinLeaveGroup.${group}`,
        `webpubsub.sendToGroup.${group}.host`,
      ],
    });
    res.json({
      url: token.url,
    });
  }
}
