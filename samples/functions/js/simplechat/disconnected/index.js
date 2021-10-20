// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = function (context, request) {
  context.bindings.webPubSubEvent = [];
  context.bindings.webPubSubEvent.push({
    "operationKind": "sendToAll",
    "message": JSON.stringify({
        from: '[System]',
        content: `${context.bindingData.connectionContext.userId} disconnected.`
      }),
    "dataType" : "json"
  });
  context.done();
};