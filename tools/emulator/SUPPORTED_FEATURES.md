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
| 🟡 Partial | A useful subset is implemented, but one or more service modes are unavailable. |
| ❌ Not implemented | The feature is unavailable. Registered REST routes return `501 Not Implemented`. |

## REST API

The emulator registers all 25 operations from the Azure Web PubSub `2024-12-01` data-plane
API. Unsupported routes return a structured `501 Not Implemented` response.

| Method | Route | Operation | Status | Notes |
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
| `POST` | `/api/hubs/{hub}/:generateToken` | `WebPubSub_GenerateClientToken` | 🟡 Partial | Default Web PubSub client tokens are supported; MQTT client tokens are not. |
| `POST` | `/api/hubs/{hub}/:addToGroups` | `WebPubSub_AddConnectionsToGroups` | ❌ Not implemented | Needs request-body models and bulk connection/group mutation primitives. |
| `POST` | `/api/hubs/{hub}/:closeConnections` | `WebPubSub_CloseAllConnections` | ❌ Not implemented | Needs hub-wide selection, `excluded`, and bulk close behavior. |
| `POST` | `/api/hubs/{hub}/:removeFromGroups` | `WebPubSub_RemoveConnectionsFromGroups` | ❌ Not implemented | Needs request-body models and bulk connection/group mutation primitives. |
| `DELETE` | `/api/hubs/{hub}/connections/{connectionId}/groups` | `WebPubSub_RemoveConnectionFromAllGroups` | ❌ Not implemented | The connection tracks its groups, but the manager does not yet expose this mutation. |
| `POST` | `/api/hubs/{hub}/groups/{group}/:closeConnections` | `WebPubSub_CloseGroupConnections` | ❌ Not implemented | Needs group-wide selection, `excluded`, and bulk close behavior. |
| `GET` | `/api/hubs/{hub}/groups/{group}/connections` | `WebPubSub_ListConnectionsInGroup` | ❌ Not implemented | Needs stable ordering, page-size handling, response models, and continuation-token semantics. |
| `DELETE` | `/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}` | `WebPubSub_RevokePermission` | ❌ Not implemented | Needs mutable per-connection permission state and enforcement. |
| `HEAD` | `/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}` | `WebPubSub_CheckPermission` | ❌ Not implemented | Current permissions are derived only from token roles at connection time. |
| `PUT` | `/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}` | `WebPubSub_GrantPermission` | ❌ Not implemented | Needs mutable per-connection permission state, `targetName` handling, and enforcement. |
| `HEAD` | `/api/hubs/{hub}/users/{userId}` | `WebPubSub_UserExists` | ❌ Not implemented | Connections track `UserId`, but user-indexed manager operations are not implemented. |
| `POST` | `/api/hubs/{hub}/users/{userId}/:closeConnections` | `WebPubSub_CloseUserConnections` | ❌ Not implemented | Needs user fan-out selection, `excluded`, and bulk close behavior. |
| `POST` | `/api/hubs/{hub}/users/{userId}/:send` | `WebPubSub_SendToUser` | ❌ Not implemented | Needs user-indexed fan-out and reconnect-state tests. |
| `DELETE` | `/api/hubs/{hub}/users/{userId}/groups` | `WebPubSub_RemoveUserFromAllGroups` | ❌ Not implemented | Needs user-indexed bulk group mutation. |
| `DELETE` | `/api/hubs/{hub}/users/{userId}/groups/{group}` | `WebPubSub_RemoveUserFromGroup` | ❌ Not implemented | Needs user-indexed group mutation across all matching connections. |
| `PUT` | `/api/hubs/{hub}/users/{userId}/groups/{group}` | `WebPubSub_AddUserToGroup` | ❌ Not implemented | Needs user-indexed group mutation across all matching connections. |

### REST operations not yet implemented

The following 15 registered operations return `501 Not Implemented`:

| Area | Operations |
| --- | --- |
| Hub-wide operations | `WebPubSub_AddConnectionsToGroups`, `WebPubSub_RemoveConnectionsFromGroups`, `WebPubSub_CloseAllConnections` |
| Connection and group operations | `WebPubSub_RemoveConnectionFromAllGroups`, `WebPubSub_CloseGroupConnections`, `WebPubSub_ListConnectionsInGroup` |
| Dynamic permissions | `WebPubSub_GrantPermission`, `WebPubSub_RevokePermission`, `WebPubSub_CheckPermission` |
| User operations | `WebPubSub_UserExists`, `WebPubSub_SendToUser`, `WebPubSub_CloseUserConnections`, `WebPubSub_AddUserToGroup`, `WebPubSub_RemoveUserFromGroup`, `WebPubSub_RemoveUserFromAllGroups` |

