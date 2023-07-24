// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as coreClient from "@azure/core-client";
import * as parameters from "./parameters";
import * as mappers from "./mappers";

const serializer = coreClient.createSerializer(mappers, /* isXml */ false);

export function getInvokeOperationSpec(baseUrl: string): coreClient.OperationSpec {
  return {
    baseUrl: baseUrl,
    path: "/api/hubs/{hub}/:invoke",
    httpMethod: "POST",
    responses: {
      200: {
        bodyMapper: { type: { name: "Stream" }, serializedName: "parsedResponse" },
      },
      default: {
        bodyMapper: mappers.ErrorDetail,
        headersMapper: mappers.WebPubSubInvokeExceptionHeaders,
      },
    },
    requestBody: parameters.message,
    queryParameters: [parameters.apiVersion, parameters.excludedConnections, parameters.filter],
    urlParameters: [parameters.endpoint, parameters.hub],
    headerParameters: [parameters.contentType, parameters.accept],
    mediaType: "text",
    serializer,
  };
}
