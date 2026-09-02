# Changelog

## [1.0.0-beta.1] - Unreleased

### Added

- Add the `Microsoft.Azure.WebPubSub.Emulator` .NET tool scaffold.
- Add the service-compatible `HEAD /api/health` endpoint.
- Add raw WebSocket client endpoint support for text and binary group messages.
- Add access-key client authentication, connection-scoped token groups, and role-based raw group send.
- Add build, test, package, installation, and health-check validation in CI.
- Add endpoint-derived local connection strings with a configurable `WebPubSub:AccessKey`.
- Add opt-in unvalidated Entra token compatibility for trusted local server SDK testing.
- Add reliable JSON connections with scoped recovery tokens, sequence acknowledgements, and bounded message replay.