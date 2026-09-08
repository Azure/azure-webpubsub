# Supported Features and Gaps

The current implementation provides raw WebSocket, JSON, and reliable JSON client endpoints for
local Azure Web PubSub development.

## Current support

| Area | Features | Support |
| --- | --- | --- |
| .NET tool | Builds and installs as `Microsoft.Azure.WebPubSub.Emulator`; runs as `awps-emulator`. | ✅ |
| Local connection settings | Derives the endpoint from the bound ASP.NET Core `Urls` address and supports a separate `WebPubSub:AccessKey` setting. | ✅ |
| Service health | `HEAD /api/health` returns `200 OK`. | ✅ |
| Client token authentication | Validates access-key JWTs supplied by query string or bearer header. | ✅ |
| Raw WebSocket | Receives group messages and publishes text or binary frames with raw `sendToGroup` mode. | ✅ |
| JSON WebSocket | Supports `json.webpubsub.azure.v1` negotiation, connection messages, group operations, acknowledgements, ping, metadata, and message TTL validation. | ✅ |
| Reliable JSON WebSocket | Supports `json.reliable.webpubsub.azure.v1`, scoped reconnection tokens, 30-second local recovery, ordered replay, and `sequenceAck`. | ✅ |
| Connection state | Tracks active connections and temporarily retains reliable logical connections after unexpected disconnects. | ✅ |
| Groups and roles | Supports connection-scoped token groups and authorized join, leave, and group send, including wildcard roles. | ✅ |
| Outbound delivery | Uses a bounded, single-writer queue for each WebSocket connection. | ✅ |
| HTTP upstream event handlers | Supports `connect`, `connected`, `disconnected`, JSON user events, and raw `message` events with CloudEvents headers, responses, connection state, metadata, and managed identity authentication. | ✅ |
| REST connection operations | Authenticated connection presence, direct text, JSON, and binary sends, close, and single-connection group membership changes for GA API versions from `2021-10-01` through `2024-12-01`. | ✅ |
| REST group operations | Authenticated group presence and text, JSON, or binary fan-out with excluded connection IDs and OData filters. | ✅ |
| REST broadcast | Authenticated text, JSON, or binary fan-out with excluded connection IDs and OData filters. | ✅ |
| REST user operations | Authenticated user presence, group membership changes, and text, JSON, or binary fan-out to all matching connections with OData filters. | ✅ |
| REST send TTL | Accepts valid `messageTtlSeconds` values; delivery is immediate and expiration is not modeled. | ⚠️ |
| Other REST APIs | Permission operations. | ❌ |

For the currently supported API versions (`2021-10-01` through `2024-12-01`) and versionless
requests, REST user operations preserve the legacy runtime route-binding behavior and pass the
ASP.NET Core route value through without another URL-decoding step. For example:

| Request path segment | User ID targeted by current API versions |
| --- | --- |
| `tenant%2Falice` | `tenant%2Falice` (not `tenant/alice`) |
| `tenant%252Falice` | `tenant%2Falice` |
| `alice%20smith` | `alice smith` |
| `alice+bob` | `alice+bob` (not `alice bob`) |

As in the runtime, access-key authentication compares a URL-decoded token audience with the
request path, allowing a token created from the original `tenant%252Falice` URL to authenticate
while preserving the legacy route value above.

Support for this behavior in a new API version is planned. The new version will adopt the
runtime's new contract and decode the original user ID path segment exactly once: for example,
`tenant%2Falice` targets `tenant/alice`, while `tenant%252Falice` targets `tenant%2Falice`.

## Not yet implemented

The following areas are planned for follow-up changes:

- Tunnel connections (`tunnel://` upstream URLs)
- Event Hubs listeners
- Protobuf subprotocols
- Client message streaming
- Production Microsoft Entra ID validation

Client events require a matching HTTP event handler. JSON events with an `ackId` receive an
`InternalServerError` acknowledgement when no configured handler matches. Raw
messages require a matching HTTP event handler unless raw `sendToGroup` mode is selected.