#!/usr/bin/env bash
#
# Provision + deploy a hosted Microsoft Foundry agent for the agent-relay sample.
#
# This is a thin, interactive wrapper around the `azd ai agent` flow. It creates
# BILLABLE Azure resources. Tear them down with `azd down` (from ./agent) when done.
#
# It targets the `azd ai agent` surface that scaffolds from --protocol/--model
# (no `sample` subcommand, no --runtime/--entry-point). Check yours with:
#   azd ai agent init --help
#
# Prereqs:
#   - azd installed and logged in: `azd auth login`
#     If your subscription is in a non-home tenant, log in scoped to it to avoid
#     "Login expired" during subscription lookup:
#       azd auth login --tenant-id "$(az account show --query tenantId -o tsv)"
#   - agents extension: `azd extension install azure.ai.agents`
#
# Useful overrides (env vars):
#   AGENT_DIR=agent              # where the azd project is created
#   AZURE_SUBSCRIPTION_ID=<id>   # else resolved from `az account show`
#   LOCATION=northcentralus
#   ENV_NAME=<azd-env-name>
#   FOUNDRY_MODEL_NAME=gpt-4.1-mini
#   PROTOCOL=responses           # the connector uses the Responses endpoint
#   STARTER_TEMPLATE=Azure-Samples/azd-ai-starter-basic
#   PROJECT_ID=<arm-id>          # reuse an existing Foundry project instead of a new one
#
set -euo pipefail

on_error() {
  echo "" >&2
  echo "Setup failed. If the message mentions 'Login expired' or 'Unauthenticated', azd's" >&2
  echo "token store is stale. Quickest fix is to delegate auth to the Azure CLI:" >&2
  echo "  azd config set auth.useAzCliAuth \"true\" && az login" >&2
  echo "See foundry-agent/README.md > 'Troubleshooting auth' for alternatives." >&2
}
trap on_error ERR

AGENT_DIR="${AGENT_DIR:-agent}"
MODEL_NAME="${FOUNDRY_MODEL_NAME:-gpt-4.1-mini}"
PROTOCOL="${PROTOCOL:-responses}"
STARTER_TEMPLATE="${STARTER_TEMPLATE:-Azure-Samples/azd-ai-starter-basic}"
PROJECT_ID="${PROJECT_ID:-}"

echo "==> Checking azd login"
if ! azd auth login --check-status >/dev/null 2>&1; then
  echo "ERROR: not logged in. Run 'azd auth login' first." >&2
  exit 1
fi

mkdir -p "${AGENT_DIR}"
cd "${AGENT_DIR}"

# Pre-seed subscription + region into the azd env BEFORE `azd ai agent init`, so it does
# NOT fall into the interactive "select a subscription" prompt (the step that fails with
# "Login expired"). Resolve from env or the az CLI; fall back to interactive if unknown.
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-$(az account show --query id -o tsv 2>/dev/null || true)}"
LOCATION="${LOCATION:-northcentralus}"
ENV_NAME="${ENV_NAME:-relay-foundry-$(head -c3 /dev/urandom | od -An -tx1 | tr -d ' \n')}"

echo "==> Bootstrapping the azd project (azd init)"
if [[ -n "${SUBSCRIPTION_ID}" ]]; then
  echo "    subscription: ${SUBSCRIPTION_ID}"
  echo "    region:       ${LOCATION}"
  echo "    env:          ${ENV_NAME}"
  azd init -t "${STARTER_TEMPLATE}" . \
    -e "${ENV_NAME}" \
    --subscription "${SUBSCRIPTION_ID}" \
    -l "${LOCATION}" \
    --no-prompt
else
  echo "    (no subscription resolved; azd will prompt for env name, subscription, region)"
  azd init -t "${STARTER_TEMPLATE}" .
fi

echo "==> Adding the hosted agent (azd ai agent init)"
echo "    protocol=${PROTOCOL}, model=${MODEL_NAME}"
echo "    azd may prompt for the agent name and a new/existing Foundry project."
INIT_ARGS=( --protocol "${PROTOCOL}" --model "${MODEL_NAME}" )
[[ -n "${PROJECT_ID}" ]] && INIT_ARGS+=( --project-id "${PROJECT_ID}" )
azd ai agent init "${INIT_ARGS[@]}"

echo "==> Provisioning Azure resources (billable)"
azd provision

echo "==> Deploying the hosted agent"
azd deploy

echo ""
echo "================================================================"
echo "Done. Copy these two values into ../.env :"
echo "----------------------------------------------------------------"
echo "# FOUNDRY_PROJECT_ENDPOINT  (look for the *PROJECT_ENDPOINT line)"
azd env get-values 2>/dev/null | grep -iE 'PROJECT_ENDPOINT' || \
  echo "  (run: azd env get-values | grep -i project_endpoint)"
echo ""
echo "# FOUNDRY_AGENT_NAME  (the deployed agent's name, from the status below)"
azd ai agent show 2>/dev/null || echo "  (run: azd ai agent show)"
echo "================================================================"
echo "Then, from the sample root:  npm run connector:foundry"
echo "Tear down when finished:     (cd ${AGENT_DIR} && azd down)"
