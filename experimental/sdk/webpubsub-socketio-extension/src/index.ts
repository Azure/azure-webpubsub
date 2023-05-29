import { addProperty, WebPubSubExtensionOptions } from "./common/utils";
import { useAzureWebPubSub } from "./SIO";
import * as SIO from "socket.io";

/**
 * User could call this empty method to ensure this package will be imported.
 * Under some circumstances, node skips importing this package for user's code has no explicit usage of this package.
 */ 
export const init = () => {};

declare module "socket.io" {
    interface Server {
        useAzureWebPubSub(this: Server, webPubSubOptions: WebPubSubExtensionOptions): Server;
    }
}

addProperty(SIO.Server.prototype, "useAzureWebPubSub", useAzureWebPubSub);

export * from "./EIO";
export * from "./SIO";
export { WebPubSubExtensionOptions }