# Supported Features and Gaps

The Azure Web PubSub Emulator supports the most common local development workflows. This page
summarizes what you can use and the important differences from Azure Web PubSub.

## At a glance

| Area | Support |
| --- | --- |
| Client connections | Raw WebSocket, JSON Web PubSub, and reliable JSON Web PubSub |
| Messaging | Text, binary, and JSON messages between clients, groups, REST callers, and event handlers |
| Groups | Join, leave, send, `noEcho`, and role-based authorization |
| Server operations | Generate client tokens, send messages, inspect connections and groups, and manage connection group membership |
| Integrations | HTTP event handlers and Azure Event Hubs listeners |
| Local reliability | Reliable reconnect and message replay while the emulator remains running |

## Status definitions

| Status | Meaning |
| --- | --- |
| ✅ Implemented | The feature has real emulator behavior and is covered by tests. |
| ⚠️ Emulator semantics | The feature works with an explicitly documented local-only semantic difference. |
| ❌ Not implemented | The feature is unavailable. Registered REST routes return `501 Not Implemented`. |

## REST API

The emulator registers all 25 operations from the Azure Web PubSub `2024-12-01` data-plane
API. Unsupported routes return a structured `501 Not Implemented` response. Distinct modes of
the same operation are listed separately when their support status differs.

| Method | Route | Operation or mode | Status | Notes |
| --- | --- | --- | --- | --- |
| `HEAD` | `/api/health` | `HealthApi_GetServiceStatus` | ✅ Implemented | Returns `200 OK`. |
| `DELETE` | `/api/hubs/{hub}/connections/{connectionId}` | `WebPubSub_CloseConnection` | ✅ Implemented | Supports the `reason` query parameter. |
| `HEAD` | `/api/hubs/{hub}/connections/{connectionId}` | `WebPubSub_ConnectionExists` | ✅ Implemented | Returns `200` or `404`. |
| `HEAD` | `/api/hubs/{hub}/groups/{group}` | `WebPubSub_GroupExists` | ✅ Implemented | Returns `200` or `404`. |
| `DELETE` | `/api/hubs/{hub}/groups/{group}/connections/{connectionId}` | `WebPubSub_RemoveConnectionFromGroup` | ✅ Implemented | Mutates in-memory group membership. |
| `PUT` | `/api/hubs/{hub}/groups/{group}/connections/{connectionId}` | `WebPubSub_AddConnectionToGroup` | ✅ Implemented | Mutates in-memory group membership. |
| `POST` | `/api/hubs/{hub}/:send` | `WebPubSub_SendToAll` | ⚠️ Emulator semantics | Supports `excluded` and OData `filter`; validates `messageTtlSeconds` from 0 through 300, but delivery is immediate and TTL retention is not modeled. |
| `POST` | `/api/hubs/{hub}/connections/{connectionId}/:send` | `WebPubSub_SendToConnection` | ⚠️ Emulator semantics | Validates `messageTtlSeconds` from 0 through 300, but delivery is immediate and TTL retention is not modeled. |
| `POST` | `/api/hubs/{hub}/groups/{group}/:send` | `WebPubSub_SendToGroup` | ⚠️ Emulator semantics | Supports `excluded` and OData `filter`; validates `messageTtlSeconds` from 0 through 300, but delivery is immediate and TTL retention is not modeled. |
| `POST` | `/api/hubs/{hub}/:generateToken` | `WebPubSub_GenerateClientToken` (default) | ✅ Implemented | Generates access-key client tokens with user ID, roles, and groups. |
| `POST` | `/api/hubs/{hub}/:generateToken` | `WebPubSub_GenerateClientToken` (`clientProtocol=mqtt`) | ❌ Not implemented | MQTT client-token generation is unavailable. |
| `POST` | `/api/hubs/{hub}/:addToGroups` | `WebPubSub_AddConnectionsToGroups` | ✅ Implemented | Adds connections selected by the request-body OData `filter` to every requested group. |
| `POST` | `/api/hubs/{hub}/:closeConnections` | `WebPubSub_CloseAllConnections` | ✅ Implemented | Supports repeated `excluded` values and the `reason` query parameter. |
| `POST` | `/api/hubs/{hub}/:removeFromGroups` | `WebPubSub_RemoveConnectionsFromGroups` | ✅ Implemented | Removes connections selected by the request-body OData `filter` from every requested group. |
| `DELETE` | `/api/hubs/{hub}/connections/{connectionId}/groups` | `WebPubSub_RemoveConnectionFromAllGroups` | ✅ Implemented | Removes all current group memberships and succeeds when the connection does not exist. |
| `POST` | `/api/hubs/{hub}/groups/{group}/:closeConnections` | `WebPubSub_CloseGroupConnections` | ✅ Implemented | Supports repeated `excluded` values and the `reason` query parameter. |
| `GET` | `/api/hubs/{hub}/groups/{group}/connections` | `WebPubSub_ListConnectionsInGroup` | ✅ Implemented | Supports stable continuation-token paging, `maxpagesize`, and `top`. |
| `DELETE` | `/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}` | `WebPubSub_RevokePermission` | ❌ Not implemented | Needs mutable per-connection permission state and enforcement. |
| `HEAD` | `/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}` | `WebPubSub_CheckPermission` | ❌ Not implemented | Current permissions are derived only from token roles at connection time. |
| `PUT` | `/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}` | `WebPubSub_GrantPermission` | ❌ Not implemented | Needs mutable per-connection permission state, `targetName` handling, and enforcement. |
| `HEAD` | `/api/hubs/{hub}/users/{userId}` | `WebPubSub_UserExists` | ✅ Implemented | Returns `200` when the user has at least one logical connection, otherwise `404`. |
| `POST` | `/api/hubs/{hub}/users/{userId}/:closeConnections` | `WebPubSub_CloseUserConnections` | ✅ Implemented | Supports `excluded` and `reason` across all matching logical connections. |
| `POST` | `/api/hubs/{hub}/users/{userId}/:send` | `WebPubSub_SendToUser` | ⚠️ Emulator semantics | Supports OData `filter`; validates `messageTtlSeconds` from 0 through 300, but delivery is immediate and TTL retention is not modeled. |
| `DELETE` | `/api/hubs/{hub}/users/{userId}/groups` | `WebPubSub_RemoveUserFromAllGroups` | ✅ Implemented | Removes every current logical connection for the user from all groups. |
| `DELETE` | `/api/hubs/{hub}/users/{userId}/groups/{group}` | `WebPubSub_RemoveUserFromGroup` | ✅ Implemented | Removes every current logical connection for the user from the group. |
| `PUT` | `/api/hubs/{hub}/users/{userId}/groups/{group}` | `WebPubSub_AddUserToGroup` | ✅ Implemented | Adds every current logical connection for the user to the group; returns `404` when the user has no connections. |

