/**
 * Configuration + Web PubSub service-client construction.
 *
 * AAD is the default (company policy / passwordless best practice).
 * Key-based auth is supported as an opt-in via WEBPUBSUB_AUTH_MODE=key for environments that need it.
 */
import "dotenv/config";
import { DefaultAzureCredential } from "@azure/identity";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

export const HUB = process.env.WEBPUBSUB_HUB ?? "agentrelay";

export const CONTROL_PLANE_PORT = Number(process.env.CONTROL_PLANE_PORT ?? 8080);
export const CONTROL_PLANE_URL =
  process.env.CONTROL_PLANE_URL ?? `http://localhost:${CONTROL_PLANE_PORT}`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

/**
 * Build the Web PubSub service client used by the control plane to (a) mint client access tokens and (b) dispatch tasks to agent groups.
 * This is the ONLY place that touches Web PubSub credentials.
 */
export function createServiceClient(): WebPubSubServiceClient {
  const mode = (process.env.WEBPUBSUB_AUTH_MODE ?? "aad").toLowerCase();

  if (mode === "key") {
    const connectionString = requireEnv("WEBPUBSUB_CONNECTION_STRING");
    return new WebPubSubServiceClient(connectionString, HUB);
  }

  // Default: AAD / passwordless. Locally this uses your `az login` / `azd auth login` identity, which needs the "Web PubSub Service Owner" role to mint client tokens.
  const endpoint = requireEnv("WEBPUBSUB_ENDPOINT");
  return new WebPubSubServiceClient(endpoint, new DefaultAzureCredential(), HUB);
}
