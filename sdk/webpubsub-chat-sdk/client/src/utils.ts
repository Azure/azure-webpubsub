import { WebPubSubClient } from "@azure/web-pubsub-client";

export function decodeMessageBody(base64: string | null | undefined): string {
  if (!base64) return "";
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  // compatibility for browser environment
  return decodeURIComponent(escape(atob(base64))); 
}


/**
 * Type guard for WebPubSubClient.
 * We avoid using `instanceof` because it can fail in scenarios with multiple
 * dependency copies (e.g., monorepo with yarn/pnpm link) or across different
 * execution contexts (iframe, worker). Instead, we check for stable public
 * methods to ensure reliable detection.
 */
export function isWebPubSubClient(obj: unknown): obj is WebPubSubClient {
  if (typeof obj !== "object" || obj === null) return false;
  const anyObj = obj as any;
  return (
    typeof anyObj === "object" &&
    (
      typeof anyObj.start === "function" || 
      typeof anyObj.stop === "function"  || 
      typeof anyObj.on === "function"
    )
  );
}