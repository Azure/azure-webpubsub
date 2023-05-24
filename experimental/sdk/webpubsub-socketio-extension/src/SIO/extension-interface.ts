import { debugModule, addProperty, WebPubSubExtensionOptions } from "../common/utils"
import { useAzureWebPubSubForSio } from "./extension";
import * as SIO from "socket.io"

const debug = debugModule("wps-sio-ext:SIO:extension-interface");
debug("load");

declare module 'socket.io' {
    interface Server {
        useAzureWebPubSub(this: Server, wpsOptions: WebPubSubExtensionOptions): Server;
    }
}

addProperty(SIO.Server.prototype, "useAzureWebPubSub", useAzureWebPubSubForSio);

export { useAzureWebPubSubForSio };