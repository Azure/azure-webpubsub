// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Temporarily used before invoke is public. Copied from https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/web-pubsub/web-pubsub/src/generated/models/parameters.ts
 */
import * as coreClient from "@azure/core-client";

export const message: coreClient.OperationParameter = {
  parameterPath: "message",
  mapper: {
    serializedName: "message",
    required: true,
    type: {
      name: "String",
    },
  },
};

export const apiVersion: coreClient.OperationQueryParameter = {
  parameterPath: "apiVersion",
  mapper: {
    defaultValue: "2023-07-01",
    isConstant: true,
    serializedName: "api-version",
    type: {
      name: "String",
    },
  },
};

export const excludedConnections: coreClient.OperationQueryParameter = {
  parameterPath: ["options", "excludedConnections"],
  mapper: {
    serializedName: "excluded",
    type: {
      name: "Sequence",
      element: {
        type: {
          name: "String",
        },
      },
    },
  },
  collectionFormat: "Multi",
};

export const filter: coreClient.OperationQueryParameter = {
  parameterPath: ["options", "filter"],
  mapper: {
    serializedName: "filter",
    type: {
      name: "String",
    },
  },
};

export const endpoint: coreClient.OperationURLParameter = {
  parameterPath: "endpoint",
  mapper: {
    serializedName: "Endpoint",
    required: true,
    type: {
      name: "String",
    },
  },
  skipEncoding: true,
};

export const hub: coreClient.OperationURLParameter = {
  parameterPath: "hub",
  mapper: {
    constraints: {
      Pattern: new RegExp("^[A-Za-z][A-Za-z0-9_`,.[\\]]{0,127}$"),
    },
    serializedName: "hub",
    required: true,
    type: {
      name: "String",
    },
  },
};

export const contentType: coreClient.OperationParameter = {
  parameterPath: "contentType",
  mapper: {
    defaultValue: "text/plain",
    isConstant: true,
    serializedName: "Content-Type",
    type: {
      name: "String",
    },
  },
};

export const accept: coreClient.OperationParameter = {
  parameterPath: "accept",
  mapper: {
    defaultValue: "application/json",
    isConstant: true,
    serializedName: "Accept",
    type: {
      name: "String",
    },
  },
};
