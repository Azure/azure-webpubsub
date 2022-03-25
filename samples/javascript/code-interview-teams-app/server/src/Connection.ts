const encoding = require("lib0/dist/encoding.cjs");
const decoding = require("lib0/dist/decoding.cjs");

const syncProtocol = require("y-protocols/dist/sync.cjs");

const messageSync = 0;

import Y from "yjs";

import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { StringUtils } from "@azure/msal-common";

function Arr2Buf(array: Uint8Array): ArrayBuffer {
  return array.buffer.slice(
    array.byteOffset,
    array.byteLength + array.byteOffset
  );
}

class WSSharedDoc extends Y.Doc {
  constructor(client: WebPubSubServiceClient, group: string) {
    super({ gc: true });

    const updateHandler = (update, origin, doc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = Arr2Buf(encoding.toUint8Array(encoder));
      client.group(group).sendToAll(message);
    };

    this.on("update", updateHandler);
  }
}

export class Connection {
  private _client: WebPubSubServiceClient;

  private _group: string;

  private _conn: WebSocket;

  private _doc: WSSharedDoc;

  constructor(client: WebPubSubServiceClient, group: string) {
    this._client = client;
    this._doc = new WSSharedDoc(client, group);
    this._group = group;
  }

  async connect() {
    let url = await this.negotiate("host", this._group);
    console.log(url);
    let conn = new WebSocket(url);
    let server = this;

    conn.onmessage = function (e: { data: string }) {
      let event = JSON.parse(e.data);
      console.log(event);

      if (event.type == "sys.connected") {
        server.onConnected(event);
      } else if (event.type == "user.sync") {
        server.onSyncMessage(event);
      }
    };

    this._conn = conn;
  }

  private onConnected(e: { connId: string }) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this._doc);
    var message = Arr2Buf(encoding.toUint8Array(encoder));
    this._client.sendToConnection(e.connId, message);
  }

  private onSyncMessage(e: { connId: string; data: string }) {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(e.data);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, this._doc, null);
          if (encoding.length(encoder) > 1) {
            this._client.sendToConnection(
              e.connId,
              Arr2Buf(encoding.toUint8Array(encoder))
            );
          }
          break;
      }
    } catch (err) {
      console.error(err);
      this._doc.emit("error", [err]);
    }
  }

  private async negotiate(userId: string, group: string): Promise<string> {
    let roles = [
      `webpubsub.sendToGroup.${group}`,
      `webpubsub.joinLeaveGroup.${group}`,
    ];

    let res = await this._client.getClientAccessToken({
      userId: userId,
      roles: roles,
    });
    return res.url;
  }
}
