# CodeAgentHub Cross-Agent Streaming Collaboration Design

## Summary

This document defines the cross-agent streaming collaboration design for CodeAgentHub.

The goal is not to make the portal relay large volumes of real-time messages. Instead, the architecture is split into two layers:

- the portal owns the control plane: ACL checks, delegation creation, room allocation, token issuance, cancellation, terminal summaries, and recovery coordination
- WPS Chat owns the data plane: high-frequency streaming messages produced by the target daemon are written directly into a dedicated relay room, and the source browser subscribes to and renders that stream directly

This design depends on two existing facts:

1. ACP does not provide native session-to-session messaging semantics.
2. WPS Chat room messages already provide storage and history retrieval, which can be used for disconnect recovery and portal restart recovery.

Because of that, cross-agent streaming collaboration must be implemented as orchestration at the CodeAgentHub layer, not as an ACP protocol extension, and not by turning the portal into a live message forwarder.

## Current Scope

The current deliverable is single-target session delegation with streaming results.

User experience goals:

1. The user chooses a target session from the source session.
2. After the prompt is submitted, the target daemon starts execution in the target session.
3. `assistant.message_delta`, `assistant.reasoning_delta`, tool progress, and the final result are streamed back to the source-side UI in real time.
4. The source session keeps a low-noise, auditable summary history.
5. The target session keeps the full local execution trace.

Out of scope for now, but the design must keep room for future expansion:

- multi-target fan-out
- source-agent orchestration

## Design Principles

### 1. The portal must stay out of the high-frequency data path

The portal can handle creation, confirmation, cancellation, and final summary persistence, but it should not forward high-frequency target daemon deltas.

### 2. WPS Chat is both the transport and the recovery substrate

Live relay-room messages and relay-room history are the same source of truth.

### 3. Source room and relay room must be separate

The source session room is for audit summaries.

The relay room is for high-frequency streaming.

Do not pour all deltas directly into the source session room.

### 4. Execution ownership always stays local to the target daemon

The portal must never own ACP session state directly.

The target daemon is the only component that can actually call ACP or issue a Copilot SDK prompt.

### 5. Every relay message must be deduplicable, orderable, and recoverable

We cannot depend on a weak assumption such as "WPS delivery is probably ordered enough".

The relay protocol must explicitly include `delegationId`, `seq`, and timestamps.

### 6. Relay message trust cannot rely on room membership alone

Current Chat room membership only answers "who can join the room". It does not safely express "who is allowed to produce valid relay events" as a reliable transport-layer guarantee.

Because of that, the relay path needs an additional producer-trust validation layer:

- the source UI only renders relay envelopes from the expected target daemon identity
- the portal only trusts relay and settle traffic from the expected producer when recovering state, backfilling summaries, or determining terminal state
- any message written to the relay room by an unexpected user must be treated as noise or malicious input and ignored

## Terminology

- `source session`: the current session where the user initiates a delegation
- `target session`: the session that actually executes the delegated prompt
- `source browser`: the browser instance currently viewing the source session
- `target daemon`: the daemon that owns the target session
- `delegationId`: the globally unique identifier for one delegation
- `relay room`: the WPS room that carries high-frequency streamed results
- `control room`: the WPS room that stores delegation lifecycle control events
- `summary event`: the low-frequency audit event written back into the source session room

## User Flows

### 1. Single-target streaming collaboration

This is the primary flow for the current implementation.

#### 1.1 Choose a target

1. The user types `@` in the source session composer.
2. The UI shows only target sessions where the user has `write` access.
3. The user chooses a workspace first, then a session.
4. After selection, the composer inserts a target chip.

The UI should make the following immediately visible:

- target session name
- target workspace
- target daemon
- whether the target is currently writable
- target recent activity time

#### 1.2 Submit a prompt

1. The user continues writing the prompt and sends it.
2. The source session timeline immediately shows a `delegation.prompt` event.
3. The UI then shows a delegation card whose state moves from `creating` to `dispatched`.

Recommended source-side visible states:

- `creating`
- `dispatched`
- `started`
- `streaming`
- `completed`
- `failed`
- `cancelled`
- `expired`

#### 1.3 Streaming return path

