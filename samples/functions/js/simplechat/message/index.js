// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = async function (context, message) {
  context.bindings.actions = {
    "actionName": "sendToAll",
    "data": message,
    "dataType": context.bindingData.dataType
  };

  var msgCounter = 1;
  if (context.bindingData.request.connectionContext.states != null && context.bindingData.request.connectionContext.states.counter != null)
  {
    msgCounter = parseInt(context.bindingData.request.connectionContext.states.counter);
    msgCounter++;
  }
  var response = { 
    "data": JSON.stringify({
      from: "[System]",
      content: `ack, connection message counter: ${msgCounter}.`
    }),
    "dataType" : "json",
    "states": {
      "counter": msgCounter
    }
  };
  return response;
};