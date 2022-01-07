// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = function (context, req) {
  context.bindings.actions = [];
  context.bindings.actions.push({
    "actionName": "sendToAll",
    "data": JSON.stringify({
        from: '[System]',
        content: `${context.bindings.wpsReq.request.connectionContext.userId} connected.`
      }),
    "dataType" : "json"
  });

  context.bindings.actions.push({
    "actionName": "addUserToGroup",
    "userId": `${context.bindings.wpsReq.request.connectionContext.userId}`,
    "group": "group1"
  });

  context.bindings.actions.push({
    "actionName": "sendToAll",
    "data": JSON.stringify({
          from: '[System]',
          content: `${context.bindings.wpsReq.request.connectionContext.userId} joined group: group1.`
      }),
    "dataType": "json"
  });
  context.done();
};