1. The target daemon accepts the request and starts writing messages to the relay room.
2. The source browser subscribes to the relay room directly and renders the stream in real time.
3. The source UI must show this streaming content inside the delegation card instead of pretending it was generated locally by the source agent.

Recommended source-side UI structure:

- a header such as `Delegating to @target`
- a live streaming content region
- a footer with target status, model, token usage, a cancel action, and an entry point to jump to the target session

#### 1.4 Completion and persistence

1. When the target daemon sends a terminal event, the delegation card moves into a terminal state.
2. The portal or daemon triggers a low-frequency summary write into the source session room.
3. The source room keeps a replayable summary event instead of the entire high-frequency delta stream.

Recommended source-room audit content:

- target identity
- original user prompt
- terminal state
- a summary of the final assistant content shown to the user
- a link to the target session
- usage and model summary if needed

### 2. Cancel flow

1. The user clicks Cancel in the source UI.
2. The source browser calls the portal cancel API.
3. The portal writes `control.delegation.cancel` into the target session room and `control.delegation.cancel_requested` into the control room.
4. After the target daemon stops execution, it sends `delegation.stream.terminal` with status `cancelled` to the relay room.
5. The source UI stops waiting and shows the cancellation result.

The cancel flow must satisfy:

- repeated cancel clicks are idempotent
- cancel must not move the state backwards if the target is already terminal
- after source browser reconnect, relay history still shows the cancelled terminal state

### 3. Reconnect and recovery flow

#### 3.1 Source browser disconnects

1. The source browser loses the live connection.
2. The target daemon keeps writing to the relay room.
3. After reconnect, the source browser queries relay-room history for `seq > lastSeenSeq`.
4. After catching up, it resumes live consumption.

#### 3.2 Portal restarts

1. After restart, the portal rebuilds the in-flight delegation index from control-room history.
2. If a terminal event already exists in relay history but the source summary was not written yet, the portal backfills the summary.
3. If no terminal event appears for too long, the portal marks the delegation as `expired` according to timeout policy.

#### 3.3 Target daemon restarts

1. The portal or source UI sees that the delegation is stuck in a non-terminal state by reading the control room or relay room.
2. If the target daemon can continue execution after restart, it continues writing to the same relay room using subsequent `seq` values.
3. If the target daemon cannot resume safely, it must emit `failed`, or the portal must eventually mark it as `expired`.

## Future User Flows

The following two flows are not in the current implementation scope, but the architecture must keep room for them.

### 1. Multi-target fan-out

The goal is to let one source prompt delegate to multiple target sessions at the same time.

User flow:

1. The user selects multiple target chips in the source composer.
2. The user sends a single prompt.
3. The UI generates a fan-out board where each target gets its own lane or card.
4. Each target streams independently.
5. The UI can show aggregate progress such as `2/5 completed`.
6. After all targets finish, the source UI shows a combined summary panel.

Operations the user must be able to perform:

- inspect the full stream for one target
- retry a single target
- cancel the entire fan-out
- keep only successful target results

To support this later, the current protocol should naturally support:

- one source prompt mapping to multiple `delegationId` values
- relay events carrying both `delegationId` and `laneId`
- the source UI rendering multiple relay streams on the same page

### 2. Source-agent orchestration

The goal is to let the source agent continue local reasoning after multiple delegation results return.

User flow:

1. The user submits a problem that needs multiple agents.
2. The source agent generates a plan and decides which subproblems to delegate.
3. Each target session streams back results.
4. The source agent reads those returned results locally.
5. The source agent continues reasoning and produces a synthesized conclusion.

This differs from current single-target streaming in a few key ways:

- the source session is not only displaying relay results
- the source agent must consume relay results as new input and continue working
- the system must clearly separate target results from the final synthesized source-agent conclusion

Capabilities the current protocol should preserve for the future:

- relay results can be referenced structurally
- the source agent can read a structured delegation artifact, not just a plain-text summary
- multiple target results can be aggregated in one place

## Architecture Overview

### Overall layering

