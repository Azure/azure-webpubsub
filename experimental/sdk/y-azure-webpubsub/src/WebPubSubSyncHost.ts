import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";

import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebSocket } from "ws";
import { Doc } from "yjs";

const messageSync = 0;
const messageAwareness = 1;

export enum MessageType {
  System = "system",
  JoinGroup = "joinGroup",
  SendToGroup = "sendToGroup",
}

export enum MessageDataType {
  Init = "init",
  Sync = "sync",
  Awareness = "awareness",
}

export interface MessageData {
  t: string; // type / target uuid
  f: string; // origin uuid
  c: string; // base64 encoded binary data
}

export interface Message {
  type: string;
  from: string;
  group: string;
  data: MessageData;
}
const HostUserId = "host";

export interface WebPubSubHostOptions {
  WebSocketPolyfill: any;
}

export class WebPubSubSyncHost {
  public doc: Doc;
  public topic: string;

  private _client: WebPubSubServiceClient;
  private _polyfill: any;
  private _conn: any;

  private _awareness: awarenessProtocol.Awareness;

  constructor(
    client: WebPubSubServiceClient,
    topic: string,
    doc: Doc,
    { WebSocketPolyfill = WebSocket }: WebPubSubHostOptions
  ) {
    this.doc = doc;
    this.topic = topic;
    this._client = client;

    this._conn = null;
    this._polyfill = WebSocketPolyfill;
    const host = this;

    // register awareness controller
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);

    const awarenessChangeHandler = ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      );
      const u8 = encoding.toUint8Array(encoder);
      host.broadcast(host.topic, u8);
    };
    awareness.on("update", awarenessChangeHandler);

    this._awareness = awareness;

    // register update handler
    const updateHandler = (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const u8 = encoding.toUint8Array(encoder);
      host.broadcast(host.topic, u8);
    };
    doc.on("update", updateHandler);
  }

  get awareness() {
    return this._awareness;
  }

  async start() {
    const url = await this.negotiate(this.topic);
    const conn = new this._polyfill(url, "json.webpubsub.azure.v1");

    const server = this;
    const group = this.topic;

    conn.onmessage = (e) => {
      const event: Message = JSON.parse(e.data.toString());

      if (event.type === "message" && event.from === "group") {
        switch (event.data.t) {
          case MessageDataType.Init:
            server.onClientInit(group, event.data);
            server.onClientSync(group, event.data);
            return;
          case MessageDataType.Sync:
            server.onClientSync(group, event.data);
            return;
          case MessageDataType.Awareness:
            server.onAwareness(group, event.data);
            return;
        }
      }
    };

    conn.onopen = () => {
      conn.send(
        JSON.stringify({
          type: MessageType.JoinGroup,
          group: `${group}.host`,
        })
      );
    };

    this._conn = conn;
  }

  private broadcast(group: string, u8: Uint8Array) {
    this._conn?.send(
      JSON.stringify({
        type: MessageType.SendToGroup,
        group,
        noEcho: true,
        data: {
          c: Buffer.from(u8).toString("base64"),
        },
      })
    );
  }

  private send(group: string, to: string, u8: Uint8Array) {
    this._conn?.send(
      JSON.stringify({
        type: MessageType.SendToGroup,
        group,
        noEcho: true,
        data: {
          t: to,
          c: Buffer.from(u8).toString("base64"),
        },
      })
    );
  }

  private onClientInit(group: string, data: MessageData) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    const u8 = encoding.toUint8Array(encoder);
    this.send(group, data.f, u8);
  }

  private onClientSync(group: string, data: MessageData) {
    try {
      const buf = Buffer.from(data.c, "base64");
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case syncProtocol.messageYjsSyncStep1:
          encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, null);
          if (encoding.length(encoder) > 1) {
            this.send(group, data.f, encoding.toUint8Array(encoder));
          }
          break;
      }
    } catch (err) {
      this.doc.emit("error", [err]);
    }
  }

  private onAwareness(group: string, data: MessageData) {
    try {
      const buf = Buffer.from(data.c, "base64");
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder); // skip the message type
      awarenessProtocol.applyAwarenessUpdate(
        this._awareness,
        decoding.readVarUint8Array(decoder),
        undefined
      );
    } catch (err) {
      this.doc.emit("error", [err]);
    }
  }

  private async negotiate(group: string): Promise<string> {
    const roles = [
      `webpubsub.sendToGroup.${group}`,
      `webpubsub.joinLeaveGroup.${group}`,
      `webpubsub.joinLeaveGroup.${group}.host`,
    ];

    const res = await this._client.getClientAccessToken({
      userId: HostUserId,
      roles,
    });
    return res.url;
  }
}
