/*
 * Code generated by Microsoft (R) AutoRest Code Generator.
 * Changes may cause incorrect behavior and will be lost if the code is
 * regenerated.
 */

import * as msRest from "@azure/ms-rest-js";
import * as Models from "../models";
import * as Mappers from "../models/healthApiMappers";
import * as Parameters from "../models/parameters";
import { WebPubSubServiceClientContext } from "../webPubSubServiceClientContext";

/** Class representing a HealthApi. */
export class HealthApi {
  private readonly client: WebPubSubServiceClientContext;

  /**
   * Create a HealthApi.
   * @param {WebPubSubServiceClientContext} client Reference to the service client.
   */
  constructor(client: WebPubSubServiceClientContext) {
    this.client = client;
  }

  /**
   * @summary Get service health status.
   * @param [options] The optional parameters
   * @returns Promise<msRest.RestResponse>
   */
  getHealthStatus(options?: Models.HealthApiGetHealthStatusOptionalParams): Promise<msRest.RestResponse>;
  /**
   * @param callback The callback
   */
  getHealthStatus(callback: msRest.ServiceCallback<void>): void;
  /**
   * @param options The optional parameters
   * @param callback The callback
   */
  getHealthStatus(options: Models.HealthApiGetHealthStatusOptionalParams, callback: msRest.ServiceCallback<void>): void;
  getHealthStatus(options?: Models.HealthApiGetHealthStatusOptionalParams | msRest.ServiceCallback<void>, callback?: msRest.ServiceCallback<void>): Promise<msRest.RestResponse> {
    return this.client.sendOperationRequest(
      {
        options
      },
      getHealthStatusOperationSpec,
      callback);
  }
}

// Operation Specifications
const serializer = new msRest.Serializer(Mappers);
const getHealthStatusOperationSpec: msRest.OperationSpec = {
  httpMethod: "HEAD",
  path: "api/health",
  queryParameters: [
    Parameters.apiVersion
  ],
  headerParameters: [
    Parameters.acceptLanguage
  ],
  responses: {
    200: {},
    default: {
      bodyMapper: Mappers.CloudError
    }
  },
  serializer
};
