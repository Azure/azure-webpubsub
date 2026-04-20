# CodeAgentHub Logging Improvement Plan

## Scope

This document covers the current logging problems and the proposed rollout plan for:

- `daemon/agent-daemon.js`
- `web-portal/web-server.js`

Browser-side logging in `web-portal/public/*` is out of scope here except where it affects server-side correlation.

## Executive Summary

The current daemon and portal logging is functional for local debugging, but it is not operationally reliable yet.

The main issues are:

- logging is implemented as scattered `console.log`, `console.warn`, and `console.error` calls instead of a shared logging layer
- there is no consistent log schema, correlation model, or request/session/delegation context propagation
- sensitive or high-volume data is logged directly in hot paths
- there is no way to reliably turn verbose diagnostics on or off by level or namespace
- the web server has no request access logging, so API activity is hard to reconstruct from logs alone

The short version: we have debug prints, not an observability design.

## Current Problems

### 1. No shared logging abstraction

Both runtime entrypoints write directly to `console.*`.

Examples:

- `daemon/agent-daemon.js` logs lifecycle, prompt handling, ACP updates, tool activity, file system operations, and terminal commands directly.
- `web-portal/web-server.js` logs startup, OAuth, daemon registration, delegation failures, and background admin-chat failures directly.

This causes three problems immediately:

- formatting is inconsistent
- adding context is repetitive and error-prone
- there is no central place for redaction, level filtering, or output formatting

### 2. Log levels are effectively hard-coded

The code currently mixes user-facing operational logs and deep debugging logs at the same level.

Examples in the daemon:

- ACP tool update dumps are always emitted
- file reads and writes are always emitted
- terminal create and exit operations are always emitted
- prompts and commands are always emitted

That means production logs will either be too noisy, or people will stop trusting them and ignore them.

### 3. No structured context

Most entries are plain strings with ad hoc prefixes such as `[Daemon]`, `[Daemon:tool]`, `[Web]`, and `[Auth]`.

Important identifiers are not attached consistently:

- `sessionId`
- `daemonId`
- `delegationId`
- `roomId`
- `requestId`
- authenticated user identity
- route and response status
- elapsed time

Without stable fields, log search becomes substring matching instead of reliable filtering.

### 4. No request-level logging in the portal

`web-portal/web-server.js` defines many HTTP routes, but there is no middleware that logs:

- request start
- request end
- status code
- latency
- request id
- authenticated user or daemon identity

That makes it hard to answer basic questions such as:

- Which user created this delegation?
- Which request returned `403`?
- Was a timeout caused by the portal route or by downstream admin chat work?

### 5. Sensitive content is logged too freely

Several daemon logs currently include raw user or workstation data.

Examples:

- user prompt content is logged with a text preview
- user command content is logged directly
- file system paths are logged directly for reads and writes
- terminal command lines are logged directly
- ACP tool update diagnostics include `rawOutput` and metadata previews

These logs are useful while building the feature, but they are too permissive for a shared or long-lived environment.

Default policy should assume the following are sensitive unless explicitly whitelisted:

- prompt text
- reasoning text
- tool input and output
- file contents
- full absolute paths
- access tokens, cookies, connection strings, JWTs, and OAuth payloads

### 6. Inconsistent error logging

Current error logging mixes several styles:

- `err.message`
- full `err`
- truncated string slices
- warnings that swallow stack traces

This produces logs that are noisy when they should be concise, and incomplete when they should preserve full failure detail.

We should log errors through one serializer with stable fields such as:

- `error.name`
- `error.message`
- `error.code`
- `error.stack`
- `cause`

### 7. High-frequency paths are not separated from operational logs

The daemon currently logs hot-path events such as ACP tool updates, file operations, terminal lifecycle, and some streaming internals inline with normal lifecycle logs.

Operationally, these are different classes of events:

- `info`: startup, registration, session created, delegation started, delegation settled
- `warn`: retries, degraded behavior, ignored unauthorized input, recoverable failures
- `error`: failed startup, failed registration, failed settle, uncaught exceptions
- `debug`: per-update ACP diagnostics, file operation traces, terminal traces, chunking diagnostics

Right now those boundaries are blurred.

### 8. No correlation between portal and daemon logs

The system already has natural correlation keys, but logging does not use them consistently:

- `daemonId`
- `sessionId`
- `delegationId`
- `relayRoomId`
- `requestId`

