// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = async function (context, request) {
  if (request.connectionContext.userId == "attacker")
  {
    var connectResponse = {
      "code": "unauthorized",
      "errorMessage": "invalid user"
    }
  }
  else 
  {
    var connectResponse = {
      "userId": request.connectionContext.userId
    };
  }
  return connectResponse;
};

