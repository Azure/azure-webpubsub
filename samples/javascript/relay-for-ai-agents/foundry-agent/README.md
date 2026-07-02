# Deploying the hosted Foundry agent

The `foundry` connector ([`../src/connector/backends/foundry.ts`](../src/connector/backends/foundry.ts))
delegates to a **hosted Microsoft Foundry agent** — your own container code running in
Foundry's managed compute. The agent runtime lives in Azure; the connector just invokes
its OpenAI-compatible **Responses** endpoint and relays the streamed output over Web PubSub.

This folder documents how to provision that hosted agent. It uses the official
`azd ai agent` tooling — we don't hand-roll the container, agent.yaml, or Dockerfile,
because those are version-sensitive and the scaffolder keeps them correct.

> **Preview note.** Hosted agents are in preview. Endpoints, the AAD scope, and whether
> `model` is required on the Responses call can change. The connector keeps all three
> env-configurable (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_AGENT_NAME`, `FOUNDRY_AAD_SCOPE`,
> `FOUNDRY_MODEL`, optional `FOUNDRY_OPENAI_BASE_URL`) so you can adjust without touching
> the relay or control plane.

## Prerequisites

- [Azure Developer CLI (`azd`)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- The agents extension: `azd extension install azure.ai.agents`
- An Azure subscription with permission to create a Foundry project + model deployment
- Logged in: `azd auth login` (we never run this for you)

## Provision + deploy

Run the helper. It's an interactive wrapper around `azd` (init → agent init → provision → deploy):

```bash
./setup-foundry.sh
```

What it does:

1. `azd init` bootstraps an azd project under `./agent/` (prompts for environment name,
   subscription, and region).
2. `azd ai agent init --protocol responses --model gpt-4.1-mini` scaffolds the hosted agent
   (may prompt for the agent name and a new/existing Foundry project).
3. `azd provision` creates the resource group, Foundry account + project, and model deployment.
4. `azd deploy` builds and registers the hosted agent version.
5. Prints the two values you need for the connector (see below).

> This creates billable Azure resources. Tear them down with `azd down` (run from `./agent/`)
> when you're finished.

> **CLI versions vary.** The `azd ai agent` extension is in preview and its commands differ
> between versions. This script targets the surface where `init` scaffolds from
> `--protocol`/`--model` (no `sample` subcommand, no `--runtime`/`--entry-point`). Check
> yours with `azd ai agent init --help` and adjust the script if your flags differ. Useful
> overrides: `FOUNDRY_MODEL_NAME`, `PROTOCOL`, `STARTER_TEMPLATE`, `PROJECT_ID`, `AGENT_DIR`.

## Wire the connector

After deploy, the script prints your project endpoint and agent name. Copy them into the
sample's `.env` (one level up):

```env
FOUNDRY_PROJECT_ENDPOINT=https://<account>.services.ai.azure.com/api/projects/<project>
FOUNDRY_AGENT_NAME=<agent-name>
```

You can re-read them any time with `azd env get-values | grep -i project_endpoint` and
`azd ai agent show`.

Then start the Foundry connector from the sample root:

```bash
npm run connector:foundry
```

It registers as a second agent. Open the web client, pick **Hosted Foundry agent**, and
send a prompt — the reply streams back over the _same_ relay the mock agent uses.

## Auth

The connector authenticates to Foundry with **AAD** via `DefaultAzureCredential`
(your `az login` / `azd auth login` identity locally; a managed identity in production).
The signed-in identity needs the **Foundry User** role on the project. No keys involved.