### REST operations not yet implemented

The following 3 registered operations return `501 Not Implemented`:

| Area | Operations |
| --- | --- |
| Dynamic permissions | `WebPubSub_GrantPermission`, `WebPubSub_RevokePermission`, `WebPubSub_CheckPermission` |

Additional REST behavior notes:

- `WebPubSub_GenerateClientToken` does not generate MQTT client tokens.
- `messageTtlSeconds` is validated as an integer from 0 through 300, but offline retention and
  delayed delivery are not modeled.
- `X-WebPubSub-Metadata-*` headers are forwarded to JSON clients as message metadata.

## Clients and protocols

| Capability | Status | Notes |
| --- | --- | --- |
| Raw WebSocket | ✅ Implemented | Sends and receives text and binary frames. Client frames are dispatched as `message` events to configured event handlers and listeners; a frame that reaches neither closes the client. |
| Client `sendToGroup` | ✅ Implemented | Supports `noEcho` and role-based authorization. |
| Group roles | ✅ Implemented | Supports roles that apply to every group, one named group, or groups matched by a wildcard pattern. |
| Ack ID idempotency | ✅ Implemented | Reusing an `ackId` on the same logical connection returns `Duplicate` without executing the operation again. |
| `json.webpubsub.azure.v1` | ✅ Implemented | Supports connection messages, user events, group join/leave, send-to-group, metadata, acknowledgements, and ping/pong. Unsupported message families are listed separately below. |
| `json.reliable.webpubsub.azure.v1` | ⚠️ Emulator semantics | Adds reconnect, sequence acknowledgement, and replay while the emulator process remains running. A connection is closed when its unacknowledged replay buffer reaches 1,000 messages or 16 MiB. |
| MQTT | ❌ Not implemented | MQTT client tokens, connections, publish/subscribe, and MQTT session behavior are unavailable. |
| Protobuf | ❌ Not implemented | `protobuf.webpubsub.azure.v1` and `protobuf.reliable.webpubsub.azure.v1` are unavailable. |
| Custom WebSocket subprotocols | ❌ Not implemented | Raw WebSocket works without a subprotocol; arbitrary application subprotocol negotiation is rejected. |
| Invocation | ❌ Not implemented | `invoke`, `invokeResponse`, and `cancelInvocation` messages are unavailable. |
| Streaming | ❌ Not implemented | Stream start, `streamData`, `streamEnd`, stream acknowledgements, stream closure, and downstream stream metadata are unavailable. |
| Message metadata | ✅ Implemented | Supports metadata on client `sendToGroup` and `event` messages, REST metadata headers, HTTP event-handler request and response metadata, downstream messages, and reliable replay. |
| Group state | ❌ Not implemented | `setGroupState`, subscriptions, snapshots, and updates are unavailable. |
| Client message TTL | ⚠️ Emulator semantics | Parses and validates `ttlSeconds` from 0 through 300 on client `sendToGroup` messages. Delivery is immediate and TTL retention is not modeled. |
| Disconnected system message | ✅ Implemented | Active non-raw clients receive a JSON `system/disconnected` message before service-initiated WebSocket closure. |