```text
Source Browser
  -> portal control APIs
  -> subscribe relay room directly

Portal
  -> validates ACL
  -> creates delegation
  -> allocates rooms and memberships
  -> writes low-frequency control events
  -> writes final summary to source room

Target Daemon
  -> receives control request in target session room
  -> executes prompt in target session
  -> writes live stream to relay room
  -> writes terminal result

WPS Chat
  -> source session room: audit summary
  -> target session room: control + local audit
  -> relay room: high-frequency streaming data
  -> control room: durable lifecycle journal
```

### Room model

#### 1. Source session room

`roomId = sourceSessionId`

Purpose:

- user history
- source-local messages
- delegation summary events

It must not carry:

- high-frequency deltas
- full tool streams

#### 2. Target session room

`roomId = targetSessionId`

Purpose:

- target-local prompts
- target-local agent output
- `control.delegation.request`
- `control.delegation.cancel`
- target audit information

#### 3. Relay room

`roomId = delegation-relay-{delegationId}`

Purpose:

- the high-frequency real-time stream needed by the source browser
- reconnect-time history replay
- the source of truth for the live target daemon stream

Recommended members:

- source user: read-only by product semantics
- target daemon bot user: preferred single writer
- portal: admin or service identity for recovery and debugging only

#### 4. Control room

`roomId = delegation-control`

Purpose:

- delegation lifecycle journal
- portal restart recovery
- background expiry scanning and summary backfill

The control room stores low-frequency control events only, not live deltas.

## Core Data Flows

### 1. Create a delegation

```text
Source Browser
  -> POST /api/delegations
Portal
  -> validate source write + target write
  -> create delegationId
  -> create / ensure relay room
  -> grant relay-room memberships
  -> append control.delegation.created to control room
  -> append delegation.prompt to source room
  -> append control.delegation.request to target session room
  -> append delegation.dispatched to source room
  -> return delegation metadata + relay subscription info
```

Suggested response shape for the source browser:

```ts
type CreateDelegationResponse = {
  delegationId: string;
  relayRoomId: string;
  relayResumeFromSeq: number;
  target: {
    sessionId: string;
    daemonId: string;
    sessionLabel: string;
    workspaceLabel: string;
  };
};
```

### 2. Target daemon accepts the request

```text
Target Daemon
  -> consume control.delegation.request from target session room
  -> validate ownership / busy / depth / activity
  -> append control.delegation.started to control room
  -> append delegation.started to source room
  -> append delegation.stream.open to relay room
  -> start prompt execution
```

### 3. Real-time streaming return path

```text
Target Daemon
  -> assistant.message_delta
  -> assistant.reasoning_delta
  -> tool.start / tool.complete
  -> usage / session.state
  => wrap as relay event
  => send to relay room

Source Browser
  -> subscribe relay room
  -> apply seq in order
  -> render live delegation card
```

### 4. Persist terminal state

```text
Target Daemon
  -> append terminal event to relay room
  -> append terminal control event to control room
Portal
  -> observe control event or query relay history
  -> append summary event to source room
```

Important note:

- the terminal live event and the source-room summary are not the same thing
- the live event exists for real-time UI and reconnect recovery
- the summary event exists for long-term auditability and source-session replay

## Protocol Design

### Relay event

Use one wrapper envelope instead of inventing a separate room event type for every streamed message variant.

```ts
type DelegationRelayEnvelope = {
  type: 'delegation.stream.event';
  delegationId: string;
  relayRoomId: string;
  seq: number;
  sourceSessionId: string;
  targetSessionId: string;
  targetDaemonId: string;
  streamType:
    | 'stream.open'
    | 'assistant.message_delta'
    | 'assistant.message'
    | 'assistant.reasoning_delta'
    | 'assistant.reasoning'
    | 'tool.start'
    | 'tool.complete'
    | 'session.state'
    | 'usage.update'
    | 'terminal.completed'
    | 'terminal.failed'
    | 'terminal.cancelled';
  payload: Record<string, unknown>;
  sentAt: string;
};
```

Reasons:

- the frontend only needs one subscription path
- protocol extensions do not require adding more top-level event types repeatedly
- history replay by `seq` is the simplest recovery model

### Summary event

The summary written back to the source session room should be modeled separately:

