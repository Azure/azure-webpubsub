# Azure Web PubSub Emulator

Develop and test Azure Web PubSub applications on your machine using raw WebSocket, JSON,
or protobuf clients. You can send messages with a server SDK, manage groups and permissions,
and connect your application through HTTP event handlers without creating a Web PubSub resource.

The emulator is for **local development only**, not production use. Keep it on a trusted local
network; the default access key is public and must not be used to protect real data.
Message TTL is validated but expiration is not enforced. See
[Supported features and limitations](SUPPORTED_FEATURES.md) before testing scenarios that
depend on cloud authentication, message expiration, or recovery across process restarts.

## Get started

1. [Run from source](#run-from-source), or [build and install a local tool package](#pack-and-install-the-tool).
2. Copy the connection string printed at startup into your server application's configuration.
3. [Connect a client](#connect-a-client) and [send messages with a server SDK](#use-a-server-sdk).
4. To receive client user events in your application, [configure an HTTP handler](#http-lifecycle-notifications)
  or [Event Hubs listener](#event-hubs-listeners). Server-to-client and group messaging do not require a handler.

## Prerequisites

- To build or run from source: .NET SDK 10.0.401 or later in the .NET 10 release line.
- A local checkout of this repository for the source and packaging commands below.

Check your installed SDKs with `dotnet --list-sdks`. The commands below use PowerShell and
run from the repository root.

## Run from source

From the repository root, run:

```powershell
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

The emulator listens on `http://localhost:8080` by default and prints a connection string and
client endpoint at startup. To check whether it is ready:

```powershell
curl.exe --head "http://localhost:8080/api/health"
```

A healthy process returns `200 OK`.

## Connect a client

The client endpoint is available at:

```text
ws://localhost:8080/client/hubs/{hub}?access_token={token}
```

Use your server SDK's client-access-token API with the emulator connection string to obtain a
client URL and token. Tokens must be signed with `WebPubSub:AccessKey` and use the client endpoint
URL as their audience. Tokens can include `sub` (user ID), `role` (permissions), and
`webpubsub.group` (initial groups) claims. The default local connection string is:

```text
Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;
```

Raw clients do not request a WebSocket subprotocol. A client receives messages for groups listed
in its token's `webpubsub.group` claims. To publish raw text or binary frames to a group, add
`webpubsub_mode=sendToGroup&group={group}` and use a token with the corresponding
`webpubsub.sendToGroup` role.

JSON clients can request `json.webpubsub.azure.v1` or
`json.reliable.webpubsub.azure.v1`. The reliable protocol includes a `reconnectionToken` in the
connected message. After an unexpected disconnect, reconnect within 30 seconds using:

```text
ws://localhost:8080/client/hubs/{hub}?awps_connection_id={connectionId}&awps_reconnection_token={reconnectionToken}
```

Reliable connections retain groups and unacknowledged messages for 30 seconds within the running
emulator process. Each connection can buffer up to 1,000 unacknowledged messages and 16 MiB;
exceeding either limit closes the connection. Send `sequenceAck` messages regularly to acknowledge
all messages through the specified sequence ID. Restarting the emulator loses this state.

Protobuf clients can use `protobuf.webpubsub.azure.v1` or
`protobuf.reliable.webpubsub.azure.v1`. See [Protobuf clients](#protobuf-clients) for payload and
recovery details.

## Use a server SDK

The emulator supports checking whether connections, users, and groups exist, broadcasting or
sending text, JSON, or binary data to connections, users, and groups, changing connection group
membership, managing connection permissions, and closing individual connections through REST.
Use the connection string printed at startup with the Azure Web PubSub .NET server SDK
(`Azure.Messaging.WebPubSub`). In this example, replace the connection and user IDs with those
of a client connected to the `chat` hub:

```csharp
using Azure.Core;
using Azure.Messaging.WebPubSub;

var connectionId = "<connected-client-id>";
var userId = "<connected-user-id>";

var serviceClient = new WebPubSubServiceClient(
  "Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;",
  "chat");

await serviceClient.SendToAllAsync(
  BinaryData.FromString("Hello, everyone"),
  ContentType.TextPlain,
  excluded: new[] { connectionId },
  filter: "protocol eq 'json.webpubsub.azure.v1'");
bool exists = await serviceClient.ConnectionExistsAsync(connectionId);
await serviceClient.SendToConnectionAsync(
  connectionId,
  BinaryData.FromString("Hello"),
  ContentType.TextPlain);
bool userExists = await serviceClient.UserExistsAsync(userId);
await serviceClient.SendToUserAsync(
  userId,
  RequestContent.Create(BinaryData.FromString("Hello, user")),
  ContentType.TextPlain,
  filter: "protocol eq 'json.webpubsub.azure.v1'");
await serviceClient.AddConnectionToGroupAsync("room", connectionId);
bool groupExists = await serviceClient.GroupExistsAsync("room");
await serviceClient.SendToGroupAsync(
  "room",
  BinaryData.FromString("Hello, room"),
  ContentType.TextPlain,
  excluded: new[] { connectionId });
await serviceClient.RemoveConnectionFromGroupAsync("room", connectionId);
await serviceClient.CloseConnectionAsync(connectionId, "Done");
```

Connection, user, and group sends return success when the target does not exist, matching the
service's fire-and-forget behavior. Broadcast and group sends support repeated `excluded`
connection IDs. Broadcast, user, and group sends support OData `filter` expressions over
`connectionId`, `userId`, `groups`, and `protocol`. Invalid filters return an `Error.BadRequest`
response. Valid `messageTtlSeconds` values are accepted, but the emulator does not expire messages
based on TTL. See [connection permission APIs](SUPPORTED_FEATURES.md#connection-permission-apis)
for permission operations and [user IDs in REST URLs](SUPPORTED_FEATURES.md#user-ids-in-rest-urls)
if your user IDs contain slashes or percent-encoded characters.

## Configure the endpoint and access key

Set the ASP.NET Core `Urls` configuration value to use another address. The generated connection
string automatically uses the address and port that the emulator actually binds. For example:

```powershell
$env:Urls = "http://localhost:8090"
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

Set `WebPubSub__AccessKey` to customize the local access key. It must be at least 32 UTF-8 bytes and
cannot contain leading or trailing whitespace, semicolons, or control characters:

```powershell
$env:WebPubSub__AccessKey = "custom-emulator-access-key-1234567890"
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

## HTTP lifecycle notifications

Configure per-hub lifecycle and user-event handlers through ASP.NET Core configuration:

When running from source, add the `Hubs` section below under `WebPubSub` in
`tools/emulator/src/Microsoft.Azure.WebPubSub.Emulator/appsettings.json`. You can also use
environment variables with `__` separators, for example
`WebPubSub__Hubs__chat__EventHandlers__0__UrlTemplate`.

```json
{
  "WebPubSub": {
    "Hubs": {
      "chat": {
        "EventHandlers": [{
          "UrlTemplate": "http://localhost:7071/events/{hub}/{event}",
          "SystemEvents": ["connect", "connected", "disconnected"],
          "EventPattern": "*"
        }]
      }
    }
  }
}
```

Hub names and event names match case-insensitively; the first matching handler is used.
URL parameters are escaped. Notifications use binary-mode
CloudEvents with JSON bodies (`{}` for connected, `{"reason":"..."}` for disconnected),
an access-key signature, and per-connection cookies. Failures sending `connected` or `disconnected`
are logged; they do not reject an accepted connection. Reliable reconnects do not produce another connected
notification; disconnected is sent only on final close or recovery expiration.

The optional `connect` handler runs after token validation and before the WebSocket upgrade or
connection activation. Its event ID is `0`; later lifecycle and user events share increasing IDs starting at `1`.
The JSON request contains `claims`, `query`, `headers` (values are arrays), `subprotocols`, and
`clientCertificates` (empty; client-certificate authentication is not supported). Client
`access_token` query parameters, `Authorization`, and reserved service headers are excluded
from this body. Other request headers, including client cookies, remain in the JSON body;
they are not copied to the outbound HTTP headers.

A 2xx connect response accepts the connection. An empty body or JSON `null` leaves token defaults
unchanged. A JSON object can override `userId` (including the empty string), `roles` (an empty
array removes token roles), and `groups` (only a nonempty array replaces token groups). Invalid
groups, malformed JSON, or responses larger than 16 MiB fail with HTTP 500. JSON parsing does
not depend on response Content-Type. Non-2xx statuses are returned before upgrading; rejected
connections do not emit connected/disconnected notifications. Error bodies are not forwarded.

`subprotocol` selects the WebSocket protocol; if absent or null, the first supported protocol
offered by the client is used. Handlers should select a protocol the client offered. Custom
protocols use raw WebSocket messages. Raw-mode query parameters are validated before connect,
even when the initial protocol offer includes JSON. Successful connect cookies and
`ce-connectionState` (including an empty value) are retained for later notifications. Reliable
recovery retains these values and does not invoke `connect` again.

### Handler validation and retries

Before sending any handler event, the emulator validates the handler URL with `{event}` set to
`validate`. The endpoint must answer OPTIONS (or GET when OPTIONS returns 404) with a 2xx status
and `WebHook-Allowed-Origin` containing `*` or the request's `WebHook-Request-Origin` host.
Origin matching is case-insensitive. Return `*` or the matching origin as a header value rather
than a comma-separated string. Validation carries `ce-awpsversion: 1.0`, but no connection
cookies or signature, and has a 10-second timeout per OPTIONS/GET operation.

Restart the emulator after changing handler configuration so that validation runs again.
An unreachable or incorrectly configured validation endpoint can prevent events from reaching
your handler; check the emulator logs when troubleshooting.

Validation and handler requests retry HTTP 408, 5xx, and eligible network failures after 1, 3,
and 5 seconds (at most four attempts). HTTP 429, other 4xx responses, timeouts, cancellations,
and invalid non-ASCII request headers are not retried. Retries resend the same event, so your
handler must tolerate duplicates. Handler requests have a default 100-second timeout through
response headers, including retry delays.

### User events

JSON and protobuf user-event messages, including their reliable variants, use `EventPattern`,
independently of `SystemEvents`. Use the event selection forms described in the
[Azure Web PubSub configuration reference](https://learn.microsoft.com/azure/templates/microsoft.signalrservice/webpubsub/hubs#eventhandler):

- `*` to select all user events.
- A comma-separated list such as `message,join` to select those event names.
- A single event name such as `message` to select that event.

Event names are matched case-insensitively. The first matching handler wins.

Requests carry `azure.webpubsub.user.<event>` CloudEvents, the original text/JSON/binary bytes,
and per-message `x-webpubsub-metadata-*` headers. They reuse connection identity, signature,
cookies, validation, and retries. A successful HTTP response may send a server message before
the acknowledgement. Nonempty response bodies use `text/plain`, `application/json`, or
`application/octet-stream`; absent Content-Type means binary. Empty bodies use text regardless
of Content-Type and produce a message only when response metadata is present.

Response metadata keys are lowercased; the last header value and its last comma-separated value
(trimmed) win. Metadata belongs to that response, not the connection. Successful responses may
update `ce-connectionState`, including an empty value; absent state preserves the previous value.
Reliable clients receive unacknowledged replies again after recovery without invoking the
handler again. Reusing a successfully processed `ackId` does not invoke the handler again.

Missing both a handler and a matching listener, non-2xx handler responses, unsupported nonempty response Content-Type, and response
bodies exceeding 16 MiB yield a generic `InternalServerError` acknowledgement when `ackId` is
present. Without `ackId`, errors are logged without closing the connection. Error response bodies
and metadata are not forwarded for these `event` messages. A failed event can be retried with
the same `ackId`.

### Raw WebSocket events and group sends

Raw clients (including custom subprotocols selected by a connect handler) send text/binary frames
as the user event `message`. This is the default when `webpubsub_mode` is absent or empty, or when
it is `sendEvent`. Configure a handler `EventPattern` or listener `UserEventPattern` that matches `message`; group-send roles are not
required for user events. Replies contain only the response bytes: text/JSON use text frames and
binary uses binary frames. There is no JSON envelope, acknowledgement, or metadata encoding.
An empty response with metadata produces an empty text frame; without metadata it sends no frame.
Missing both a handler and a matching listener, or failed handler calls, close the raw connection with status 1011 and a generic
reason; handler error details are not forwarded. Raw connections do not support reliable recovery.

`webpubsub_mode=sendToGroup&group=room&noEcho=true` publishes raw frames to the named group using
the connection's group-send permission. `noEcho` excludes only the sending connection; absent,
empty, or `false` retains the default echo behavior. It does not automatically join the sender to
the group. Mode names and boolean values are case-insensitive. Repeated `webpubsub_mode`, `group`,
and `noEcho` parameters use their last value. Invalid modes, group names, or group-send `noEcho`
values fail before upgrade; `sendEvent` ignores `group` and `noEcho`. These parameters are validated
for all initial connections but only affect raw WebSocket messages, not JSON or protobuf messages.

### Unsupported handler options

**Outbound handler authentication is not supported by the emulator.** Omit `Auth` entirely
(including `Auth.Type=None`); configuring it is rejected at startup, not silently sent anonymously.
Client access tokens are never reused as handler credentials. This does not change access-key
client/REST authentication or the separate inbound REST compatibility option below.

Key Vault URL references and `tunnel://` handler URLs are unsupported. Use a directly reachable
HTTP(S) URL for your local application. Unsupported handler configuration is rejected at startup.

## Protobuf clients

Negotiate `protobuf.webpubsub.azure.v1` and send binary WebSocket messages containing an
`UpstreamMessage`. You can use group permissions, HTTP event handlers, and Event Hubs listeners
with protobuf clients as well as JSON clients.
Supported operations are join/leave group, send to group (`no_echo`, metadata and TTL validation),
user events, and ping. Replies use binary `DownstreamMessage` envelopes.

Payloads support text, binary, JSON and native `google.protobuf.Any`. HTTP handlers receive and
return native Any envelopes with `application/x-protobuf`; Event Hubs preserves those bytes and
content type. Mixed group recipients receive native Any in protobuf, base64 with `dataType=protobuf`
in JSON, or a binary frame in raw WebSocket. Protobuf has no `fromUserId` field.
Metadata-only protobuf events require a nonempty metadata map; explicitly selected empty text or
binary data is also valid. Existing REST text/JSON/binary sends can target protobuf clients;
REST `application/x-protobuf` input remains unsupported.

For recovery, negotiate `protobuf.reliable.webpubsub.azure.v1`. The binary connected message
includes a `reconnection_token`; reconnect with `awps_connection_id` and
`awps_reconnection_token` on the same hub, using the original subprotocol. Like reliable JSON,
the emulator retains the connection for 30 seconds after an unexpected disconnect, preserving
groups and acknowledgement IDs. Unacknowledged data is replayed in sequence order, including
metadata and native Any payloads. Send `sequence_ack_message` with the last received
`sequence_id` to release buffered messages through that ID. Recovery requires the same running
emulator process and keeps the original protocol rather than switching to a newly offered one.

Invocation and streaming are not supported. Streaming requests are rejected.

## Event Hubs listeners

Listeners forward lifecycle and user events **from the Web PubSub emulator to Event Hubs**.

Configure `EventListeners` alongside `EventHandlers` within `WebPubSub:Hubs:<hub>`:

```json
"EventListeners": [{
  "EventNameFilter": {
    "SystemEvents": ["connected", "disconnected"],
    "UserEventPattern": "message, join"
  },
  "EventHubEndpoint": {
    "FullyQualifiedNamespace": "<namespace>.servicebus.windows.net",
    "EventHubName": "<event-hub-name>"
  }
}]
```

For Azure, the emulator uses `DefaultAzureCredential` for the **host's identity**, which needs
**Azure Event Hubs Data Sender** on the target, and connects over AMQP WebSockets. It does not
impersonate a Web PubSub resource's managed identity or reproduce trusted-service firewall bypass.
This credential is only for Event Hubs; HTTP handler `Auth` remains unsupported.

For the [local Event Hubs emulator](https://learn.microsoft.com/azure/event-hubs/test-locally-with-event-hub-emulator),
omit `FullyQualifiedNamespace` and set `EventHubEndpoint:ConnectionString` through configuration,
for example the environment variable
`WebPubSub__Hubs__chat__EventListeners__0__EventHubEndpoint__ConnectionString`.
It must contain `UseDevelopmentEmulator=true`; cloud SAS connection strings are not supported.
Keep `EventHubName` set and do not commit credentials. Running the separate Event Hubs emulator
requires its Docker prerequisites and your acceptance of its license terms.

- All matching listeners receive the event, including duplicate settings.
  Set `UserEventPattern` to a single event name, a comma-separated list such as `message,join`,
  or `*` for all user events. Event names are trimmed and matched case-insensitively.
- Only `connected` and `disconnected` system events are eligible; `connect` and unknown system
  names are ignored. Reliable recovery does not emit another connected event.
- Listeners are attempted before HTTP handlers and share their event ID. Listener-only events
  need no response handler: JSON acknowledgements succeed and raw connections remain open.
  Listeners cannot reply or update state. If an HTTP handler is also configured, its failures
  still fail the event. Reusing a successfully processed `ackId` does not send the event again.
- Event Hubs messages use `cloudEvents:*` AMQP properties, `MessageId=connectionId/eventId`, and
  `PartitionKey=connectionId`. Bodies preserve user payload bytes; connected uses `{}` and
  disconnected uses `{"reason":"..."}`. User metadata uses `x-webpubsub-metadata-{lowercase-key}`
  application properties; case-insensitive duplicate keys use the last value, matching HTTP upstream.
  Values, including empty strings, whitespace, and commas, are preserved without splitting or trimming.
  Metadata-only events retain an empty body; metadata
  remains separate from `cloudEvents:*` attributes and is not retained on the connection.
  Signatures and cookies are not forwarded. Empty connection state is omitted. Partition affinity is not an ordering guarantee
  between concurrently dispatched lifecycle and user events.
- **A successful client acknowledgement does not confirm Event Hubs delivery.** Delivery
  failures are logged but do not cause the client event to fail when a listener matches.
  The SDK handles transport retries;
  there is no emulator dead-letter store or durable replay. Shutdown allows 10 seconds to drain.

## Local server SDK authentication

> **Security warning:** This optional mode does not authenticate the caller's identity or
> enforce Azure RBAC. Do not enable it on an endpoint accessible to untrusted clients, and
> do not use it to test authorization decisions.

`WebPubSub:AllowUnvalidatedEntraTokens` is disabled by default. Enable it only for trusted local
server SDK `TokenCredential` testing. With an HTTPS emulator endpoint, the SDK can use
`DefaultAzureCredential`:

```csharp
using Azure.Identity;
using Azure.Messaging.WebPubSub;

var serviceClient = new WebPubSubServiceClient(
  new Uri("https://localhost:8080"),
  "chat",
  new DefaultAzureCredential());
```

`DefaultAzureCredential` obtains a real token, but this emulator mode does **not** validate Azure
RBAC. It checks only the Azure Web PubSub audience and token lifetime; it does not validate the
signature, algorithm, issuer, tenant, identity, or role assignments. It does not change client
WebSocket token validation. Server SDKs require an HTTPS endpoint when sending bearer tokens.

When multiple listening addresses are configured, use the connection string printed at startup
to identify the selected endpoint.

## Pack and install the tool

To build and install a package from this checkout, run the following from the repository root.
This installs your local build; it does not download a published release.

```powershell
dotnet pack tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator `
  --configuration Release `
  --output artifacts\emulator

dotnet tool install `
  --tool-path artifacts\emulator-tool `
  Microsoft.Azure.WebPubSub.Emulator `
  --version 1.0.0-beta.1 `
  --add-source artifacts\emulator `
  --configfile tools\emulator\NuGet.Config

artifacts\emulator-tool\awps-emulator
```

## Versioning

The source package version is declared in [version.props](version.props); use that version in
the install command if it differs from the example. See [CHANGELOG.md](CHANGELOG.md) for changes.

See [Supported features and limitations](SUPPORTED_FEATURES.md) for supported scenarios and
differences to account for when testing locally.