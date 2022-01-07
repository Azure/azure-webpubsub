// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = async function (context, req, wpsReq) {
  return wpsReq.response;
  //context.res.setHeader("WebHook-Allowed-Origin", "*");
  //return context.res;
}
