/**
 * Connector entry point.
 * Usage:
 *   npm run connector:mock      # local mock agent (no cloud agent needed)
 *   npm run connector:foundry   # hosted Foundry agent
 * The ONLY difference between the two is which AgentBackend is constructed below.
 * Everything downstream (connector, relay, control plane) is identical.
 */
import { Connector } from "./connector.ts";
import { MockBackend } from "./backends/mock.ts";
import { FoundryBackend } from "./backends/foundry.ts";
import type { AgentBackend } from "../shared/protocol.ts";

const kind = (process.argv[2] ?? "mock").toLowerCase();

function makeBackend(): AgentBackend {
  switch (kind) {
    case "mock":
      return new MockBackend();
    case "foundry":
      return new FoundryBackend();
    default:
      throw new Error(`unknown backend "${kind}" (expected "mock" or "foundry")`);
  }
}

const backend = makeBackend();
console.log(`[connector] starting "${kind}" backend as agentId="${backend.agentId}"`);
new Connector(backend).start().catch((err) => {
  console.error("[connector] fatal:", err.message);
  process.exit(1);
});
