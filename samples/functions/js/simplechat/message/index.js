// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = async function (context, data) {
  context.bindings.actions = {
    "actionName": "sendToAll",
    "data": data,
    "dataType": context.bindingData.dataType
  };

  var msgCounter = 1;
  var time = Date.now();
  var lastTime = time;
  if (context.bindingData.request.connectionContext.states != null)
  {
    var metadata = JSON.parse(context.bindingData.request.connectionContext.states.metadata);
    msgCounter = ++metadata.counter;
    lastTime = metadata.time;
  }
  var response = { 
    "data": JSON.stringify({
      from: "[System]",
      content: `ack, idle: ${(time - lastTime)/1000}s, connection message counter: ${msgCounter}.`
    }),
    "dataType" : "json",
    "states": {
      "metadata": {
        counter: msgCounter,
        time : time
      }
    }
  };
  return response;
};