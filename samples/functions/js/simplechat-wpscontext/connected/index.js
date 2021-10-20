// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = function (context, req) {
  context.bindings.webPubSubEvent = [];
  context.bindings.webPubSubEvent.push({
    "operationKind": "sendToAll",
    "message": JSON.stringify({
        from: '[System]',
        content: `${context.bindings.wpsReq.request.connectionContext.userId} connected.`
      }),
    "dataType" : "json"
  });

  context.bindings.webPubSubEvent.push({
    "operationKind": "addUserToGroup",
    "userId": `${context.bindings.wpsReq.request.connectionContext.userId}`,
    "group": "group1"
  });

  context.bindings.webPubSubEvent.push({
    "operationKind": "sendToAll",
    "message": JSON.stringify({
          from: '[System]',
          content: `${context.bindings.wpsReq.request.connectionContext.userId} joined group: group1.`
      }),
    "dataType": "json"
  });
  context.done();
};