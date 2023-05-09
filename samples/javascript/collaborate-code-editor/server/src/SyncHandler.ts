import { Doc } from "yjs";

import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";

import ws from "ws";

import { WebPubSubSyncHost } from "y-azure-webpubsub";

const DefaultCode = `import { v4 } from 'uuid';

import { Doc } from 'yjs'; // eslint-disable-line

import * as time from 'lib0/time';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Observable } from 'lib0/observable';
import { Buffer } from 'buffer';

import * as syncProtocol from 'y-protocols/sync';
import { Message, MessageDataType, MessageType } from './Constants';

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
}`;

export default class SyncHandler extends WebPubSubEventHandler {
  private _client: WebPubSubServiceClient;
  private _connections: Map<string, WebPubSubSyncHost> = new Map();

  constructor(hub: string, path: string, client: WebPubSubServiceClient) {
    super(hub, {
      path: path,
    });
    this._client = client;
  }

  getHostConnection(group: string) {
    if (!this._connections.has(group)) {
      let doc = new Doc();
      let text = doc.getText("monaco");
      text.insert(0, DefaultCode);
      let connection = new WebPubSubSyncHost(this._client, group, doc, {
        WebSocketPolyfill: ws.WebSocket,
      });
      connection.start();
      this._connections.set(group, connection);
    }
    return this._connections.get(group);
  }

  async client_negotiate(req: any, res: any) {
    let group = req.query.id === undefined ? "default" : req.query.id;
    this.getHostConnection(group);

    let token = await this._client.getClientAccessToken({
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
