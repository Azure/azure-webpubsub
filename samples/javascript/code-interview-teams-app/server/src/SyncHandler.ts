import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { ConnectedRequest, WebPubSubEventHandler } from "@azure/web-pubsub-express"

import { Connection as ServerConnection } from "./SyncConnection";

export default class SyncHandler extends WebPubSubEventHandler {
  private _client: WebPubSubServiceClient;
  private _connections: Map<string, ServerConnection> = new Map();

  constructor(hub: string, path: string, client: WebPubSubServiceClient) {
    super(hub, {
      path: path,
    });
    this._client = client;
  }

  getHostConnection(group: string) {
    if (!this._connections.has(group)) {
      let connection = new ServerConnection(this._client, group);
      connection.connect();
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
