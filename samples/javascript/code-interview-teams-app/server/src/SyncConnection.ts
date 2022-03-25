const encoding = require("lib0/dist/encoding.cjs");
const decoding = require("lib0/dist/decoding.cjs");

const syncProtocol = require("y-protocols/dist/sync.cjs");

const messageSync = 0;

const hostUserId = "host";

import { Doc } from "yjs";

import { WebSocket } from "ws";

import { WebPubSubServiceClient } from "@azure/web-pubsub";

interface IData {
  t: string; // sync, update
  f: string; // uuid,
  c: string; // base64 encoded binary array
}

interface IMessage {
  type: string;
  from: string;
  group: string;
  data: IData;
}

class WSSharedDoc extends Doc {
  constructor(connection: Connection) {
    super({ gc: true });

    const updateHandler = (update, origin, doc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      let u8 = encoding.toUint8Array(encoder);
      connection.broadcast(connection.group, u8);
    };

    this.on("update", updateHandler);
  }
}

export class Connection {
  private _client: WebPubSubServiceClient;
  private _conn: WebSocket;

  public group: string;
  public doc: WSSharedDoc;

  constructor(client: WebPubSubServiceClient, group: string) {
    this._client = client;
    this.group = group;
    this.doc = new WSSharedDoc(this);
  }

  async connect() {
    let url = await this.negotiate(this.group);
    let conn = new WebSocket(url, "json.webpubsub.azure.v1");

    const server = this;
    const group = this.group;

    conn.onmessage = function (e: { data: string }) {
      let event: IMessage = JSON.parse(e.data);

      if (event.type === "message" && event.from == "group") {
        switch (event.data.t) {
          case "init":
            console.log("receive init message");
            server.onClientInit(group, event.data);
            server.onClientSync(group, event.data);
            return;
          case "sync":
            console.log("receive sync message");
            server.onClientSync(group, event.data);
            return;
        }
      }
    };

    conn.onopen = () => {
      console.log("joinGroup: ", group);
      conn.send(
        JSON.stringify({
          type: "joinGroup",
          group: `${group}.host`,
        })
      );
    };

    this._conn = conn;
  }

  broadcast(group: string, u8: Uint8Array) {
    this._conn.send(
      JSON.stringify({
        type: "sendToGroup",
        group: group,
        noEcho: true,
        data: {
          c: Buffer.from(u8).toString("base64"),
        },
      })
    );
  }

  send(group: string, to: string, u8: Uint8Array) {
    this._conn.send(
      JSON.stringify({
        type: "sendToGroup",
        group: group,
        noEcho: true,
        data: {
          t: to,
          c: Buffer.from(u8).toString("base64"),
        },
      })
    );
  }

  private onClientInit(group: string, data: IData) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    let u8 = encoding.toUint8Array(encoder);
    this.send(group, data.f, u8);
  }

  private onClientSync(group: string, data: IData) {
    try {
      const buf = Buffer.from(data.c, "base64");
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, null);
          if (encoding.length(encoder) > 1) {
            this.send(group, data.f, encoding.toUint8Array(encoder));
          }
          break;
      }
    } catch (err) {
      console.error(err);
      this.doc.emit("error", [err]);
    }
  }

  private async negotiate(group: string): Promise<string> {
    let roles = [
      `webpubsub.sendToGroup.${group}`,
      `webpubsub.joinLeaveGroup.${group}`,
      `webpubsub.joinLeaveGroup.${group}.host`,
    ];

    let res = await this._client.getClientAccessToken({
      userId: hostUserId,
      roles: roles,
    });
    return res.url;
  }
}
