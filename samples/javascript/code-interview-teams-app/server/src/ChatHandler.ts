import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { GroupManager } from "./GroupManager";
import {
  WebPubSubEventHandler,
  ConnectedRequest,
  DisconnectedRequest,
  ConnectRequest,
  ConnectResponseHandler,
  UserEventRequest,
  UserEventResponseHandler,
} from "@azure/web-pubsub-express";

const ClaimTypeRole =
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
const ClaimTypeName =
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier";

export default class ChatHandler extends WebPubSubEventHandler {
  client: WebPubSubServiceClient;

  groupManager: GroupManager;

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
    this.groupManager = new GroupManager();
  }

  onConnected(req: ConnectedRequest) {
    let connId = req.context.connectionId;
    let groupContext = this.groupManager.getByConnectionId(connId);

    if (groupContext === undefined) {
      return;
    }

    this.client
      .group(groupContext.groupName)
      .addConnection(connId)
      .then(() => {
        if (groupContext != undefined) {
          this.client
            .group(groupContext.groupName)
            .sendToAll(groupContext.toJSON());
        }
      });
  }

  onDisconnected(req: DisconnectedRequest) {
    let userId = req.context.userId;
    let connId = req.context.connectionId;
    let groupContext = this.groupManager.getByConnectionId(connId);

    if (groupContext === undefined) {
      return;
    }

    groupContext.setOffline(userId, connId);

    this.client
      .group(groupContext.groupName)
      .removeConnection(connId)
      .then(() => {
        if (groupContext != undefined) {
          let group = this.client.group(groupContext.groupName);
          group.sendToAll(groupContext.toJSON());
          group.sendToAll({
            type: "observe",
            name: userId,
            line: -1,
          });
        }
      });
  }

  handleConnect(req: ConnectRequest, res: ConnectResponseHandler) {
    let claims = req.claims;
    let roles = claims[ClaimTypeRole];
    let groupName = roles[0].split(".", 3)[2];

    let userId = claims[ClaimTypeName][0];
    let connId = req.context.connectionId;
    this.groupManager.addConnection(userId, connId, groupName);

    res.success();
  }

  handleUserEvent(req: UserEventRequest, res: UserEventResponseHandler) {
    res.success();
  }

  async negotiate(req: any, res: any) {
    let group =
      req.query.id?.toString() || Math.random().toString(36).slice(2, 7);

    let roles = [
      `webpubsub.sendToGroup.${group}`,
      `webpubsub.joinLeaveGroup.${group}`,
    ];

    let userId: string =
      req.user ??
      req.claims?.name ??
      "Anonymous " + Math.floor(1000 + Math.random() * 9000);

    let token = await this.client.getClientAccessToken({
      userId: userId,
      roles: roles,
    });

    res.json({
      group: group,
      user: userId,
      url: token.url,
    });
  }
}