Wildcard group roles use the same role names and matching behavior as Azure Web PubSub. Use
`webpubsub.sendToGroups.{pattern}` or `webpubsub.joinLeaveGroups.{pattern}` for patterns. `*`
matches within one dot-separated segment, `**` can cross segments, and `?` matches one
non-dot character. Matching is case-sensitive.

## Event integrations

| Capability | Status | Notes |
| --- | --- | --- |
| HTTP event handlers | ✅ Implemented | Handles `connect`, `connected`, `disconnected`, user events, and raw WebSocket messages. Requests include an access-key `ce-signature`; `connect` blocks until the handler responds, `connected` and `disconnected` are nonblocking and are dropped when nothing subscribes, and a user event that reaches no handler or listener fails and closes its client. Connect handlers can assign a user ID, roles, groups, and subprotocol. |
| Event handler responses | ✅ Implemented | Text, JSON, and binary responses to user events are returned to the client. |
| Managed identity for handlers | ✅ Implemented | Uses the configured local or managed Azure identity. |
| Event Hubs listeners | ✅ Implemented | Sends user events and `connected`/`disconnected` lifecycle events using the configured Azure identity and runtime-compatible connection-scoped event IDs. |
| Group lifecycle events | ❌ Not implemented | `joined` and `left` events are not emitted. |

The `connect` event is delivered only to an HTTP event handler because its response determines
whether and how the client connects.

## Authentication

| Method | Status | Notes |
| --- | --- | --- |
| Access key | ✅ Implemented | Client and REST tokens are validated against the configured emulator access key. |
| Server SDK `TokenCredential` compatibility mode | ⚠️ Emulator semantics | Accepts bearer tokens when `WebPubSub:AllowUnvalidatedEntraTokens` is enabled for trusted local development. |
| Production Microsoft Entra token and role validation | ❌ Not implemented | Token signatures, tenants, identities, and Azure role assignments are not validated. |
| Anonymous client connections | ❌ Not implemented | Clients must provide a signed access token. |

## Unsupported features summary

In addition to the REST and client protocol gaps listed above, the emulator does not currently
support:

- `joined` and `left` HTTP event handler events.
- WebSocket keepalive configuration.
- Persistent or cross-instance connections, group membership, replay buffers, or routing.
- Offline message retention, distributed availability, service quotas, or production
  throttling behavior.
- Azure resource features such as replicas, private endpoints, network ACLs, TLS policy, and
  diagnostics configuration.
- Production Microsoft Entra identity validation and Azure role enforcement.
- API-version-specific behavior.
