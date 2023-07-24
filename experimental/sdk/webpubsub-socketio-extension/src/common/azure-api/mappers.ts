// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Temporarily used before invoke is public. Copied from https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/web-pubsub/web-pubsub/src/generated/models/mappers.ts
 */
import * as coreClient from "@azure/core-client";

export const ErrorDetail: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "ErrorDetail",
    modelProperties: {
      code: {
        serializedName: "code",
        type: {
          name: "String",
        },
      },
      message: {
        serializedName: "message",
        type: {
          name: "String",
        },
      },
      target: {
        serializedName: "target",
        type: {
          name: "String",
        },
      },
      details: {
        serializedName: "details",
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className: "ErrorDetail",
            },
          },
        },
      },
      inner: {
        serializedName: "inner",
        type: {
          name: "Composite",
          className: "InnerError",
        },
      },
    },
  },
};

export const WebPubSubInvokeExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubInvokeExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String",
        },
      },
    },
  },
};
