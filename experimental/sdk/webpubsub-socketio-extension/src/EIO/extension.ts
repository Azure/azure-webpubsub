import { WebPubSubExtensionOptions, debugModule} from "../common/utils"
import * as engine from "engine.io";

const debug = debugModule("wps-sio-ext:EIO:extension");

function useAzureWebPubSubForEio(this: engine.Server, wpsOptions: WebPubSubExtensionOptions): engine.Server {
    debug("use Azure Web PubSub For Engine.IO Server");
    
    throw new Error("Not implemented");
}

export { useAzureWebPubSubForEio };