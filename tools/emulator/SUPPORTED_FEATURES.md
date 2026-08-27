# Supported Features and Gaps

The current implementation establishes the executable and packaging foundation for the Azure
Web PubSub Emulator. It does not yet emulate Azure Web PubSub service behavior.

## Current support

| Area | Status | Notes |
| --- | --- | --- |
| .NET tool | Implemented | Builds and installs as `Microsoft.Azure.WebPubSub.Emulator`; runs as `awps-emulator`. |
| Configurable host address | Implemented | Listens on `http://localhost:8080` by default and supports ASP.NET Core `Urls` configuration. |
| Process health | Implemented | `GET /health` returns `200 OK` with `{ "status": "Healthy" }`. |

## Not yet implemented

The current tool does not accept WebSocket clients or provide service APIs. The following areas
are planned for follow-up changes:

- Client endpoints and Web PubSub client protocols
- Client messaging, groups, roles, and metadata
- Reliable protocol reconnect and replay
- REST APIs and server SDK compatibility
- HTTP upstream event handlers
- Event Hubs listeners
- Authentication and authorization behavior

Until those capabilities are implemented, use the tool only to validate installation, process
startup, host configuration, and health checks.