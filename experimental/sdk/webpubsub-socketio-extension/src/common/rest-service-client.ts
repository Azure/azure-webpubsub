import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubServiceCaller } from "awps-tunnel-proxies";

/**
 * Communicate with Azure Web PubSub service via traditional REST API.
 */
export class RestServiceClient extends WebPubSubServiceClient implements WebPubSubServiceCaller {
}