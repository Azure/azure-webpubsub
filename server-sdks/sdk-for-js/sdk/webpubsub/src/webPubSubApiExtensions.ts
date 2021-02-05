/*
 AutoRest has issue generating code from :
 "consumes": [
          "application/octet-stream",
          "text/plain"
        ],
        "parameters": [
          {
            "in": "body",
            "name": "payloadMessage",
            "required": true,
            "schema": {
              "format": "binary",
              "type": "string"
            }
          }

*/
import * as msRest from "@azure/ms-rest-js";
import * as Models from "./generated/models";
import * as Mappers from "./generated/models/webPubSubApiMappers";
import * as Parameters from "./generated/models/parameters";
import { WebPubSubServiceClientContext } from "./generated/webPubSubServiceClientContext";


/** Class representing a WebPubSubApi. */
export class WebPubSubSendApi {
  private readonly client: WebPubSubServiceClientContext;

  /**
   * Create a WebPubSubApi.
   * @param {WebPubSubServiceClientContext} client Reference to the service client.
   */
  constructor(client: WebPubSubServiceClientContext) {
    this.client = client;
  }

  /**
   * @summary Broadcast content inside request body to all the connected client connections
   * @param payloadMessage
   * @param [options] The optional parameters
   * @returns Promise<msRest.RestResponse>
   */
  broadcast(payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiBroadcastOptionalParams): Promise<msRest.RestResponse>;
  /**
   * @param payloadMessage
   * @param callback The callback
   */
  broadcast(payloadMessage: string | msRest.HttpRequestBody, callback: msRest.ServiceCallback<void>): void;
  /**
   * @param payloadMessage
   * @param options The optional parameters
   * @param callback The callback
   */
  broadcast(payloadMessage: string | msRest.HttpRequestBody, options: Models.WebPubSubApiBroadcastOptionalParams, callback: msRest.ServiceCallback<void>): void;
  broadcast(payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiBroadcastOptionalParams | msRest.ServiceCallback<void>, callback?: msRest.ServiceCallback<void>): Promise<msRest.RestResponse> {
    return this.client.sendOperationRequest(
      {
        payloadMessage,
        options
      },
      fulfillSpec(payloadMessage, broadcastOperationSpec),
      callback);
  }

  /**
   * @summary Send content inside request body to the specific user.
   * @param id The user Id.
   * @param payloadMessage
   * @param [options] The optional parameters
   * @returns Promise<msRest.RestResponse>
   */
  sendToUser(id: string, payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiSendToUserOptionalParams): Promise<msRest.RestResponse>;
  /**
   * @param id The user Id.
   * @param payloadMessage
   * @param callback The callback
   */
  sendToUser(id: string, payloadMessage: string | msRest.HttpRequestBody, callback: msRest.ServiceCallback<void>): void;
  /**
   * @param id The user Id.
   * @param payloadMessage
   * @param options The optional parameters
   * @param callback The callback
   */
  sendToUser(id: string, payloadMessage: string | msRest.HttpRequestBody, options: Models.WebPubSubApiSendToUserOptionalParams, callback: msRest.ServiceCallback<void>): void;
  sendToUser(id: string, payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiSendToUserOptionalParams | msRest.ServiceCallback<void>, callback?: msRest.ServiceCallback<void>): Promise<msRest.RestResponse> {
    return this.client.sendOperationRequest(
      {
        id,
        payloadMessage,
        options
      },
      fulfillSpec(payloadMessage, sendToUserOperationSpec),
      callback);
  }

  /**
   * @summary Send content inside request body to the specific connection.
   * @param connectionId The connection Id.
   * @param payloadMessage
   * @param [options] The optional parameters
   * @returns Promise<msRest.RestResponse>
   */
  sendToConnection(connectionId: string, payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiSendToConnectionOptionalParams): Promise<msRest.RestResponse>;
  /**
   * @param connectionId The connection Id.
   * @param payloadMessage
   * @param callback The callback
   */
  sendToConnection(connectionId: string, payloadMessage: string | msRest.HttpRequestBody, callback: msRest.ServiceCallback<void>): void;
  /**
   * @param connectionId The connection Id.
   * @param payloadMessage
   * @param options The optional parameters
   * @param callback The callback
   */
  sendToConnection(connectionId: string, payloadMessage: string | msRest.HttpRequestBody, options: Models.WebPubSubApiSendToConnectionOptionalParams, callback: msRest.ServiceCallback<void>): void;
  sendToConnection(connectionId: string, payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiSendToConnectionOptionalParams | msRest.ServiceCallback<void>, callback?: msRest.ServiceCallback<void>): Promise<msRest.RestResponse> {
    return this.client.sendOperationRequest(
      {
        connectionId,
        payloadMessage,
        options
      },
      fulfillSpec(payloadMessage, sendToConnectionOperationSpec),
      callback);
  }

