/**
 * User could call this empty method to ensure this package will be imported.
 * Under some circumstances, node skips importing this package for user's code has no explicit usage of this package.
 */ 
export const init = () => {};

export { useAzureWebPubSubForSio as useAzureWebPubSub } from "./SIO";