This is especially painful for cross-agent workflows because the portal and the daemon both participate in the same delegation lifecycle, but their logs cannot be joined reliably.

### 9. No logging contract or tests

There is currently no safeguard for:

- redaction behavior
- JSON log shape
- level filtering
- request-id propagation
- child logger context inheritance

Without tests, logging quality will drift again as soon as the next feature adds a few emergency `console.log` calls.

## Target State

We should aim for a small shared logging layer with these properties:

- structured logs by default
- pretty human-readable logs in local development
- level-based filtering
- redaction by default
- child loggers for per-request, per-session, and per-delegation context
- one error serializer
- one request-id propagation mechanism in the portal
- one session/delegation context pattern in the daemon

### Recommended Minimum Schema

Every server-side log entry should be able to carry the following fields when relevant:

```json
{
  "ts": "2026-04-17T12:34:56.789Z",
  "level": "info",
  "component": "daemon",
  "area": "delegation",
  "event": "delegation.settled",
  "message": "Delegation settled successfully",
  "requestId": "req_123",
  "sessionId": "sess_123",
  "daemonId": "my-daemon",
  "delegationId": "deleg_123",
  "roomId": "room_123",
  "userId": "alice",
  "status": "completed",
  "durationMs": 182,
  "error": null
}
```

Not every field is required on every log line, but the field names must be stable.

## Proposed Architecture

### Shared logging module

Selected library:

- `pino` for all server-side structured logging
- `pino-pretty` only for local pretty-print output when `CODEAGENTHUB_LOG_FORMAT=pretty`

Why `pino` instead of `winston` in this repo:

- the immediate problem is inconsistent structured logging and missing context propagation, not multi-transport log routing
- both runtime entrypoints are single Node processes, so stdout-first structured logging is the right default
- daemon hot paths can emit high-frequency debug events, and `pino` has lower overhead in that shape of workload
- child loggers map directly to the context model this repo already has: request, session, daemon, delegation, ACP session
- redaction and stable field schemas are easier to enforce when logging is object-first

We are explicitly not optimizing for in-process transport fan-out right now. If the system later needs multiple destination-specific transports inside the app process, that decision can be revisited, but it should not drive the first refactor.

Add a small shared helper, for example:

- `shared/logging.js`

