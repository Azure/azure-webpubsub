import { Buffer } from "buffer";
import { v4 } from "uuid";
import { Doc } from "yjs"; // eslint-disable-line

import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";

const messageSyncStep1 = syncProtocol.messageYjsSyncStep1;

const AzureWebPubSubJsonProtocol = "json.webpubsub.azure.v1";

export enum MessageType {
  System = "system",
  JoinGroup = "joinGroup",
  SendToGroup = "sendToGroup",
}

export enum MessageDataType {
  Init = "init",
  Sync = "sync",
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

type MessageHandler = (
  encoder: encoding.Encoder,
  decoder: decoding.Decoder,
  client: WebPubSubSyncClient,
  emitSynced: boolean,
  messageType: number
) => void;

export interface ClientOptions {
  resyncInterval: number;
  tokenProvider: Promise<string> | null;
}

const messageHandlers: MessageHandler[] = [];

messageHandlers[messageSyncStep1] = (
  encoder,
  decoder,
  client,
  emitSynced,
  messageType
) => {
  encoding.writeVarUint(encoder, messageType);
  const syncMessageType = syncProtocol.readSyncMessage(
    decoder,
    encoder,
    client.doc,
    client
  );
  if (
    emitSynced &&
    syncMessageType === syncProtocol.messageYjsSyncStep2 &&
    !client.synced
  ) {
    client.synced = true;
  }
};

/**
 * @param {WebPubSubSyncClient} client
 * @param {Uint8Array} buf
 * @param {boolean} emitSynced
 * @return {encoding.Encoder}
 */
const readMessage = (
  client: WebPubSubSyncClient,
  buf: Uint8Array,
  emitSynced: boolean
): encoding.Encoder => {
  const decoder = decoding.createDecoder(buf);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);
  const messageHandler = messageHandlers[messageType];
  if (messageHandler) {
    messageHandler(encoder, decoder, client, emitSynced, messageType);
  } else {
    throw new Error(`unable to handle message with type: ${messageType}`);
  }
  return encoder;
};

/**
 * Azure WebPubSub Sync Client for Yjs.
 * Creates a websocket connection to sync the shared document.
 */
export class WebPubSubSyncClient {
  public doc: Doc;
  public topic: string;

  private _ws: WebSocket | null;
  private _url: string;
  private _wsConnected: boolean;
  private _wsLastMessageReceived: number;
  private _synced: boolean;
  private _resyncInterval;
  private _updateHandler: (update: any, origin: any) => void;
  private _uuid: string;

  /**
   * @param {string} url
   * @param {string} topic
   * @param {Doc} doc
   * @param {number} [options.resyncInterval] Request server state every `resyncInterval` milliseconds.
   * @param {number} [options.tokenProvider] token generator for negotiation.
   */
  constructor(
    url: string,
    topic: string,
    doc: Doc,
    options: ClientOptions = {
      resyncInterval: 15 * 1000,
      tokenProvider: null,
    }
  ) {
    this.doc = doc;
    this.topic = topic;

    this._url = url;
    this._uuid = v4();

    this._wsConnected = false;

    this._synced = false;
    this._ws = null;
    this._wsLastMessageReceived = 0;

    this._resyncInterval = null;

    if (options.resyncInterval > 0) {
      this._resyncInterval = setInterval(() => {
        if (this._ws) {
          // resend sync step 1
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSyncStep1);
          syncProtocol.writeSyncStep1(encoder, doc);
          sendToControlGroup(
            this,
            topic,
            MessageDataType.Sync,
            encoding.toUint8Array(encoder)
          );
        }
      }, options.resyncInterval);
    }

    this._updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSyncStep1);
        syncProtocol.writeUpdate(encoder, update);
        sendToControlGroup(
          this,
          topic,
          MessageDataType.Sync,
          encoding.toUint8Array(encoder)
        );
      }
    };
    this.doc.on("update", this._updateHandler);
  }

  /**
   * @type {boolean}
   */
  get synced() {
    return this._synced;
  }

  set synced(state) {
    if (this._synced !== state) {
      this._synced = state;
    }
  }

  get ws(): WebSocket | null {
    return this._wsConnected ? this._ws : null;
  }

  get id(): string {
    return this._uuid;
  }

  destroy() {
    if (this._resyncInterval !== null) {
      clearInterval(this._resyncInterval);
    }
    this.stop();
    this.doc.off("update", this._updateHandler);
  }

  stop() {
    if (this._ws !== null) {
      this._ws.close();
    }
  }

  async start() {
    if (this._wsConnected || this._ws) {
      return;
    }
    const client = this;

    const res = await fetch(this._url);
    const data = await res.json();

    const websocket = new WebSocket(data.url, AzureWebPubSubJsonProtocol);
    websocket.binaryType = "arraybuffer";
    client._ws = websocket;
    client._wsConnected = false;
    client.synced = false;

    websocket.onmessage = (event) => {
      if (event.data === null) {
        return;
      }

      const message: Message = JSON.parse(event.data.toString());
      if (message.type === MessageType.System) {
        // simply skip system event.
        return;
      }

      const messageData = message.data;
      if (messageData.t !== undefined && messageData.t !== client._uuid) {
        // should ignore message for other clients.
        return;
      }

      const buf = Buffer.from(messageData.c, "base64");
      client._wsLastMessageReceived = Date.now();
      const encoder = readMessage(client, buf, true);
      if (encoding.length(encoder) > 1) {
        sendToControlGroup(
          client,
          client.topic,
          MessageDataType.Sync,
          encoding.toUint8Array(encoder)
        );
      }
    };

    websocket.onclose = () => {
      client._ws = null;
      if (client._wsConnected) {
        client._wsConnected = false;
        client.synced = false;
      } else {
        // TODO reconnect
      }
    };

    websocket.onopen = () => {
      client._wsLastMessageReceived = Date.now();
      client._wsConnected = true;

      joinGroup(client, client.topic);

      // always send sync step 1 when connected
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSyncStep1);
      syncProtocol.writeSyncStep1(encoder, client.doc);
      const u8 = encoding.toUint8Array(encoder);
      sendToControlGroup(client, client.topic, MessageDataType.Init, u8);
    };
  }
}

function joinGroup(client: WebPubSubSyncClient, group: string) {
  client.ws?.send(
    JSON.stringify({
      type: MessageType.JoinGroup,
      group,
    })
  );
}

function sendToControlGroup(
  client: WebPubSubSyncClient,
  group: string,
  type: string,
  u8: Uint8Array
) {
  client.ws?.send(
    JSON.stringify({
      type: MessageType.SendToGroup,
      group: `${group}.host`,
      data: {
        t: type,
        f: client.id,
        c: Buffer.from(u8).toString("base64"),
      },
    })
  );
}