  /**
   * @summary Send content inside request body to a group of connections.
   * @param group Target group name, which length should be greater than 0 and less than 1025.
   * @param payloadMessage
   * @param [options] The optional parameters
   * @returns Promise<msRest.RestResponse>
   */
  groupBroadcast(group: string, payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiGroupBroadcastOptionalParams): Promise<msRest.RestResponse>;
  /**
   * @param group Target group name, which length should be greater than 0 and less than 1025.
   * @param payloadMessage
   * @param callback The callback
   */
  groupBroadcast(group: string, payloadMessage: string | msRest.HttpRequestBody, callback: msRest.ServiceCallback<void>): void;
  /**
   * @param group Target group name, which length should be greater than 0 and less than 1025.
   * @param payloadMessage
   * @param options The optional parameters
   * @param callback The callback
   */
  groupBroadcast(group: string, payloadMessage: string | msRest.HttpRequestBody, options: Models.WebPubSubApiGroupBroadcastOptionalParams, callback: msRest.ServiceCallback<void>): void;
  groupBroadcast(group: string, payloadMessage: string | msRest.HttpRequestBody, options?: Models.WebPubSubApiGroupBroadcastOptionalParams | msRest.ServiceCallback<void>, callback?: msRest.ServiceCallback<void>): Promise<msRest.RestResponse> {
    return this.client.sendOperationRequest(
      {
        group,
        payloadMessage,
        options
      },
      fulfillSpec(payloadMessage, groupBroadcastOperationSpec),
      callback);
  }
}

// Operation Specifications
const serializer = new msRest.Serializer(Mappers);
const broadcastOperationSpec: msRest.OperationSpec = {
  httpMethod: "POST",
  path: "api/:send",
  queryParameters: [
    Parameters.hub,
    Parameters.excluded,
    Parameters.apiVersion
  ],
  headerParameters: [
    Parameters.acceptLanguage
  ],
  responses: {
    202: {},
    default: {
      bodyMapper: Mappers.CloudError
    }
  },
  serializer
};

const sendToUserOperationSpec: msRest.OperationSpec = {
  httpMethod: "POST",
  path: "api/users/{id}/:send",
  urlParameters: [
    Parameters.id
  ],
  queryParameters: [
    Parameters.hub,
    Parameters.apiVersion
  ],
  headerParameters: [
    Parameters.acceptLanguage
  ],
  responses: {
    202: {},
    default: {
      bodyMapper: Mappers.CloudError
    }
  },
  serializer
};

const sendToConnectionOperationSpec: msRest.OperationSpec = {
  httpMethod: "POST",
  path: "api/connections/{connectionId}/:send",
  urlParameters: [
    Parameters.connectionId0
  ],
  queryParameters: [
    Parameters.hub,
    Parameters.apiVersion
  ],
  headerParameters: [
    Parameters.acceptLanguage
  ],
  responses: {
    202: {},
    default: {
      bodyMapper: Mappers.CloudError
    }
  },
  serializer
};

const groupBroadcastOperationSpec: msRest.OperationSpec = {
  httpMethod: "POST",
  path: "api/groups/{group}/:send",
  urlParameters: [
    Parameters.group0
  ],
  queryParameters: [
    Parameters.hub,
    Parameters.excluded,
    Parameters.apiVersion
  ],
  headerParameters: [
    Parameters.acceptLanguage
  ],
  responses: {
    202: {},
    default: {
      bodyMapper: Mappers.CloudError
    }
  },
  serializer
};

function fulfillSpec(payloadMessage: string | msRest.HttpRequestBody, baseSepc: msRest.OperationSpec): msRest.OperationSpec {
  if (typeof payloadMessage === "string") {
    return {
      ...baseSepc,
      requestBody: {
        parameterPath: "payloadMessage",
        mapper: {
          required: true,
          serializedName: "payloadMessage",
          type: {
            name: "String"
          }
        }
      },
      contentType: "text/plain"
    }
  } else {
    return {
      ...baseSepc,
      requestBody: {
        parameterPath: "payloadMessage",
        mapper: {
          required: true,
          serializedName: "payloadMessage",
          type: {
            name: "Stream"
          }
        }
      },
      contentType: "application/octet-stream",
    }
  }
}