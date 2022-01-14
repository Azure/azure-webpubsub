// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

module.exports = async function (context, message) {
  context.bindings.actions = {
    "actionName": "sendToAll",
    "data": message,
    "dataType": context.bindingData.dataType
  };
  var response = { 
    "data": message,
    "dataType" : context.bindingData.dataType
  };
  return response;
};