// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = async function (context, req, wpsReq) {
  if (wpsReq.request == null)
  {
    return wpsReq.response;
  }
  else {
    context.bindings.actions = {
      "actionName": "sendToAll",
      "data": JSON.stringify(wpsReq.request.message),
      "dataType": wpsReq.request.dataType
    };
    return { body: { from: '[System]', content: 'ack.'} };
  }
};
