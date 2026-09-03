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
| REST connection operations | Authenticated connection presence, direct text, JSON, and binary sends, close, and single-connection group membership changes for GA API versions from `2021-10-01` through `2024-12-01`. | ✅ |
| REST direct-send TTL | Accepts valid `messageTtlSeconds` values; delivery is immediate and expiration is not modeled. | ⚠️ |
| Other REST APIs | Group fan-out, user, permission, and broadcast operations. | ❌ |

## Not yet implemented

The following areas are planned for follow-up changes:

- HTTP upstream event handlers
- Tunnel connections (`tunnel://` upstream URLs)
- Event Hubs listeners
- Protobuf subprotocols
- Client message streaming
- Production Microsoft Entra ID validation

Client events require an upstream event handler. Until upstream handlers are implemented, JSON
events with an `ackId` receive an `InternalServerError` acknowledgement; events without an
`ackId` are logged without closing the client connection. Raw `sendEvent` mode is not available.