/**
 * Control plane. Responsibilities (and nothing more):
 *   - Mint short-lived Web PubSub client access tokens for connectors and browser clients.
 *   - Track which agents are available and which session is bound to which agent.
 *   - Dispatch a task to the chosen agent's group.
 *   - Serve the static web client.
 * It is agnostic to how any agent runs: a mock agent and a hosted Foundry agent are indistinguishable here, both just an agentId with a group.
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import {
  CONTROL_PLANE_PORT,
  createServiceClient,
} from "../shared/config.ts";
import {
  groupForAgent,
  groupForSession,
  type TaskMessage,
} from "../shared/protocol.ts";

const service = createServiceClient();

interface AgentInfo {
  id: string;
  displayName: string;
  kind: string;
  lastSeen: number;
}
interface SessionInfo {
  id: string;
  agentId: string;
}

const agents = new Map<string, AgentInfo>();
const sessions = new Map<string, SessionInfo>();

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9-]/g, "-");

const app = express();
app.use(express.json());

// --- Static web client ---
const here = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(here, "..", "web")));

// --- Agent registration (connectors call this on startup) ---
app.post("/agents/register", (req, res) => {
  const { id, displayName, kind } = req.body ?? {};
  if (!id) return res.status(400).json({ error: "id required" });
  agents.set(id, {
    id,
    displayName: displayName ?? id,
    kind: kind ?? "unknown",
    lastSeen: Date.now(),
  });
  console.log(`[control-plane] agent registered: ${id} (${kind})`);
  res.json({ ok: true });
});

app.get("/agents", (_req, res) => {
  res.json([...agents.values()]);
});

/**
 * Negotiate a token for a CONNECTOR.
 * The connector is auto-joined to its own agent group and is allowed to send to
 * session groups (which it only learns at task time). Least privilege beyond that.
 */
app.get("/negotiate/agent", async (req, res) => {
  try {
    const agentId = sanitize(String(req.query.agentId ?? ""));
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    const token = await service.getClientAccessToken({
      userId: `agent:${agentId}`,
      groups: [groupForAgent(agentId)],
      roles: ["webpubsub.sendToGroup"],
      expirationTimeInMinutes: 60,
    });
    res.json({ url: token.url });
  } catch (err: any) {
    console.error("[control-plane] negotiate/agent failed:", err?.message);
    res.status(500).json({ error: "token negotiation failed" });
  }
});

/**
 * Negotiate a token for a BROWSER CLIENT.
 * The client is auto-joined to its session group and only needs to RECEIVE, so no
 * send role is granted. Multiple clients can join the same session group (fan-out).
 */
app.get("/negotiate/client", async (req, res) => {
  try {
    const sessionId = sanitize(String(req.query.sessionId ?? ""));
    if (!sessions.has(sessionId))
      return res.status(404).json({ error: "unknown session" });
    const token = await service.getClientAccessToken({
      userId: `client:${sessionId}`,
      groups: [groupForSession(sessionId)],
      expirationTimeInMinutes: 60,
    });
    res.json({ url: token.url });
  } catch (err: any) {
    console.error("[control-plane] negotiate/client failed:", err?.message);
    res.status(500).json({ error: "token negotiation failed" });
  }
});

// --- Create a session bound to a chosen agent ---
app.post("/sessions", (req, res) => {
  const agentId = sanitize(String(req.body?.agentId ?? ""));
  if (!agents.has(agentId))
    return res.status(404).json({ error: "unknown agent" });
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 16);
  sessions.set(sessionId, { id: sessionId, agentId });
  res.json({ sessionId, agentId });
});

// --- Dispatch a prompt to the session's agent group ---
app.post("/sessions/:id/prompt", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "unknown session" });
  const text = String(req.body?.text ?? "");
  if (!text) return res.status(400).json({ error: "text required" });

  const task: TaskMessage = {
    type: "task",
    taskId: randomUUID(),
    sessionId: session.id,
    text,
  };
  try {
    // Send to the agent's group. The connector is a member and will pick it up.
    // Plain-text JSON keeps decoding uniform across connector (ws) and browser.
    await service
      .group(groupForAgent(session.agentId))
      .sendToAll(JSON.stringify(task), { contentType: "text/plain" });
    res.json({ ok: true, taskId: task.taskId });
  } catch (err: any) {
    console.error("[control-plane] dispatch failed:", err?.message);
    res.status(502).json({ error: "dispatch to agent failed" });
  }
});

app.listen(CONTROL_PLANE_PORT, () => {
  console.log(
    `[control-plane] listening on http://localhost:${CONTROL_PLANE_PORT}`,
  );
  console.log(`[control-plane] open the web client at http://localhost:${CONTROL_PLANE_PORT}`);
});
