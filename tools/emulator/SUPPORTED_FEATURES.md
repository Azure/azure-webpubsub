# Supported Features and Gaps

The current implementation provides the executable foundation and raw WebSocket client endpoint
for local Azure Web PubSub development.

## Current support

| Area | Status | Notes |
| --- | --- | --- |
| .NET tool | Implemented | Builds and installs as `Microsoft.Azure.WebPubSub.Emulator`; runs as `awps-emulator`. |
| Local connection settings | Implemented | Derives the endpoint from the bound ASP.NET Core `Urls` address and supports a separate `WebPubSub:AccessKey` setting. |
| Service health | Implemented | `HEAD /api/health` returns `200 OK`. |
| Client token authentication | Implemented | Validates access-key JWTs supplied by query string or bearer header. |
| Raw WebSocket | Implemented | Receives group messages and publishes text or binary frames with raw `sendToGroup` mode. |
| Connection state | Implemented | Tracks active connections and removes their state when the WebSocket disconnects. |
| Groups and roles | Implemented | Supports connection-scoped token groups and authorized raw group send, including wildcard roles. |
| Outbound delivery | Implemented | Uses a bounded, single-writer queue for each WebSocket connection. |

## Not yet implemented

The following areas are planned for follow-up changes:

- REST APIs and server SDK compatibility
- HTTP upstream event handlers
- Event Hubs listeners
- JSON and reliable JSON subprotocols
- Client join, leave, acknowledgement, metadata, and message TTL
- Reliable reconnect and message replay
- Protobuf subprotocols
- Client message streaming
- Production Microsoft Entra ID validation

Raw `sendEvent` mode requires an upstream event handler and is not available in the current
implementation.