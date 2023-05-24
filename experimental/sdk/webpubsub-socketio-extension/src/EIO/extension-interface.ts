import { WebPubSubExtensionOptions, debugModule, addProperty } from "../common/utils"
import { useAzureWebPubSubForEio } from "./extension";
import * as engine from "engine.io";

const debug = debugModule("wps-sio-ext:EIO:extension-interface");

debug("load");

declare module "engine.io" {
    interface Server {
        useAzureWebPubSubForEio(this: Server, wpsOptions: WebPubSubExtensionOptions): Server;
        wpsOptions: WebPubSubExtensionOptions;
    }
}

addProperty(engine.Server.prototype, 'useAzureWebPubSubForEio', useAzureWebPubSubForEio);
   
export { useAzureWebPubSubForEio };