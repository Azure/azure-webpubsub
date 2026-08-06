/**
 * Shared wire protocol and the AgentBackend contract.
 *
 * The relay and control plane speak ONLY these message types and know nothing about how any agent produces its output.
 * Swapping a local mock agent for a hosted Foundry agent means implementing AgentBackend; nothing in the relay or control plane changes.
 */

/** Web PubSub group naming. Groups must not contain '.' (keeps scoped roles simple). */
export const groupForAgent = (agentId: string) => `agent-${agentId}`;
export const groupForSession = (sessionId: string) => `session-${sessionId}`;

/** The subprotocol every WebSocket client (connector + browser) speaks. */
export const PUBSUB_SUBPROTOCOL = "json.webpubsub.azure.v1";

/** Control plane -> agent group: "do this unit of work for this session". */
export interface TaskMessage {
  type: "task";
  taskId: string;
  sessionId: string;
  text: string;
}

/** Agent -> session group: one streamed piece of the response. */
export interface ChunkMessage {
  type: "chunk";
  taskId: string;
  sessionId: string;
  seq: number;
  text: string;
}

/** Agent -> session group: the response is complete. */
export interface DoneMessage {
  type: "done";
  taskId: string;
  sessionId: string;
}

/** Agent -> session group: the task failed. */
export interface ErrorMessage {
  type: "error";
  taskId: string;
  sessionId: string;
  message: string;
}

export type RelayMessage = TaskMessage | ChunkMessage | DoneMessage | ErrorMessage;

/**
 * The single contract every agent backend implements.
 *
 * Given a task, yield the response as a stream of text chunks. That's it.
 * - MockBackend yields locally generated text (stands in for an unreachable/NAT'd agent).
 * - FoundryBackend delegates to a hosted Foundry agent and relays its streamed output.
 */
export interface AgentBackend {
  /** Stable id used as the agent's Web PubSub group + shown in the client UI. */
  readonly agentId: string;
  /** Human-friendly label shown in the client UI. */
  readonly displayName: string;
  /** Produce the response to a task as a stream of text chunks. */
  handleTask(task: TaskMessage): AsyncIterable<string>;
}
