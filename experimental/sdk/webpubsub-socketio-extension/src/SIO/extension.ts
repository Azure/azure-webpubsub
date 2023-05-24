import { debugModule, WebPubSubExtensionOptions } from "../common/utils"
import { useAzureWebPubSubForEio } from "../EIO/extension";
import * as SIO from "socket.io"

const debug = debugModule("wps-sio-ext:SIO:extension");

function useAzureWebPubSubForSio(this: SIO.Server, wpsOptions: WebPubSubExtensionOptions, useDefaultAdapter: boolean = true): SIO.Server {
    debug("use Azure Web PubSub For Socket.IO Server");
    useAzureWebPubSubForEio.apply(this.engine, [wpsOptions]);
    throw new Error("Not implemented");
}

export { useAzureWebPubSubForSio }