```ts
type DelegationSummaryEnvelope = {
  type:
    | 'delegation.prompt'
    | 'delegation.dispatched'
    | 'delegation.started'
    | 'delegation.completed'
    | 'delegation.failed'
    | 'delegation.cancelled'
    | 'delegation.expired';
  delegationId: string;
  relayRoomId: string;
  sourceSessionId: string;
  targetSessionId: string;
  targetLabel: string;
  message?: string;
  summary?: {
    finalContent?: string;
    model?: string;
    usage?: { used?: number; size?: number };
  };
  createdAt: string;
};
```

`relayRoomId` must be included in the summary event. If the source browser refreshes and rebuilds active delegations from source-room history alone, it must be able to locate the correct relay room directly, without extra guesses.

### Control event

The control room should store:

```ts
type DelegationControlEnvelope = {
  type:
    | 'control.delegation.created'
    | 'control.delegation.dispatched'
    | 'control.delegation.started'
    | 'control.delegation.cancel_requested'
    | 'control.delegation.completed'
    | 'control.delegation.failed'
    | 'control.delegation.cancelled'
    | 'control.delegation.expired';
  delegationId: string;
  sourceSessionId: string;
  targetSessionId: string;
  relayRoomId: string;
  requesterUserId: string;
  targetDaemonId: string;
  createdAt: string;
  data?: Record<string, unknown>;
};
```

### Target-session control event

The executable control message delivered into the target session room should be modeled separately instead of reusing the control-room journal schema.

```ts
type DelegationTargetControlEnvelope = {
  type:
    | 'control.delegation.request'
    | 'control.delegation.cancel';
  delegationId: string;
  sourceSessionId: string;
  targetSessionId: string;
  relayRoomId: string;
  requesterUserId: string;
  targetDaemonId: string;
  createdAt: string;
  prompt?: string;
  displayText?: string;
  resumeFromSeq?: number;
};
```

These two control-event categories must stay clearly separated:

- target-session control events are executable commands delivered to the target daemon
- control-room events are lifecycle journal entries for portal recovery and audit

## Frontend Design

### Responsibilities

The source browser needs the following responsibilities:

1. Create a delegation.
2. Subscribe to the relay room.
3. Render relay events in `seq` order.
4. After disconnect, replay missing relay history.
5. Render delegation cards inside the source session UI instead of disguising relay results as local source-agent messages.
6. Allow cancel and jumping to the target session.
7. Promote the card into active streaming state only after relay-room membership, live subscription, and producer validation are in place.

### State

```ts
type ActiveDelegationView = {
  delegationId: string;
  relayRoomId: string;
  sourceSessionId: string;
  targetSessionId: string;
  targetLabel: string;
  status:
    | 'creating'
    | 'dispatched'
    | 'started'
    | 'streaming'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'expired';
  lastSeenSeq: number;
  messageBuffer: string;
  reasoningBuffer: string;
  renderedMessages: Array<Record<string, unknown>>;
  renderedReasoning: Array<Record<string, unknown>>;
  toolEvents: Array<Record<string, unknown>>;
  usage?: { used?: number; size?: number };
  model?: string;
  error?: string;
};
```

### Source UI rendering requirements

#### 1. Clearly distinguish relay content from local source-agent output

The delegation card must not look identical to a local source-agent message.

The user must be able to tell immediately:

- this stream came from the target
- it was not generated directly by the local agent in the current session

#### 2. Show target info while streaming

The delegation card needs:

- a target chip
- current status
- a cancel button
- a button or link to open the target session

#### 3. Support recoverable rendering

If the user refreshes the page:

- the frontend finds non-terminal delegation summaries in source-room history
- then fetches relay-room history to reconstruct the live stream
- then rebuilds the current delegation card

The source browser must not treat "I already have `relayRoomId`" as equivalent to "I am reliably subscribed to the live stream".

At minimum, the browser should verify:

- room membership is visible
- the WebSocket group join succeeded
- either live evidence was observed or one history replay completed before live takeover

## Portal Design

### Core responsibilities

Within this design, the portal is responsible for:

1. ACL validation
2. `delegationId` allocation
3. relay-room and control-room management
4. room membership and token-scope management
5. cancel control
6. writing the terminal summary back to the source room
7. recovering the active delegation index from control-room history

The portal is not responsible for:

- relaying live deltas
- owning the target prompt's local execution context

### Core APIs

#### 1. `GET /api/delegation-targets`

