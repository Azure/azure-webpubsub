import { WebPubSubServiceClient, GenerateClientTokenOptions, ClientTokenResponse } from "@azure/web-pubsub";
import { WebPubSubServiceCaller } from "../serverProxies";
import { getInvokeOperationSpec } from "./azure-api/operation-spec";
import { debugModule } from "./utils";
import { isTokenCredential } from "@azure/core-auth";
import jwt from "jsonwebtoken";

import { createTracingClient } from "@azure/core-tracing";

/** @internal */
const tracingClient = createTracingClient({
  namespace: "Microsoft.WebPubSub",
  packageName: "@azure/web-pubsub-socket.io",
});

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
        debug(`broadcastWithAck response status code = ${rawResponse["status"]}, error = ${error},\
rawResponse = ${JSON.stringify(rawResponse)}`);
        return;
      }

      if (rawResponse.browserStreamBody) {
        // Browser stream
        const reader = rawResponse.browserStreamBody["getReader"]();
        reader.read().then(function processText({ done, value }) {
          bodyHandler(value, done);
        });
      } else {
        const stream = rawResponse["readableStreamBody"];
        stream.on("end", () => {
          bodyHandler(undefined, true);
        });
        stream.on("data", (chunk) => {
          bodyHandler(chunk.toString(), false);
        });
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

  /**
   * Generate a token for a client to connect to the Azure Web PubSub service.
   *
   * @param options - Additional options
   */
  public async getClientAccessToken(options: GenerateClientTokenOptions = {}): Promise<ClientTokenResponse> {
    return tracingClient.withSpan("getClientAccessToken", options, async (updatedOptions) => {
      const endpoint = this.endpoint.endsWith("/") ? this.endpoint : this.endpoint + "/";
      const baseUrl = `${endpoint}clients/socketio/hubs/${this.hubName}`;
      const credential = this["credential"];
      const innerClient = this["client"];
      let token: string;
      if (isTokenCredential(credential)) {
        const response = await innerClient.webPubSub.generateClientToken(this.hubName, updatedOptions);
        token = response.token!;
      } else {
        const key = credential.key;
        const payload = {
          role: options?.roles,
          "webpubsub.group": options?.groups,
          customClaims: options?.["customClaims"],
          userId: options?.userId,
        };
        const signOptions: jwt.SignOptions = {
          audience: baseUrl,
          expiresIn: options?.expirationTimeInMinutes === undefined ? "1h" : `${options.expirationTimeInMinutes}m`,
          algorithm: "HS256",
        };
        if (options?.userId) {
          signOptions.subject = options?.userId;
        }
        token = jwt.sign(payload, key, signOptions);
      }

      return {
        token,
        baseUrl,
        url: `${baseUrl}?access_token=${token}`,
      };
    });
  }
}
