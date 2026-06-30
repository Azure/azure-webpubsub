/**
 * Connector core: the shared, backend-agnostic outbound relay client.
 * Identical for every agent. It:
 *   1. Asks the control plane for a Web PubSub client access URL (outbound only).
 *   2. Connects to Web PubSub and joins its agent group.
 *   3. Runs tasks through the injected AgentBackend, streaming results to the session group.
 * Swapping mock and Foundry changes only the injected AgentBackend, nothing here.
 */
import WebSocket from "ws";
import { CONTROL_PLANE_URL } from "../shared/config.ts";
import {
  PUBSUB_SUBPROTOCOL,
  groupForSession,
  type AgentBackend,
  type ChunkMessage,
  type DoneMessage,
  type ErrorMessage,
  type TaskMessage,
} from "../shared/protocol.ts";

const RECONNECT_DELAY_MS = 2000;

export class Connector {
  private ws?: WebSocket;
  private ackId = 0;

  constructor(private readonly backend: AgentBackend) {}

  async start(): Promise<void> {
    await this.register();
    this.connect();
  }

  /** Tell the control plane this agent exists so the UI can list it. */
  private async register(): Promise<void> {
    const res = await fetch(`${CONTROL_PLANE_URL}/agents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: this.backend.agentId,
        displayName: this.backend.displayName,
        kind: this.backend.agentId,
      }),
    });
    if (!res.ok) throw new Error(`register failed: ${res.status}`);
    console.log(`[connector:${this.backend.agentId}] registered with control plane`);
  }

  /** Fetch a fresh client access URL (the connector never holds WPS credentials). */
  private async negotiate(): Promise<string> {
    const res = await fetch(
      `${CONTROL_PLANE_URL}/negotiate/agent?agentId=${encodeURIComponent(this.backend.agentId)}`,
    );
    if (!res.ok) throw new Error(`negotiate failed: ${res.status}`);
    const { url } = (await res.json()) as { url: string };
    return url;
  }

  private connect(): void {
    this.negotiate()
      .then((url) => {
        const ws = new WebSocket(url, PUBSUB_SUBPROTOCOL);
        this.ws = ws;

        ws.on("open", () =>
          console.log(`[connector:${this.backend.agentId}] connected, awaiting tasks`),
        );
        ws.on("message", (data) => this.onFrame(data.toString()));
        ws.on("close", () => {
          console.warn(`[connector:${this.backend.agentId}] disconnected, retrying...`);
          setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
        });
        ws.on("error", (err) =>
          console.error(`[connector:${this.backend.agentId}] ws error:`, err.message),
        );
      })
      .catch((err) => {
        console.error(`[connector:${this.backend.agentId}] connect failed:`, err.message);
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      });
  }

  /** Handle an inbound Web PubSub frame; we only care about group messages. */
  private onFrame(raw: string): void {
    let frame: any;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.type !== "message" || frame.from !== "group") return;

    let payload: any;
    try {
      payload = typeof frame.data === "string" ? JSON.parse(frame.data) : frame.data;
    } catch {
      return;
    }
    if (payload?.type === "task") {
      void this.runTask(payload as TaskMessage);
    }
  }

  /** Run one task through the backend and stream chunks back to the session group. */
  private async runTask(task: TaskMessage): Promise<void> {
    const group = groupForSession(task.sessionId);
    console.log(
      `[connector:${this.backend.agentId}] task ${task.taskId.slice(0, 8)} -> "${task.text}"`,
    );
    let seq = 0;
    try {
      for await (const text of this.backend.handleTask(task)) {
        const chunk: ChunkMessage = {
          type: "chunk",
          taskId: task.taskId,
          sessionId: task.sessionId,
          seq: seq++,
          text,
        };
        this.sendToGroup(group, chunk);
      }
      const done: DoneMessage = { type: "done", taskId: task.taskId, sessionId: task.sessionId };
      this.sendToGroup(group, done);
    } catch (err: any) {
      const error: ErrorMessage = {
        type: "error",
        taskId: task.taskId,
        sessionId: task.sessionId,
        message: err?.message ?? "agent backend failed",
      };
      this.sendToGroup(group, error);
      console.error(`[connector:${this.backend.agentId}] task failed:`, err?.message);
    }
  }

  /** Publish a message to a session group via the Web PubSub subprotocol. */
  private sendToGroup(group: string, message: object): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "sendToGroup",
        group,
        dataType: "text",
        data: JSON.stringify(message),
        ackId: ++this.ackId,
      }),
    );
  }
}
