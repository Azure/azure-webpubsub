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
  id: string
  state: UserState
  user: string

  constructor(id: string, user: string) {
    this.id = id;
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
  return "unknown"
}

class GroupContext {
  users: { [key: string]: GroupUser };

  name: string;

  constructor(name: string) {
    this.name = name;
    this.users = {};
  }

  toJSON() {
    let res = []
    for( let [k, v] of Object.entries(this.users)) {
      res.push({
        "connectionId": v.id,
        "user": v.user,
        "status": state2status(v.state)
      })
    }
    return res
  }
}

let groupDict: { [key: string]: GroupContext } = {}

let defaultConnectionString = "Endpoint=https://code-stream.webpubsub.azure.com;AccessKey=BDSQB6iSxoHTtpCkGn+yNHA1UrGA6HIDeUYm3pCFzws=;Version=1.0;";

let connectionString = process.argv[2] || process.env.WebPubSubConnectionString || defaultConnectionString;

const ClaimTypeRole = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
const ClaimTypeName = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"

let client: WebPubSubServiceClient = new WebPubSubServiceClient(connectionString ?? "", hubName);

let handler = new WebPubSubEventHandler(hubName, {
  onConnected: (req: ConnectedRequest) => {
    let connId = req.context.connectionId
    console.log(`${connId} connected`)
  },
  onDisconnected: (req: DisconnectedRequest) => {
    let connId = req.context.connectionId
    console.log(`${connId} disconnected`)
  },
  handleConnect: (req: ConnectRequest, res: ConnectResponseHandler) => {
    let claims = req.claims
    let roles = claims[ClaimTypeRole]

    let groupName = roles[0].split('.', 3)[2]
    console.log(groupName)

    let group = groupDict[groupName]
    let user = claims[ClaimTypeName][0]
    console.log(user)

    group.users[user] = new GroupUser(req.context.connectionId, user)

    console.log(group.toJSON())
    res.success()
  },
  handleUserEvent: (req: UserEventRequest, res: UserEventResponseHandler) => {
    let connId = req.context.connectionId
    let data = JSON.parse(req.data.toString());
    let groupContext = groupDict[data.group]

    res.success(JSON.stringify({
      group: groupContext,
    }), "json")
  },
})

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

  let userId: string = req.user ?? req.claims.name ?? "Guest 1";

  let token = await client.getClientAccessToken({ 
    userId: userId,
    roles: roles 
  });

  res.json({
    id: group,
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('app started'));