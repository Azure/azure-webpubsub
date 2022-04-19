import { Buffer } from 'buffer';
import { v4 } from 'uuid';
import { Doc } from 'yjs'; // eslint-disable-line

import { Message, MessageDataType, MessageType } from './Constants';

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as time from 'lib0/time';
import * as syncProtocol from 'y-protocols/sync';

const messageSyncStep1 = syncProtocol.messageYjsSyncStep1;

const AzureWebPubSubJsonProtocol = 'json.webpubsub.azure.v1';

type MessageHandler = (
  encoder: encoding.Encoder,
  decoder: decoding.Decoder,
  provider: WebPubSubSyncClient,
  emitSynced: boolean,
  messageType: number,
) => void;

export interface ProviderOptions {
  resyncInterval: number;
  tokenProvider: Promise<string> | null;
}

const messageHandlers: MessageHandler[] = [];

messageHandlers[messageSyncStep1] = (encoder, decoder, provider, emitSynced, messageType) => {
  encoding.writeVarUint(encoder, messageType);
  const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, provider.doc, provider);
  if (emitSynced && syncMessageType === syncProtocol.messageYjsSyncStep2 && !provider.synced) {
    provider.synced = true;
  }
};

/**
 * @param {WebPubSubSyncClient} provider
 * @param {Uint8Array} buf
 * @param {boolean} emitSynced
 * @return {encoding.Encoder}
 */
const readMessage = (provider: WebPubSubSyncClient, buf: Uint8Array, emitSynced: boolean): encoding.Encoder => {
  const decoder = decoding.createDecoder(buf);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);
  const messageHandler = messageHandlers[messageType];
  if (messageHandler) {
    messageHandler(encoder, decoder, provider, emitSynced, messageType);
  } else {
    throw new Error(`unable to handle message with type: ${messageType}`);
  }
  return encoder;
};

/**
 * Azure WebPubSub Provider for Yjs. Creates a websocket connection to sync the shared document.
 *
 * @example
 *   import * as Y from 'yjs'
 *   import { WebsocketProvider } from 'y-websocket'
 *   const doc = new Y.Doc()
 *   const provider = new WebsocketProvider('http://localhost:1234', 'my-document-name', doc)
 *
 * @extends {Observable<string>}
 */
export class WebPubSubSyncClient {
  public doc: Doc;
  public topic: string;

  private _ws: WebSocket | null;
  private _url: string;
  private _wsConnected: boolean;
  private _wsLastMessageReceived: number;
  private _synced: boolean;
  private _resyncInterval: NodeJS.Timer | null;
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
    options: ProviderOptions = {
      resyncInterval: 15 * 1000,
      tokenProvider: null,
    },
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
          sendToControlGroup(this, topic, MessageDataType.Sync, encoding.toUint8Array(encoder));
        }
      }, options.resyncInterval);
    }

    this._updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSyncStep1);
        syncProtocol.writeUpdate(encoder, update);
        sendToControlGroup(this, topic, MessageDataType.Sync, encoding.toUint8Array(encoder));
      }
    };
    this.doc.on('update', this._updateHandler);
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
    this.doc.off('update', this._updateHandler);
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
    const provider = this;

    const res = await fetch(this._url);
    const data = await res.json();

    const websocket = new WebSocket(data.url, AzureWebPubSubJsonProtocol);
    websocket.binaryType = 'arraybuffer';
    provider._ws = websocket;
    provider._wsConnected = false;
    provider.synced = false;

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
      if (messageData.t !== undefined && messageData.t !== provider._uuid) {
        // should ignore message for other clients.
        return;
      }

      const buf = Buffer.from(messageData.c, 'base64');
      provider._wsLastMessageReceived = time.getUnixTime();
      const encoder = readMessage(provider, buf, true);
      if (encoding.length(encoder) > 1) {
        sendToControlGroup(provider, provider.topic, MessageDataType.Sync, encoding.toUint8Array(encoder));
      }
    };

    websocket.onclose = () => {
      provider._ws = null;
      if (provider._wsConnected) {
        provider._wsConnected = false;
        provider.synced = false;
      } else {
        // TODO reconnect
      }
    };

    websocket.onopen = () => {
      provider._wsLastMessageReceived = time.getUnixTime();
      provider._wsConnected = true;

      joinGroup(provider, provider.topic);

      // always send sync step 1 when connected
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSyncStep1);
      syncProtocol.writeSyncStep1(encoder, provider.doc);
      const u8 = encoding.toUint8Array(encoder);
      sendToControlGroup(provider, provider.topic, MessageDataType.Init, u8);
    };
  }
}

function joinGroup(provider: WebPubSubSyncClient, group: string) {
  provider.ws?.send(
    JSON.stringify({
      type: MessageType.JoinGroup,
      group,
    }),
  );
}

function sendToControlGroup(provider: WebPubSubSyncClient, group: string, type: string, u8: Uint8Array) {
  provider.ws?.send(
    JSON.stringify({
      type: MessageType.SendToGroup,
      group: `${group}.host`,
      data: {
        t: type,
        f: provider.id,
        c: Buffer.from(u8).toString('base64'),
      },
    }),
  );
}
