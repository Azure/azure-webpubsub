// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = function (context, connectionContext) {
  //context.log(`Connection ${connectionContext.connectionId} connect.`);
  //context.log(`SubProtocols = ${context.bindingData.subprotocols}`);
  if (connectionContext.userId == "attacker")
  {
    var connectResponse = {
      "error" : {
        "errorcode": "unauthorized",
        "message": "invalid user"
      }
    }
  }
  else 
  {
    var connectResponse = {
      "userId": connectionContext.userId
    };
  }
  context.response = { body: connectResponse};
  context.done();
};

