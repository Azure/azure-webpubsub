/**
 * Browser client. No SDK, no bundler: just the native WebSocket speaking the Web PubSub `json.webpubsub.azure.v1` subprotocol.
 *
 * Flow:
 *   1. GET /agents                      -> list available agents
 *   2. POST /sessions {agentId}         -> sessionId (binds the session to an agent)
 *   3. GET /negotiate/client?sessionId  -> short-lived client access URL
 *   4. connect WS, auto-joined to the session group, RECEIVE streamed chunks
 *   5. POST /sessions/:id/prompt {text} -> control plane dispatches to the agent
 */
const SUBPROTOCOL = "json.webpubsub.azure.v1";

const $ = (id) => document.getElementById(id);
const agentSelect = $("agent");
const responseEl = $("response");
const logEl = $("log");

let ws = null;
let sessionId = null;

function log(msg) {
  logEl.textContent += msg + "\n";
}

async function loadAgents() {
  const agents = await (await fetch("/agents")).json();
  agentSelect.innerHTML = "";
  if (agents.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "(no agents connected — start a connector)";
    opt.disabled = true;
    agentSelect.appendChild(opt);
    return;
  }
  for (const a of agents) {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.displayName;
    agentSelect.appendChild(opt);
  }
}

async function startSession() {
  const agentId = agentSelect.value;
  if (!agentId) return;

  // Create the session, then negotiate a token scoped to its group.
  const created = await (
    await fetch("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId }),
    })
  ).json();
  sessionId = created.sessionId;

  const { url } = await (
    await fetch(`/negotiate/client?sessionId=${encodeURIComponent(sessionId)}`)
  ).json();

  if (ws) ws.close();
  ws = new WebSocket(url, SUBPROTOCOL);
  ws.onopen = () => {
    log(`session ${sessionId} connected to relay (agent: ${agentId})`);
    $("prompt").disabled = false;
    $("send").disabled = false;
  };
  ws.onclose = () => log("relay connection closed");
  ws.onmessage = (ev) => onRelayMessage(ev.data);
}

function onRelayMessage(raw) {
  let frame;
  try {
    frame = JSON.parse(raw);
  } catch {
    return;
  }
  if (frame.type !== "message") return;

  let payload;
  try {
    payload = typeof frame.data === "string" ? JSON.parse(frame.data) : frame.data;
  } catch {
    return;
  }

  switch (payload.type) {
    case "chunk":
      responseEl.textContent += payload.text;
      break;
    case "done":
      log("response complete");
      break;
    case "error":
      log("agent error: " + payload.message);
      break;
  }
}

async function sendPrompt() {
  const input = $("prompt");
  const text = input.value.trim();
  if (!text || !sessionId) return;
  responseEl.textContent = "";
  input.value = "";
  await fetch(`/sessions/${sessionId}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

$("refresh").onclick = loadAgents;
$("start").onclick = startSession;
$("send").onclick = sendPrompt;
$("prompt").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendPrompt();
});

loadAgents();

// --- Data-flow slideshow (manual stepper) ---
const FLOW_COUNT = 5;
const flowImg = $("flow-img");
const flowMissing = $("flow-missing");
const flowDots = $("flow-dots");
let flowIndex = 0;

function renderFlow() {
  flowImg.src = `flow/sample_flow_${flowIndex}.jpg`;
  flowImg.alt = `Data flow step ${flowIndex + 1} of ${FLOW_COUNT}`;
  [...flowDots.children].forEach((dot, i) =>
    dot.setAttribute("aria-current", i === flowIndex ? "true" : "false"),
  );
}

function flowGo(delta) {
  flowIndex = (flowIndex + delta + FLOW_COUNT) % FLOW_COUNT;
  renderFlow();
}

for (let i = 0; i < FLOW_COUNT; i++) {
  const dot = document.createElement("button");
  dot.className = "flow-dot";
  dot.setAttribute("aria-label", `Go to step ${i + 1}`);
  dot.onclick = () => {
    flowIndex = i;
    renderFlow();
  };
  flowDots.appendChild(dot);
}

// Show a hint (instead of a broken image) until the JPGs are added.
flowImg.onerror = () => {
  flowImg.style.display = "none";
  flowMissing.style.display = "block";
};
flowImg.onload = () => {
  flowImg.style.display = "block";
  flowMissing.style.display = "none";
};

$("flow-prev").onclick = () => flowGo(-1);
$("flow-next").onclick = () => flowGo(1);

// Arrow keys advance the slideshow, but not while typing in a field.
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "ArrowLeft") flowGo(-1);
  else if (e.key === "ArrowRight") flowGo(1);
});

renderFlow();

