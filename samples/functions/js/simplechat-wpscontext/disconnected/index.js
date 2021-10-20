// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = function (context, req, wpsReq) {
  context.bindings.webPubSubEvent = [];
  context.bindings.webPubSubEvent.push({
    "operationKind": "sendToAll",
    "message": JSON.stringify({
        from: '[System]',
        content: `${wpsReq.request.connectionContext.userId} disconnected.`
      }),
    "dataType" : "json"
  });
  context.done();
};