Returns the target sessions the current user is allowed to delegate to.

#### 2. `POST /api/delegations`

Creates a delegation.

Request:

```json
{
  "sourceSessionId": "sess-source",
  "targetSessionId": "sess-target",
  "prompt": "summarize the auth flow in your workspace",
  "displayText": "@demo / Backend Planner summarize the auth flow in your workspace"
}
```

When creating a delegation, the portal must:

- validate source write access
- validate target write access
- validate `source != target`
- validate that the target session is active
- validate that the target daemon is online
- create the relay room
- append a control event
- write the request into the target room
- return relay subscription info

#### 3. `POST /api/delegations/:delegationId/cancel`

The source user actively cancels a delegation.

Portal behavior:

- handle repeated cancel requests idempotently
- append `control.delegation.cancel_requested`
- write `control.delegation.cancel` into the target session room

#### 4. `POST /api/delegations/:delegationId/settle`

This is a low-frequency terminal callback, not part of the live data path.

It exists only to:

- tell the portal that the delegation reached a terminal state
- trigger summary persistence into the source room
- avoid forcing the portal to infer terminal state by polling relay history

The request should contain only a terminal summary, not the full live stream.

The portal must validate:

- the daemon bearer token is valid
- the caller daemon id matches `delegation.targetDaemonId`
- the delegation is not already in a conflicting terminal state
- repeated settle calls only confirm idempotently and do not write duplicate summaries

### Token and membership rules

The portal must ensure:

- the source browser consumes the relay room as a product-level relay stream, not as a general-purpose chat input room
- the target daemon is the expected relay producer by default
- the portal and daemon ignore relay-room messages from unexpected producers
- the source browser does not need to join the target session room

If Chat later offers finer-grained send/receive authorization, those semantics can be pushed down into the transport layer.

## Target Daemon Design

### Core responsibilities

The target daemon is responsible for:

1. listening for `control.delegation.request` inside the target session room
2. verifying that it really owns the target session
3. starting prompt execution
4. wrapping existing target-side events and writing them into the relay room
5. emitting a terminal event
6. calling the low-frequency settle callback

### Integration with existing event streams

The daemon already has access to:

- `assistant.message_delta`
- `assistant.message`
- `assistant.reasoning_delta`
- `assistant.reasoning`
- `tool.start`
- `tool.complete`
- `session.idle`

Streaming delegation should reuse those existing event types instead of inventing a second internal event model.

The only new path is the wrapper that writes them into the relay room.

### `seq` rules

Each `delegationId` is written by a single target daemon into one relay room.

That means `seq` can be a daemon-local monotonically increasing counter, but it must satisfy:

- it starts at `1`
- it is strictly increasing within that relay room
- the terminal event also has a `seq`
- retries must never reuse an old `seq` for different content

If the target daemon restarts before the delegation reaches terminal state and wants to keep writing to the same relay room, it cannot restart from local `1`.

The recovery rule must be:

- read the last valid `seq` from relay-room history
- use `lastSeq + 1` as the new next sequence
- if `lastSeq` cannot be determined reliably, stop the continuation and move to `failed` or `expired`

So "single daemon writes single delegation" only means there is no multi-writer race. It does not mean `seq` can be completely ephemeral.

Also, terminal event generation should be aligned with the real completion boundary of the current prompt turn.

- the Copilot SDK path can use the existing terminal callback or idle-completion logic
- the ACP path should use prompt return or stop reason as the terminal boundary
- `session.state` can help as an auxiliary signal, but it must not be the sole terminal-state detector

## Failures and Edge Cases

### 1. Creation-phase failures

#### 1.1 Target loses write access after the picker opens

The portal must validate ACL again during `POST /api/delegations`.

If validation fails, the source UI shows a synchronous error and no relay room should be created.

#### 1.2 Target daemon is already offline

The portal rejects delegation creation and the source UI shows `target offline`.

#### 1.3 Relay room was created, but writing the target request failed

The portal must:

- record the control event as `failed`
- clean up or mark the empty relay room
- avoid showing a fake `dispatched` state to the source UI

### 2. Execution-phase failures

#### 2.1 Target session is busy

The target daemon writes a terminal `failed` event to the relay room and uses the settle callback so the source room persists `delegation.failed`.

