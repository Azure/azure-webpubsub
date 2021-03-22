import * as coreHttp from "@azure/core-http";
import * as Parameters from "../models/parameters";
import { WebPubSubServiceClient } from "../webPubSubServiceClient";

/**
 * Class representing a HealthApi.
 */
export class HealthApi {
  private readonly client: WebPubSubServiceClient;

  /**
   * Initialize a new instance of the class HealthApi class.
   * @param client Reference to the service client
   */
  constructor(client: WebPubSubServiceClient) {
    this.client = client;
  }

  /**
   * Get service health status.
   * @param options The options parameters.
   */
  getHealthStatus(
    options?: coreHttp.OperationOptions
  ): Promise<coreHttp.RestResponse> {
    const operationOptions: coreHttp.RequestOptionsBase = coreHttp.operationOptionsToRequestOptionsBase(
      options || {}
    );
    return this.client.sendOperationRequest(
      { options: operationOptions },
      getHealthStatusOperationSpec
    ) as Promise<coreHttp.RestResponse>;
  }
}
// Operation Specifications

const serializer = new coreHttp.Serializer({}, /* isXml */ false);

const getHealthStatusOperationSpec: coreHttp.OperationSpec = {
  path: "/api/health",
  httpMethod: "HEAD",
  responses: { 200: {}, default: {} },
  queryParameters: [Parameters.apiVersion],
  urlParameters: [Parameters.$host],
  serializer
};
