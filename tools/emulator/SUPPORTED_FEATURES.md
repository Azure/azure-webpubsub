# Supported features and limitations

Use the Azure Web PubSub Emulator to develop and test messaging applications locally with
raw WebSocket, JSON, or protobuf clients. It is a local development tool, not a production
service or a substitute for validating your application against Azure Web PubSub.

See the [README](README.md) for setup and configuration.

## Supported features

| Area | What you can do |
| --- | --- |
| Local endpoint | Choose a listening address and access key, and use the connection string printed at startup. Check readiness with `HEAD /api/health`. |
| Client authentication | Connect with an access-key-signed JWT in the query string or bearer header. |
| Raw WebSocket | Send text or binary user events, receive handler replies, or publish to a group with `noEcho`. See [raw modes](README.md#raw-websocket-events-and-group-sends). |
| JSON clients | Use `json.webpubsub.azure.v1` for group operations, user events, acknowledgements, ping, and metadata. |
| Protobuf clients | Use `protobuf.webpubsub.azure.v1` for the same operations with binary envelopes and native `google.protobuf.Any` payloads. See [protobuf clients](README.md#protobuf-clients). |
| Reliable clients | Use `json.reliable.webpubsub.azure.v1` or `protobuf.reliable.webpubsub.azure.v1` to recover after an unexpected disconnect and replay unacknowledged messages. See the recovery limits below. |
| Groups and permissions | Set initial groups and roles in client tokens, authorize group operations with wildcard roles, and query, grant, or revoke connection permissions through REST. |
| HTTP handlers | Accept or reject new connections, customize user IDs, roles, groups, and subprotocols, handle user events, and receive lifecycle notifications. See [handler configuration](README.md#http-lifecycle-notifications). |
| Handler validation and retries | Validate webhook endpoints and retry eligible transient failures. Handlers must tolerate duplicate events. See [validation and retries](README.md#handler-validation-and-retries). |
| REST messaging | Send text, JSON, or binary data to connections, users, groups, or all clients. Filter recipients with OData and exclude connection IDs where supported. |
| Client token generation | Use `POST /api/hubs/{hub}/:generateToken` with the optional local Entra compatibility mode to generate a signed client token. See [local server SDK authentication](README.md#local-server-sdk-authentication). |
| REST connection and group management | Check connection, user, or group presence; change group membership for connections, users, or filtered connections; remove a connection from all groups; close individual connections or connections in a hub, group, or user scope, with exclusions and an optional reason. |

Implemented REST operations support GA API versions from `2021-10-01` through `2024-12-01`.
Requests without `api-version` use the latest supported version.
Not all service REST operations are available; see [unsupported REST operations](#unsupported-rest-operations).

## Development limits

- **Message expiration:** TTL values are validated but messages are not expired by TTL.
	Do not use the emulator to test whether expired messages are discarded.
- **Recovery:** Reliable connections can recover for 30 seconds after an unexpected disconnect,
	only while the same emulator process is running. Restarting loses connections, groups, and
	pending messages. Each connection can buffer up to 1,000 unacknowledged messages and 16 MiB;
	connections that exceed the buffer limits are closed. Acknowledge received sequence IDs regularly.
- **Event Hubs:** Delivery failures are logged but do not fail the client event when a listener
	matches. A successful client acknowledgement
	does not confirm Event Hubs delivery.
	See [Event Hubs setup and limitations](README.md#event-hubs-listeners).
- **Authentication testing:** Access-key authentication is supported. The optional server SDK
	token-credential mode skips signature and identity validation and must only be used in trusted
	local environments. It cannot validate Microsoft Entra ID authentication or Azure RBAC.
	See [local server SDK authentication](README.md#local-server-sdk-authentication).

## Connection permission APIs

Connection permission APIs use `HEAD`, `PUT`, and `DELETE` on
`/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}?targetName={group}`.
The target is a required, case-sensitive literal group name (1–1024 characters, not all
whitespace); `*` does not mean all groups. Token wildcard roles still apply, but revoking
a matching literal group denies that group until granted again. Revocation does not remove
existing group membership. Query returns `200` when allowed, otherwise `404`; grant returns
`200` or `404` for a missing connection; revoke returns `204`, including missing connections.
Updates exceeding 1,000 literal rules per permission return `409` without changing state.
These APIs support the same GA versions as the other REST connection operations.

## Bulk group operations

See [manage group membership](README.md#manage-group-membership) for SDK examples, filter
behavior, and the executable integration tests.

`POST /api/hubs/{hub}/:addToGroups` and `POST /api/hubs/{hub}/:removeFromGroups` accept a JSON
object such as `{"groups":["room","updates"],"filter":"userId eq 'alice'"}` and return `200`,
including when no connections match. `groups` is required and nonempty; each case-sensitive
name must be 1–1024 characters and not all whitespace. There is no separate group-count cap.
**Omitting `filter`, or passing null or an empty string, selects all connections in the hub.**

Requests require `application/json` and a known Content-Length within the emulator's body limit
(1 MiB by default); reads are also bounded. Invalid bodies, names, or filters return `400`, and
unsupported content types return `415`. All input is validated and matching connections are
selected before any membership changes. This is not a transaction against concurrent updates.

`DELETE /api/hubs/{hub}/connections/{connectionId}/groups` returns `204`, including missing
connections or already-empty memberships. All three operations preserve permissions and
reliable recovery, and support the same API versions as other implemented REST operations.

## User IDs in REST URLs

For the supported API versions and requests without `api-version`, encoded slashes in user IDs
are not interpreted as `/`. If your application uses slashes or percent-encoded characters in
user IDs, check the target against these examples:

| Request path segment | User ID targeted by current API versions |
| --- | --- |
| `tenant%2Falice` | `tenant%2Falice` (not `tenant/alice`) |
| `tenant%252Falice` | `tenant%2Falice` |
| `alice%20smith` | `alice smith` |
| `alice+bob` | `alice+bob` (not `alice bob`) |

## Unsupported features

- Bearer or managed identity authentication for outbound HTTP handlers. Omit `Auth` from
	handler configuration; configuring it prevents startup.
- Key Vault URL references and `tunnel://` handler URLs. Use a directly reachable HTTP(S)
	handler URL for local development.
- Client invocation and message streaming.
- Native protobuf request bodies (`application/x-protobuf`) in REST send operations. Use
	text, JSON, or binary REST payloads; native Any payloads are supported through protobuf clients.
- Client-certificate authentication and production Microsoft Entra ID token validation.
- MQTT clients and MQTT client-token generation.

### Unsupported REST operations

The following service operations are not implemented by the emulator. Paths below are relative
to `/api/hubs/{hub}`.

| Operation | Method | Path |
| --- | --- | --- |
| List connections in a group, including pagination | GET | `/groups/{group}/connections` |

Closing connections and adding or removing individual connection-to-group memberships remain supported.

## User-event errors

To handle client user events, configure a matching HTTP handler or Event Hubs listener.
Without either, JSON and protobuf events with an `ackId` receive an `InternalServerError`
acknowledgement; events without an `ackId` are logged without closing the client connection.
Raw user-event failures close the connection with status 1011; raw clients do not receive
acknowledgements. Group sends do not require a handler or listener.