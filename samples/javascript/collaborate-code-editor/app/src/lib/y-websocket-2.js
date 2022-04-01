/*
Unlike stated in the LICENSE file, it is not necessary to include the copyright notice and permission notice when you copy code from this file.
*/

/**
 * @module provider/websocket
 */

/* eslint-env browser */

import { v4 } from "uuid";

import * as Y from "yjs"; // eslint-disable-line

import * as bc from "lib0/broadcastchannel";
import * as time from "lib0/time";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as mutex from "lib0/mutex";
import { Observable } from "lib0/observable";
import * as math from "lib0/math";
import { Buffer } from "buffer";

import * as syncProtocol from "y-protocols/sync";

const messageSync = 0;

const uniqId = v4();

/**
 *                       encoder,          decoder,          provider,          emitSynced, messageType
 * @type {Array<function(encoding.Encoder, decoding.Decoder, WebsocketProvider, boolean,    number):void>}
 */
const messageHandlers = [];

messageHandlers[messageSync] = (
  encoder,
  decoder,
  provider,
  emitSynced,
  messageType
) => {
  encoding.writeVarUint(encoder, messageSync);
  const syncMessageType = syncProtocol.readSyncMessage(
    decoder,
    encoder,
    provider.doc,
    provider
  );
  if (
    emitSynced &&
    syncMessageType === syncProtocol.messageYjsSyncStep2 &&
    !provider.synced
  ) {
    provider.synced = true;
  }
};

const reconnectTimeoutBase = 1200;
const maxReconnectTimeout = 2500;

/**
 * @param {WebsocketProvider} provider
 * @param {Uint8Array} buf
 * @param {boolean} emitSynced
 * @return {encoding.Encoder}
 */
const readMessage = (provider, buf, emitSynced) => {
  const decoder = decoding.createDecoder(buf);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);
  const messageHandler = provider.messageHandlers[messageType];
  if (/** @type {any} */ (messageHandler)) {
    messageHandler(encoder, decoder, provider, emitSynced, messageType);
  } else {
    console.error("Unable to compute message");
  }
  return encoder;
};

/**
 * @param {WebsocketProvider} provider
 */
const setupWS = (provider) => {
  if (provider.shouldConnect && provider.ws === null) {
    const websocket = new WebSocket(provider.url, "json.webpubsub.azure.v1");
    websocket.binaryType = "arraybuffer";
    provider.ws = websocket;
    provider.wsconnected = false;
    provider.synced = false;

    websocket.onmessage = (event) => {
      if (event.data === null) {
        return;
      }

      let message = JSON.parse(event.data);
      if (message.type === "system") {
        // simply skip system event.
        return;
      }

      let data = message.data;
      // console.log(data)
      if (data.t !== undefined && data.t !== uniqId) {
        // should ignore message.
        return;
      }

      const buf = Buffer.from(data.c, "base64");
      provider.wsLastMessageReceived = time.getUnixTime();
      const encoder = readMessage(provider, buf, true);
      if (encoding.length(encoder) > 1) {
        sendMessage(
          websocket,
          provider.group,
          "sync",
          encoding.toUint8Array(encoder)
        );
      }
    };

    websocket.onclose = () => {
      provider.ws = null;
      if (provider.wsconnected) {
        provider.wsconnected = false;
        provider.synced = false;
        provider.emit("status", [
          {
            status: "disconnected",
          },
        ]);
      } else {
        provider.wsUnsuccessfulReconnects++;
      }

      // Start with no reconnect timeout and increase timeout by
      // log10(wsUnsuccessfulReconnects).
      // The idea is to increase reconnect timeout slowly and have no reconnect
      // timeout at the beginning (log(1) = 0)
      // console.log("set timeout")
      setTimeout(
        setupWS,
        math.min(
          math.log10(provider.wsUnsuccessfulReconnects + 1) *
            reconnectTimeoutBase,
          maxReconnectTimeout
        ),
        provider
      );
    };

    websocket.onopen = () => {
      provider.wsLastMessageReceived = time.getUnixTime();
      provider.wsconnected = true;
      provider.wsUnsuccessfulReconnects = 0;
      provider.emit("status", [
        {
          status: "connected",
        },
      ]);

      joinGroup(websocket, provider.group);

      // always send sync step 1 when connected
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, provider.doc);
      let u8 = encoding.toUint8Array(encoder);
      sendMessage(websocket, provider.group, "init", u8);
    };

    provider.emit("status", [
      {
        status: "connecting",
      },
    ]);
  }
};

/**
 * @param {WebsocketProvider} provider
 * @param {ArrayBuffer} buf
 */
const broadcastMessage = (provider, buf) => {
  if (provider.wsconnected) {
    sendMessage(provider.ws, provider.group, "sync", buf);
  }

  if (provider.bcConnected) {
    provider.mux(() => {
      bc.publish(provider.bcChannel, buf);
    });
  }
};