Implemented REST routes still have these feature gaps:

- `WebPubSub_GenerateClientToken` does not generate MQTT client tokens.
- `messageTtlSeconds` is validated as an integer from 0 through 300, but offline retention and
  delayed delivery are not modeled.
- `X-WebPubSub-Metadata-*` headers are not forwarded as client message metadata.

## Clients and protocols

| Capability | Status | Notes |
| --- | --- | --- |
| Raw WebSocket | ✅ Implemented | Sends and receives text and binary frames. Client frames can be forwarded to configured event handlers and listeners. |
| Client `sendToGroup` | ✅ Implemented | Supports `noEcho` and role-based authorization. |
| Group roles | ✅ Implemented | Supports roles that apply to every group, one named group, or groups matched by a wildcard pattern. |
| Ack ID idempotency | ✅ Implemented | Reusing an `ackId` on the same logical connection returns `Duplicate` without executing the operation again. |
| `json.webpubsub.azure.v1` | 🟡 Partial | Supports connection messages, user events, group join/leave, send-to-group, acknowledgements, and ping/pong. |
| `json.reliable.webpubsub.azure.v1` | 🟡 Partial | Adds local reconnect, sequence acknowledgement, and replay to the supported JSON features. |
| MQTT | ❌ Not implemented | MQTT client tokens, connections, publish/subscribe, and MQTT session behavior are unavailable. |
| Protobuf | ❌ Not implemented | `protobuf.webpubsub.azure.v1` and `protobuf.reliable.webpubsub.azure.v1` are unavailable. |
| Custom WebSocket subprotocols | ❌ Not implemented | Raw WebSocket works without a subprotocol; arbitrary application subprotocol negotiation is rejected. |
| Invocation | ❌ Not implemented | `invoke`, `invokeResponse`, and `cancelInvocation` messages are unavailable. |
| Streaming | ❌ Not implemented | Stream start, `streamData`, `streamEnd`, stream acknowledgements, stream closure, and downstream stream metadata are unavailable. |
| Message metadata | ❌ Not implemented | Client metadata on `sendToGroup` and `event`, upstream metadata mapping, and downstream metadata are unavailable. |
| Group state | ❌ Not implemented | `setGroupState`, `subscribeGroupState`, `unsubscribeGroupState`, snapshots, updates, and group-state roles are unavailable. |
| Client message TTL | ❌ Not implemented | `ttlSeconds` on client `sendToGroup` messages is not parsed or applied. |
| Disconnected system message | ❌ Not implemented | Connection shutdown uses a WebSocket close frame without a JSON `system/disconnected` message. |

Wildcard group roles use the same role names and matching behavior as Azure Web PubSub. Use
`webpubsub.sendToGroups.{pattern}` or `webpubsub.joinLeaveGroups.{pattern}` for patterns. `*`
matches within one dot-separated segment, `**` can cross segments, and `?` matches one
non-dot character. Matching is case-sensitive.

## Event integrations

| Capability | Status | Notes |
| --- | --- | --- |
| HTTP event handlers | ✅ Implemented | Handles `connect`, `connected`, `disconnected`, user events, and raw WebSocket messages. Connect handlers can assign a user ID, roles, groups, and subprotocol. |
| Event handler responses | ✅ Implemented | Text, JSON, and binary responses to user events are returned to the client. |
| Managed identity for handlers | ✅ Implemented | Uses the configured local or managed Azure identity. |
| Event Hubs listeners | ✅ Implemented | Sends user events and `connected`/`disconnected` lifecycle events using the configured Azure identity. |
| Group lifecycle events | ❌ Not implemented | `joined` and `left` events are not emitted. |

The `connect` event is delivered only to an HTTP event handler because its response determines
whether and how the client connects.

## Authentication

| Method | Status | Notes |
| --- | --- | --- |
| Access key | ✅ Implemented | Client and REST tokens are validated against the configured emulator access key. |
| Server SDK `TokenCredential` | 🟡 Partial | Intended only for local SDK compatibility. The emulator does not validate token signatures, tenants, identities, or Azure role assignments. |
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
