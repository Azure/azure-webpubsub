import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubServiceCaller } from "awps-tunnel-proxies";

/**
 * Communicate with Azure Web PubSub service via traditional REST API.
 */
export class RestServiceClient extends WebPubSubServiceClient implements WebPubSubServiceCaller {
    invoke(message: string, body: (data: Uint8Array, end: boolean) => void, options?: { filter: string; contentType: string; }): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
