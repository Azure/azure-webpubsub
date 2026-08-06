/**
 * FoundryBackend: delegates to a HOSTED Microsoft Foundry agent.
 *
 * The agent runtime lives in Foundry's managed compute (your container code).
 * This connector owns no model logic; it invokes the hosted agent's OpenAI-compatible Responses endpoint and relays the streamed output back through Web PubSub.
 *
 * Why front a directly-reachable managed endpoint with a connector? To keep ONE uniform plane (auth, fan-out, revocation, control-plane decoupling) across every agent, reachable or not. See the README, "What calling Foundry directly would cost."
 *
 * NOTE: hosted agents are in preview. The base URL, AAD scope, and whether `model` is required can shift.
 * All three are env-configurable and isolated here, so you can adjust without touching the relay or control plane.
 * Verify your endpoint with `azd ai agent show --output json`.
 */
import OpenAI from "openai";
import { DefaultAzureCredential } from "@azure/identity";
import {
  type AgentBackend,
  type TaskMessage,
} from "../../shared/protocol.ts";

export class FoundryBackend implements AgentBackend {
  readonly agentId = process.env.AGENT_ID ?? "foundry-agent";
  readonly displayName =
    process.env.AGENT_DISPLAY_NAME ?? "Hosted Foundry agent (managed compute)";

  private readonly credential = new DefaultAzureCredential();
  private readonly scope = process.env.FOUNDRY_AAD_SCOPE ?? "https://ai.azure.com/.default";
  private readonly model = process.env.FOUNDRY_MODEL ?? "gpt-4.1-mini";
  // Foundry's data-plane endpoints require an api-version query param. The OpenAI SDK
  // does not add one, so we inject it via defaultQuery. Override if your endpoint differs.
  private readonly apiVersion = process.env.FOUNDRY_API_VERSION ?? "2025-11-15-preview";
  private readonly baseURL: string;

  constructor() {
    const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
    const name = process.env.FOUNDRY_AGENT_NAME;
    if (!endpoint || !name) {
      throw new Error(
        "FoundryBackend requires FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME. " +
          "Deploy the hosted agent first (see foundry-agent/README.md), then set them in .env.",
      );
    }
    // Dedicated hosted-agent Responses endpoint. The OpenAI SDK POSTs to `${baseURL}/responses`.
    this.baseURL =
      process.env.FOUNDRY_OPENAI_BASE_URL ??
      `${endpoint.replace(/\/$/, "")}/agents/${name}/endpoint/protocols/openai`;
  }

  async *handleTask(task: TaskMessage): AsyncIterable<string> {
    // Fresh AAD token per task (low volume; keeps the sample simple). The OpenAI SDK sends `apiKey` as `Authorization: Bearer <token>`, which is what Foundry expects.
    const token = await this.credential.getToken(this.scope);
    if (!token) throw new Error("failed to acquire AAD token for Foundry");

    const client = new OpenAI({
      baseURL: this.baseURL,
      apiKey: token.token,
      defaultQuery: { "api-version": this.apiVersion },
    });

    const stream = await client.responses.create({
      model: this.model,
      input: task.text,
      stream: true,
    });

    for await (const event of stream as any) {
      if (event.type === "response.output_text.delta" && event.delta) {
        yield event.delta as string;
      }
    }
  }
}