Suggested surface:

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type Logger = {
  debug(event: string, fields?: Record<string, unknown>, message?: string): void;
  info(event: string, fields?: Record<string, unknown>, message?: string): void;
  warn(event: string, fields?: Record<string, unknown>, message?: string): void;
  error(event: string, fields?: Record<string, unknown>, message?: string): void;
  child(fields: Record<string, unknown>): Logger;
};
```

This module should own:

- level filtering
- JSON vs pretty formatting
- redaction
- error serialization
- clock/timestamp formatting

Implementation note:

- the shared logger should wrap `pino` instead of exposing raw `pino` usage everywhere
- `pino-pretty` should stay a local-developer presentation layer, not a production dependency in the logging contract

### Portal request context

For `web-portal/web-server.js`, add AsyncLocalStorage-based request context so every route and background helper can attach:

- `requestId`
- `route`
- `method`
- `userId` or `daemonId`

This should be installed as early middleware, before the route handlers.

### Daemon child loggers

For `daemon/agent-daemon.js`, create loggers by scope:

- process logger: startup, registration, reconnect, shutdown
- session logger: `sessionId`, `agentName`, `workingDirectoryHash`
- delegation logger: `delegationId`, `sourceSessionId`, `targetSessionId`, `relayRoomId`
- ACP logger: `agentName`, `sessionId`, `acpSessionId`

The daemon already has the identifiers. The missing piece is attaching them systematically.

## Redaction Rules

### Always redact

- connection strings
- JWTs and bearer tokens
- cookies and session secrets
- OAuth access tokens
- full prompt text
- reasoning text
- tool raw output
- file contents

### Log metadata instead of content

Instead of logging raw values, prefer:

- `promptLength`
- `commandName`
- `pathBasename` or normalized relative path
- `outputLength`
- `toolName`
- `model`
- `status`

### Optional explicit content preview flag

If we still need content previews during local debugging, gate them behind an explicit opt-in flag such as:

- `CODEAGENTHUB_LOG_CONTENT_PREVIEW=true`

Even then, keep previews short and never emit secrets or full reasoning/tool payloads.

## Environment Variables

Recommended logging controls:

- `CODEAGENTHUB_LOG_LEVEL=info|debug|warn|error`
- `CODEAGENTHUB_LOG_FORMAT=pretty|json`
- `CODEAGENTHUB_LOG_CONTENT_PREVIEW=false|true`
- `CODEAGENTHUB_LOG_INCLUDE_STACKS=false|true`

Optional later additions:

- `CODEAGENTHUB_LOG_FILE=...`
- `CODEAGENTHUB_LOG_SAMPLING=...`

## Rollout Plan

### Phase 1: Foundation

Goal: stop adding more scattered `console.*` calls.

Tasks:

- install `pino` and `pino-pretty`
- add `shared/logging.js`
- define level enum and output format
- define redaction and error serialization helpers
- define event naming conventions
- add basic unit tests for log formatting and redaction

Exit criteria:

- both runtime entrypoints can import the shared logger
- local dev can switch between `pretty` and `json`

### Phase 2: Portal server migration

Goal: make portal logs request-oriented and API-debuggable.

Tasks:

- add request-id middleware in `web-portal/web-server.js`
- log request start/end with method, path, status, duration, authenticated identity
- migrate daemon registration, heartbeat, delegation, and session-management routes first
- migrate admin-chat reconnect and background sync warnings to structured logs

Priority migration areas:

- daemon bootstrap/register/heartbeat/offline routes
- delegation create/cancel/settle routes
- session create/delete/join-approval routes
- admin chat startup and reconnect flow

Exit criteria:

- every mutating route has start/end/error logs with `requestId`
- background admin chat failures include operation name and daemon/session context where applicable

### Phase 3: Daemon migration

Goal: make daemon logs usable in a long-running workstation or VM process.

Tasks:

- replace direct lifecycle `console.*` calls with the shared logger
- create child loggers for session and delegation scopes
- move ACP per-update diagnostics to `debug`
- move file system and terminal traces to `debug`
- stop logging raw prompt text, raw command text, and raw tool output by default

Priority migration areas:

- startup, registration, reconnect, heartbeat
- control message handling
- session create/resume/delete/cancel
- delegation request/settle/cancel flows
- ACP streaming and tool event handling

Exit criteria:

- normal `info` logs show lifecycle only
- `debug` enables deep ACP and local-tool traces
- redaction rules are enforced everywhere by default

### Phase 4: Correlation and hardening

Goal: make portal and daemon logs useful together.

Tasks:

- standardize shared correlation keys across portal and daemon
- ensure delegation logs always include `delegationId`
- ensure session logs always include `sessionId`
- add regression tests for request-id propagation and child context inheritance
- document example queries for common incidents

Incident examples to support:

- why did a delegation fail?
- who created this managed session?
- why did daemon registration flap?
- why did a request return `403` or `504`?

Exit criteria:

- one delegation can be traced across portal and daemon logs using shared identifiers
- one request can be traced end-to-end in portal logs using `requestId`

## Suggested Event Names

Suggested event names should stay boring and stable.

Examples:

- `server.started`
- `server.request.completed`
- `auth.oauth.completed`
- `daemon.registered`
- `daemon.heartbeat.failed`
- `session.created`
- `session.deleted`
- `delegation.created`
- `delegation.dispatched`
- `delegation.cancel.requested`
- `delegation.settled`
- `acp.session.initialized`
- `acp.tool.update`
- `terminal.created`
- `terminal.exited`

## Implementation Order

If we only do the first 20 percent of the work, it should be this:

1. Add the shared logger and level control.
2. Add portal request logging with request ids.
3. Demote daemon ACP/tool/file/terminal traces to `debug`.
4. Remove raw prompt, raw command, and raw tool output from default logs.

That sequence gives the largest operational improvement with the least invasive code movement.

## Acceptance Checklist

- No new direct `console.*` calls are added in daemon or portal server code.
- Portal API mutations emit structured request completion logs.
- Daemon lifecycle events emit structured process/session/delegation logs.
- Default logging no longer includes raw prompt content or tool output.
- Deep ACP/tool/file/terminal traces are only visible at `debug` level.
- Error logs always include serialized error metadata.
- Logging helpers have basic regression tests.

## Non-Goals

This plan does not require, for the first rollout:

- shipping logs to an external vendor
- adding metrics or distributed tracing infrastructure
- changing browser-side logging behavior
- redesigning existing business logic

The goal is to first make local, VM, container, and App Service logs reliable and predictable.