/**
 * Websocket Provider for Yjs. Creates a websocket connection to sync the shared document.
 * The document name is attached to the provided url. I.e. the following example
 * creates a websocket connection to http://localhost:1234/my-document-name
 *
 * @example
 *   import * as Y from 'yjs'
 *   import { WebsocketProvider } from 'y-websocket'
 *   const doc = new Y.Doc()
 *   const provider = new WebsocketProvider('http://localhost:1234', 'my-document-name', doc)
 *
 * @extends {Observable<string>}
 */
export class WebsocketProvider extends Observable {
  /**
   * @param {url} url
   * @param {Y.Doc} doc
   * @param {object} [opts]
   * @param {boolean} [opts.connect]
   * @param {Object<string,string>} [opts.params]
   * @param {typeof WebSocket} [opts.WebSocketPolyfill] Optionall provide a WebSocket polyfill
   * @param {number} [opts.resyncInterval] Request server state every `resyncInterval` milliseconds
   */
  constructor(
    url,
    group,
    doc,
    { connect = true, params = {}, resyncInterval = -1 } = {}
  ) {
    super();

    this.url = url;
    this.group = group;

    this.doc = doc;
    this.wsconnected = false;

    this.bcChannel = url;
    this.bcConnected = false;

    this.wsUnsuccessfulReconnects = 0;
    this.messageHandlers = messageHandlers.slice();
    this.mux = mutex.createMutex();
    /**
     * @type {boolean}
     */
    this._synced = false;
    /**
     * @type {WebSocket?}
     */
    this.ws = null;
    this.wsLastMessageReceived = 0;
    /**
     * Whether to connect to other peers or not
     * @type {boolean}
     */
    this.shouldConnect = connect;

    /**
     * @type {number}
     */
    this._resyncInterval = 0;

    if (resyncInterval > 0) {
      this._resyncInterval = /** @type {any} */ (
        setInterval(() => {
          if (this.ws) {
            // resend sync step 1
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeSyncStep1(encoder, doc);
            sendMessage(this.ws, group, "sync", encoding.toUint8Array(encoder));
          }
        }, resyncInterval)
      );
    }

    /**
     * @param {ArrayBuffer} data
     */
    this._bcSubscriber = (data) => {
      this.mux(() => {
        const encoder = readMessage(this, new Uint8Array(data), false);
        if (encoding.length(encoder) > 1) {
          bc.publish(this.bcChannel, encoding.toUint8Array(encoder));
        }
      });
    };
    /**
     * Listens to Yjs updates and sends them to remote peers (ws and broadcastchannel)
     * @param {Uint8Array} update
     * @param {any} origin
     */
    this._updateHandler = (update, origin) => {
      if (origin !== this) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        broadcastMessage(this, encoding.toUint8Array(encoder));
      }
    };
    this.doc.on("update", this._updateHandler);

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this._beforeUnloadHandler);
    } else if (typeof process !== "undefined") {
      process.on("exit", () => this._beforeUnloadHandler);
    }

    if (connect) {
      this.connect();
    }
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
      this.emit("synced", [state]);
      this.emit("sync", [state]);
    }
  }

  destroy() {
    if (this._resyncInterval !== 0) {
      clearInterval(this._resyncInterval);
    }
    clearInterval(this._checkInterval);
    this.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
    } else if (typeof process !== "undefined") {
      process.off("exit", () => this._beforeUnloadHandler);
    }
    this.doc.off("update", this._updateHandler);
    super.destroy();
  }

  connectBc() {
    if (!this.bcConnected) {
      bc.subscribe(this.bcChannel, this._bcSubscriber);
      this.bcConnected = true;
    }

    // send sync step1 to bc
    this.mux(() => {
      // write sync step 1
      const encoderSync = encoding.createEncoder();
      encoding.writeVarUint(encoderSync, messageSync);
      syncProtocol.writeSyncStep1(encoderSync, this.doc);
      bc.publish(this.bcChannel, encoding.toUint8Array(encoderSync));

      // broadcast local state
      const encoderState = encoding.createEncoder();
      encoding.writeVarUint(encoderState, messageSync);
      syncProtocol.writeSyncStep2(encoderState, this.doc);
      bc.publish(this.bcChannel, encoding.toUint8Array(encoderState));
    });
  }

  disconnectBc() {
    const encoder = encoding.createEncoder();
    broadcastMessage(this, encoding.toUint8Array(encoder));
    if (this.bcConnected) {
      bc.unsubscribe(this.bcChannel, this._bcSubscriber);
      this.bcConnected = false;
    }
  }

  disconnect() {
    this.shouldConnect = false;
    this.disconnectBc();
    if (this.ws !== null) {
      this.ws.close();
    }
  }

  connect() {
    this.shouldConnect = true;
    if (!this.wsconnected && this.ws === null) {
      // console.log("should connect setup WS")
      setupWS(this);
      this.connectBc();
    }
  }
}

function joinGroup(ws, group) {
  ws.send(
    JSON.stringify({
      type: "joinGroup",
      group: group,
    })
  );
}

function sendMessage(ws, group, type, u8) {
  ws.send(
    JSON.stringify({
      type: "sendToGroup",
      group: `${group}.host`,
      data: {
        t: type,
        f: uniqId,
        c: Buffer.from(u8).toString("base64"),
      },
    })
  );
}