#### 2.2 Target daemon crashes during streaming

The portal watches timeouts by observing the control room and relay room.

After the timeout threshold:

- the source UI shows `expired` or `failed`
- the source room receives a terminal summary

#### 2.3 Target emitted partial deltas and then stalls

The source browser can continue showing the partial result it already received.

Terminal state is then decided by timeout policy.

### 3. Recovery-phase failures

#### 3.1 Relay-room history exceeded retention

If the source browser cannot retrieve full relay history on reconnect:

- the UI shows `partial recovery`
- the source room still preserves the terminal summary

#### 3.2 Control room and relay room disagree after portal restart

The portal should recover using this priority:

1. a terminal control event already exists in the control room
2. otherwise, a terminal relay event already exists in the relay room
3. otherwise, mark the delegation as `expired` by timeout policy

### 4. Concurrency and idempotency

#### 4.1 Repeated send clicks

The frontend should freeze the current delegation card immediately after creation so one UI action cannot generate multiple identical delegations.

#### 4.2 Repeated cancel

The cancel API must be idempotent.

#### 4.3 Repeated terminal callback

If a delegation is already terminal, the portal may only accept a repeated callback if it matches the existing terminal state, and it must not write the summary again.

#### 4.4 Unexpected producer messages appear in the relay room

Both the source UI and the portal must filter relay messages by producer identity.

If the producer is not the target daemon bot identity bound to the delegation, the message must:

- not advance `seq`
- not participate in terminal-state detection
- not be written into the source summary
- only generate a warning log for audit purposes

### 5. Large messages and chunking

The daemon already has a large-envelope chunking mechanism.

When reused by the relay path, the contract must be explicit:

- chunking happens at the transport layer
- `seq` applies to the logical relay event, not the individual chunks
- the frontend only advances `lastSeenSeq` after chunk reassembly succeeds

## Observability

### Source browser

- delegation created
- relay room subscribed
- relay gap detected
- relay history replay started / completed
- terminal state rendered

### Portal

- delegation created
- relay room provisioned
- target request appended
- cancel requested
- terminal summary appended
- expired due to timeout
- recovery replay finished

### Target daemon

- request accepted / rejected
- relay room open succeeded / failed
- seq emitted
- terminal event emitted
- settle callback succeeded / failed

Shared correlation keys:

- `delegationId`
- `sourceSessionId`
- `targetSessionId`
- `relayRoomId`

## Design Self-Check

At the document level, this design should satisfy the following robustness requirements:

1. The portal is not in the high-frequency data path.
2. WPS room history is explicitly used as recovery infrastructure.
3. The responsibilities of the source room and the relay room are separated.
4. Cancel, timeout, portal restart, target crash, and browser reconnect are all defined.
5. Multi-target fan-out and source-agent orchestration remain possible future extensions.

If any of the following later turns out to be false, the document must be revised:

- relay-room history cannot be queried reliably for recovery
- the source browser cannot subscribe to both the source room and the relay room under the current ChatClient model
- the daemon cannot safely write into a constrained relay room
- terminal summaries cannot be backfilled after portal restart

## Current Implementation Breakdown

### Step 1. Portal control plane

Files:

- `examples/code-agent-hub/web-portal/web-server.js`

Deliverables:

- `GET /api/delegation-targets`
- `POST /api/delegations`
- `POST /api/delegations/:id/cancel`
- `POST /api/delegations/:id/settle`
- relay-room and control-room management
- source-summary persistence

### Step 2. Target daemon relay path

Files:

- `examples/code-agent-hub/daemon/agent-daemon.js`
- shared protocol helpers: `examples/code-agent-hub/shared/session-delegation.js`

Deliverables:

- consume `control.delegation.request`
- wrap target-side live events into relay-room messages
- emit terminal events and call the settle callback

### Step 3. Frontend relay rendering

Files:

- `examples/code-agent-hub/web-portal/public/index.html`

Deliverables:

- delegation card UI
- relay-room subscription
- relay-history replay
- cancel action

### Step 4. Robustness validation

Deliverables:

- source browser refresh recovery
- timeout behavior when the target daemon crashes
- summary backfill after portal restart
- idempotency for duplicate cancel and duplicate settle