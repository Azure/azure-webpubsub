import { WebPubSubExtensionOptions } from "../common/utils"
import { WpsEioServer } from "../EIO";
import { WpsAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io"

export function useAzureWebPubSubForSio(this: SIO.Server, wpsOptions: WebPubSubExtensionOptions, useDefaultAdapter: boolean = true): SIO.Server {
    // @ts-ignore
    var engine = new WpsEioServer(this.engine.opts, wpsOptions);

    // @ts-ignore
    engine.attach(this.httpServer, this.opts);

    // @ts-ignore
    this.bind(engine as any);

    if (!useDefaultAdapter) {
        var adapterProxy = new WpsAdapterProxy("NotImplementedArg");

        // @ts-ignore
        this.adapter(adapterProxy);
    }
    return this;
}

export { WpsAdapter };