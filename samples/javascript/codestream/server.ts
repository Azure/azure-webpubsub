const cors = require('cors')
const express = require('express');

import { WebPubSubServiceClient } from '@azure/web-pubsub';

import { 
  ConnectRequest,
  ConnectResponseHandler,
  ConnectedRequest,
  DisconnectedRequest,
  UserEventRequest,
  UserEventResponseHandler,
  WebPubSubEventHandler, 
} from "@azure/web-pubsub-express";

const builder = require('./src/aad-express-middleware');

const aadJwtMiddleware = builder.build({
  tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
  audience: [
    "ee79ab73-0c3a-4e1e-b8a6-46f0e8753c8b", // dev
    "ac6517b5-4fe1-43de-af2d-ce0aa3cfd6d9", // prod
  ]
})

const hubName = "codestream"

const app = express();

enum UserState {
  Host = 0,
  Active,
  Inactive,
};

class GroupUser {
  connId: string
  state: UserState
  user: string

  constructor(connId: string, user: string) {
    this.connId = connId;
    this.user = user;
    this.state = UserState.Active;
  }
};

function state2status(state: UserState) {
  switch (state) {
    case UserState.Host:
      return "host"
    case UserState.Active:
      return "online"
    case UserState.Inactive:
      return "offline"
  }
}

class GroupContext {
  users: { [key: string]: GroupUser };

  name: string;

  constructor(name: string) {
    this.name = name;
    this.users = {};
  }

  host(user: string) {
    let current: GroupUser;
    let currentHost: GroupUser;

    Object.entries(this.users).forEach(([k, v]) => {
      if (k == user) {
        current = v;
      }
      if (v.state == UserState.Host) {
        currentHost = v;
      }
    });

    if (currentHost == undefined || currentHost === current) {
      current.state = UserState.Host;
      return true;
    }
    return false;
  }

  offline(user: string, connId: string) {
    Object.entries(this.users).forEach(([k, v]) => {
      if (k == user && v.connId == connId) {
        v.state = UserState.Inactive;
      }
    });
  }

  toJSON() {
    let res = {
      type: "lobby",
      users: [],
    };

    for (let [k, v] of Object.entries(this.users)) {
      res.users.push({
        connectionId: v.connId,
        name: v.user,
        status: state2status(v.state),
      });
    }
    return res;
  }
}

let groupDict: { [key: string]: GroupContext } = {};
let connectionDict: { [key: string]: string } = {};

let defaultConnectionString = "Endpoint=https://code-stream.webpubsub.azure.com;AccessKey=BDSQB6iSxoHTtpCkGn+yNHA1UrGA6HIDeUYm3pCFzws=;Version=1.0;";

let connectionString = process.argv[2] || process.env.WebPubSubConnectionString || defaultConnectionString;

const ClaimTypeRole = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
const ClaimTypeName = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"

let client: WebPubSubServiceClient = new WebPubSubServiceClient(connectionString ?? "", hubName);

let handler = new WebPubSubEventHandler(hubName, {
  onConnected: (req: ConnectedRequest) => {
    let connId = req.context.connectionId;
    console.log(`${connId} connected`);

    let groupName = connectionDict[connId];
    let groupContext = groupDict[groupName];

    client
      .group(groupName)
      .addConnection(connId)
      .then(() => {
        if (groupContext != undefined) {
          client.group(groupName).sendToAll(groupContext.toJSON());
        }
      });
  },
  onDisconnected: (req: DisconnectedRequest) => {
    let connId = req.context.connectionId;
    console.log(`${connId} disconnected`);

    let groupName = connectionDict[connId];
    let groupContext = groupDict[groupName];
    groupContext?.offline(req.context.userId, req.context.connectionId);

    client
      .group(groupName)
      .removeConnection(connId)
      .then(() => {
        if (groupContext != undefined) {
          console.log(groupContext);
          client.group(groupName).sendToAll(groupContext.toJSON());
        }
      });
  },
  handleConnect: (req: ConnectRequest, res: ConnectResponseHandler) => {
    let connId = req.context.connectionId;
    let claims = req.claims;
    let roles = claims[ClaimTypeRole];

    console.log(roles[0])
    let groupName = roles[0].split(".", 3)[2];
    console.log(groupName)
    connectionDict[connId] = groupName;

    let groupContext = groupDict[groupName];
    let userId = claims[ClaimTypeName][0];

    groupContext.users[userId] = new GroupUser(connId, userId);
    res.success();
  },
  handleUserEvent: (req: UserEventRequest, res: UserEventResponseHandler) => {
    let userId = req.context.userId;

    switch (req.context.eventName) {
      case "host":
        let data: any = req.data;
        let group = data.group;
        let groupContext = groupDict[group];
        if (groupContext.host(userId)) {
          client.group(group).sendToAll(groupContext.toJSON());
        } else {
          client.sendToConnection(req.context.connectionId, {
            type: "message",
            data: {
              level: "warning",
              message: "There is someone else is hosting.",
            },
          });
        }
    }
    res.success();
  },
});

app.use(handler.getMiddleware());
console.log(handler.path)

let corsOptions = {
  // origin: "https://newcodestrdev60af4ctab.z5.web.core.windows.net"
}

const corsMiddleware = cors(corsOptions)

app.options('/negotiate', corsMiddleware)

app.get('/negotiate', aadJwtMiddleware, corsMiddleware, async (req: any, res: any) => {
  let group = req.query.id?.toString() || Math.random().toString(36).slice(2, 7);

  if (groupDict[group] == undefined) {
    groupDict[group] = new GroupContext(group);
  }
  console.log(groupDict)

  let roles = [
    `webpubsub.sendToGroup.${group}`, 
    `webpubsub.joinLeaveGroup.${group}`,
  ];

  let userId: string = req.user ?? req.claims?.name ?? "Anonymous " + Math.floor(1000 + Math.random() * 9000);

  let token = await client.getClientAccessToken({ 
    userId: userId,
    roles: roles 
  });

  res.json({
    group: group,
    user: userId,
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('app started'));