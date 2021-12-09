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
      "data": wpsReq.request.data,
      "dataType": wpsReq.request.dataType
    };

    var msgCounter = 1;
    var time = Date.now();
    var lastTime = time;
    if (wpsReq.request.connectionContext.headers["ce-connectionState"] != null)
    {
      var existHeader = JSON.parse((Buffer.from(wpsReq.request.connectionContext.headers["ce-connectionState"][0], 'base64')).toString());
      if (existHeader != null)
      {
        var existState = existHeader.counterState;
        msgCounter = ++existState.counter;
        lastTime = existState.time;
      }
    }
    var state = {
      counter: msgCounter,
      time: time
    };
    var stateHeader = {
      counterState: state
    };
    return { 
      body: { from: '[System]', content: `ack, idle: ${(time - lastTime)/1000}s, connection message counter: ${msgCounter}.`}, 
      headers: { "ce-connectionState": Buffer.from(JSON.stringify(stateHeader)).toString('base64')} 
    };
  }
};
