import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';

import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { Message, MessageData, MessageDataType, MessageType } from './Constants';
import { Doc } from 'yjs';

const HostUserId = 'host';

export class Connection {
  private _client: WebPubSubServiceClient;
  private _conn: WebSocket | null;

  public group: string;
  public doc: Doc;

  constructor(client: WebPubSubServiceClient, group: string) {
    this._client = client;
    this._conn = null;
    this.group = group;
    this.doc = new Doc();

    const connection = this;

    const updateHandler = (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
      syncProtocol.writeUpdate(encoder, update);
      const u8 = encoding.toUint8Array(encoder);
      connection.broadcast(connection.group, u8);
    };

    this.doc.on('update', updateHandler);
  }

  async connect() {
    const url = await this.negotiate(this.group);
    const conn = new WebSocket(url, 'json.webpubsub.azure.v1');

    const server = this;
    const group = this.group;

    conn.onmessage = (e: { data: string }) => {
      const event: Message = JSON.parse(e.data);

      if (event.type === 'message' && event.from === 'group') {
        switch (event.data.t) {
          case MessageDataType.Init:
            server.onClientInit(group, event.data);
            server.onClientSync(group, event.data);
            return;
          case MessageDataType.Sync:
            server.onClientSync(group, event.data);
            return;
        }
      }
    };

    conn.onopen = () => {
      conn.send(
        JSON.stringify({
          type: MessageType.JoinGroup,
          group: `${group}.host`,
        }),
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
          c: Buffer.from(u8).toString('base64'),
        },
      }),
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
          c: Buffer.from(u8).toString('base64'),
        },
      }),
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
      const buf = Buffer.from(data.c, 'base64');
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
      this.doc.emit('error', [err]);
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
