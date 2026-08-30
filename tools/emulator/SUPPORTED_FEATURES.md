# Supported Features and Gaps

The current implementation provides raw WebSocket and non-reliable JSON client endpoints for
local Azure Web PubSub development.

## Current support

| Area | Status | Notes |
| --- | --- | --- |
| .NET tool | Implemented | Builds and installs as `Microsoft.Azure.WebPubSub.Emulator`; runs as `awps-emulator`. |
| Local connection settings | Implemented | Derives the endpoint from the bound ASP.NET Core `Urls` address and supports a separate `WebPubSub:AccessKey` setting. |
| Service health | Implemented | `HEAD /api/health` returns `200 OK`. |
| Client token authentication | Implemented | Validates access-key JWTs supplied by query string or bearer header. |
| Raw WebSocket | Implemented | Receives group messages and publishes text or binary frames with raw `sendToGroup` mode. |
| JSON WebSocket | Implemented | Supports `json.webpubsub.azure.v1` negotiation, connection messages, group operations, acknowledgements, ping, metadata, and message TTL validation. |
| Connection state | Implemented | Tracks active connections and removes their state when the WebSocket disconnects. |
| Groups and roles | Implemented | Supports connection-scoped token groups and authorized join, leave, and group send, including wildcard roles. |
| Outbound delivery | Implemented | Uses a bounded, single-writer queue for each WebSocket connection. |

## Not yet implemented

The following areas are planned for follow-up changes:

- REST APIs and server SDK compatibility
- HTTP upstream event handlers
- Tunnel connections (`tunnel://` upstream URLs)
- Event Hubs listeners
- Reliable JSON subprotocol
- Reliable reconnect and message replay
- Protobuf subprotocols
- Client message streaming
- Production Microsoft Entra ID validation

Client events require an upstream event handler. Until upstream handlers are implemented, JSON
events with an `ackId` receive an `InternalServerError` acknowledgement; events without an
`ackId` are logged without closing the client connection. Raw `sendEvent` mode is not available.