/**
 * MockBackend: a stand-in for an agent in an environment the client and control plane cannot reach directly (a NAT'd laptop, an on-prem box, a sandbox).
 * This is where the relay is load-bearing: there is no public endpoint to call; the only way in is the outbound connection the connector already holds.
 * It streams a canned reply word by word so you can see the real-time relay working without any cloud dependency.
 */
import {
  type AgentBackend,
  type TaskMessage,
} from "../../shared/protocol.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockBackend implements AgentBackend {
  readonly agentId = process.env.AGENT_ID ?? "mock-agent";
  readonly displayName = process.env.AGENT_DISPLAY_NAME ?? "Local mock agent (unreachable env)";

  async *handleTask(task: TaskMessage): AsyncIterable<string> {
    const reply =
      `You said: "${task.text}". ` +
      `I'm a local mock agent running in an environment you can't dial directly — ` +
      `this reply reached you only because I hold an outbound connection to the relay.`;
    for (const word of reply.split(" ")) {
      await sleep(60);
      yield word + " ";
    }
  }
}
