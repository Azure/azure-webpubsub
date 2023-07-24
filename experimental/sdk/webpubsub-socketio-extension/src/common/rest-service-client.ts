import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubServiceCaller } from "awps-tunnel-proxies";
import { getInvokeOperationSpec } from "./azure-api/operation-spec";
import { debugModule } from "./utils";
import * as coreClient from "@azure/core-client";

const debug = debugModule("wps-sio-ext:common:rest-service-client");

/**
 * Communicate with Azure Web PubSub service via traditional REST API.
 */
export class RestServiceClient extends WebPubSubServiceClient implements WebPubSubServiceCaller {
  async invoke(
    message: string,
    bodyHandler: (data: Uint8Array, end: boolean) => void,
    options?: { filter: string; contentType: string }
  ): Promise<void> {
    const onResponse = (rawResponse: coreClient.FullOperationResponse, flatResponse: unknown, error?: unknown) => {
      if (error || rawResponse.status !== 200) {
        // Log and do nothing, let it timeout
        debug(`broadcastWithAck response status code = ${rawResponse["status"]}, error = ${error}, rawResponse = ${JSON.stringify(rawResponse)}`);
        return;
      }

      if (rawResponse.browserStreamBody) {
        // Browser stream
        const reader = rawResponse.browserStreamBody["getReader"]();
        reader.read().then(function processText({ done, value }) { bodyHandler(value, done); });
      } 
      else {
        const stream = rawResponse["readableStreamBody"];
        stream.on("end", () => { bodyHandler(undefined, true); });
        stream.on("data", (chunk) => { bodyHandler(chunk.toString(), false); });
      }
    };

    const operationArguments: coreClient.OperationArguments = {
      ...options,
      hub: this.hubName,
      message: message,
      options: { onResponse: onResponse },
      filter: options?.filter,
      contentType: options?.contentType,
    };

    await (this["client"] as coreClient.ServiceClient).sendOperationRequest(
      operationArguments,
      getInvokeOperationSpec(this.endpoint)
    );
  }
}
