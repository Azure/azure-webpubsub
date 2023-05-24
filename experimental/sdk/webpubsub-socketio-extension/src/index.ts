import { debugModule } from "./common/utils";

const debug = debugModule("wps-sio-ext:index");

debug("load");

/**
 * User could call this empty method to ensure this package will be imported.
 * Under some circumstances, node skips importing this package for user's code has no explicit usage of this package.
 */ 
const init = () => {};

export { useAzureWebPubSubForSio as useAzureWebPubSub } from "./SIO/extension-interface";
export { init };