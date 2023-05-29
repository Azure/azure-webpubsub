import { WebPubSubExtensionOptions } from "../common/utils"
import { WebPubSubEioServer } from "../EIO";
import { WebPubSubAdapterProxy } from "./components/web-pubsub-adapter";
import * as SIO from "socket.io"

export function useAzureWebPubSub(this: SIO.Server, webPubSubOptions: WebPubSubExtensionOptions, useDefaultAdapter: boolean = true): SIO.Server {
    // @ts-ignore
    var engine = new WebPubSubEioServer(this.engine.opts, webPubSubOptions);

    // @ts-ignore
    engine.attach(this.httpServer, this.opts);

    // @ts-ignore
    this.bind(engine as any);

    if (!useDefaultAdapter) {
        var adapterProxy = new WebPubSubAdapterProxy("NotImplementedArg");

        // @ts-ignore
        this.adapter(adapterProxy);
    }
    return this;
}

export { WebPubSubAdapterProxy };