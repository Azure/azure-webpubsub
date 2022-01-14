// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = function (context, req, wpsReq) {
  console.log("response connect");
  console.log(wpsReq.request.connectionContext.userId);
  context.res = { body: {"userId": wpsReq.request.connectionContext.userId} };
  context.done();
};
