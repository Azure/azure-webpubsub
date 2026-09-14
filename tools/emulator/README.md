# Azure Web PubSub Emulator

This directory contains the .NET tool for running an Azure Web PubSub-compatible raw WebSocket
client endpoint locally.

## Prerequisites

- .NET 10 SDK

## Run from source

From the repository root, run:

```powershell
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

The tool listens on `http://localhost:8080` by default. At startup, it derives the effective endpoint
from the bound address and prints the generated connection string and client endpoint. To check
whether it is ready, open the service health endpoint:

```powershell
curl.exe --head "http://localhost:8080/api/health"
```

A healthy process returns `200 OK`. When `api-version` is omitted, the emulator uses its latest
supported API version.

## Connect a client

The client endpoint is available at:

```text
ws://localhost:8080/client/hubs/{hub}?access_token={token}
```

The token must be signed with the configured `WebPubSub:AccessKey` and have the client endpoint URL
as its audience. Tokens may provide `sub`, `role`, and `webpubsub.group` claims. The deterministic
default local connection string is:

```text
Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;
```

Raw clients do not request a WebSocket subprotocol. A client receives messages for groups listed
in its token's `webpubsub.group` claims. To publish raw text or binary frames to a group, add
`webpubsub_mode=sendToGroup&group={group}` and use a token with the corresponding
`webpubsub.sendToGroup` role.

JSON clients can request `json.webpubsub.azure.v1` or
`json.reliable.webpubsub.azure.v1`. The reliable protocol includes a `reconnectionToken` in the
connected message. After an unexpected disconnect, recover the logical connection with:

```text
ws://localhost:8080/client/hubs/{hub}?awps_connection_id={connectionId}&awps_reconnection_token={reconnectionToken}
```

Reliable connections retain groups and unacknowledged messages for 30 seconds within the running
emulator process. The replay buffer is limited to 1,000 messages and 16 MiB per connection. Send
`sequenceAck` messages to cumulatively acknowledge delivered sequence IDs.

## Use a server SDK

The emulator supports checking whether connections, users, and groups exist, broadcasting or
sending text, JSON, or binary data to connections, users, and groups, changing connection group
membership, and closing a connection through the Azure Web PubSub REST API. For example, use the
generated connection string with the Azure Web PubSub .NET server SDK:

```csharp
using Azure.Core;
using Azure.Messaging.WebPubSub;

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
response before the message body is processed. Valid `messageTtlSeconds` values are accepted, but
the emulator does not model message expiration.

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
an access-key signature, and cookies isolated to each logical connection. Notification failures
are logged without rejecting the WebSocket. Reliable reconnects do not produce another connected
notification; disconnected is sent only on final close or recovery expiration.

The optional `connect` handler runs after token validation and before the WebSocket upgrade or
connection activation. Its event ID is `0`; later lifecycle and user events share increasing IDs starting at `1`.
The JSON request contains `claims`, `query`, `headers` (values are arrays), `subprotocols`, and
`clientCertificates` (empty; client-certificate authentication is not supported). Client
`access_token` query parameters, `Authorization`, and `X-ASRS-Internal-*` headers are excluded
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
protocols use the raw WebSocket processor. Raw-mode query parameters are validated before connect,
even when the initial protocol offer includes JSON. Successful connect cookies and
`ce-connectionState` (including an empty value) are retained for later notifications. Reliable
recovery reuses the original connection context and does not invoke connect again.

Before sending any handler event, the emulator validates the handler URL with `{event}` set to
`validate`. The endpoint must answer OPTIONS (or GET when OPTIONS returns 404) with a 2xx status
and `WebHook-Allowed-Origin` containing `*` or the request's `WebHook-Request-Origin` host.
Origin matching is case-insensitive; values are matched as returned by the HTTP header parser,
not additionally split on commas. Validation carries `ce-awpsversion: 1.0`, but no connection
cookies or signature, and has a 10-second deadline per OPTIONS/GET operation.

Validation results are cached per resolved validation URL. The first request waits for validation;
later requests use the previous result while an expired entry refreshes. Success is cached for
one minute. Failed validation retries on subsequent use after 1, 2, 4, 8, 16, 32, then 60 seconds
(capped at one minute). Restart the emulator after changing handler configuration to clear the cache.

Validation and handler requests retry HTTP 408, 5xx, and eligible `HttpRequestException`
failures after 1, 3, and 5 seconds (at most four attempts). HTTP 429, other 4xx responses,
cancellation/timeouts, and the non-ASCII-header exception are not retried. Retries reuse the event
identity and body, so handlers should tolerate duplicates. The HTTP client's default
100-second deadline covers sending through response headers, including retry delays.

### User events

JSON and reliable JSON `event` messages use `EventPattern`, independently of `SystemEvents`.
Patterns are comma-separated and case-insensitive. A standalone `*` matches all events, including
dotted names. Within a pattern, `*` matches zero or more non-dot characters, `?` matches one
non-dot character, and `**` crosses dots. Event patterns do not inherit the 1024-character
permission-pattern limit. The tokenizer accepts `\*`, `\?`, and `\\` escapes. As in the runtime,
patterns containing no unescaped wildcard use the original pattern string for literal comparison:
`room\*` matches `room\*`, not `room*`; `room\*?` matches `room*a` through the wildcard matcher.
A standalone `*` stops parsing the remaining list entries; invalid escapes before it are rejected
at startup. The first matching handler wins.

Requests carry `azure.webpubsub.user.<event>` CloudEvents, the original text/JSON/binary bytes,
and per-message `x-webpubsub-metadata-*` headers. They reuse connection identity, signature,
cookies, validation, and retries. A successful HTTP response may send a server message before
the acknowledgement. Nonempty response bodies use `text/plain`, `application/json`, or
`application/octet-stream`; absent Content-Type means binary. Empty bodies use text regardless
of Content-Type and produce a message only when response metadata is present.

Response metadata keys are lowercased; the last header value and its last comma-separated value
(trimmed) win. Metadata belongs to that response, not the connection. Successful responses may
update `ce-connectionState`, including an empty value; absent state preserves the previous value.
Replies use the existing reliable buffer and are replayed after recovery without re-dispatching
the event. Successful `ackId` values are cached; duplicates do not invoke the handler again.

Missing both a handler and a matching listener, non-2xx handler responses, unsupported nonempty response Content-Type, and response
bodies exceeding 16 MiB yield a generic `InternalServerError` acknowledgement when `ackId` is
present. Without `ackId`, errors are logged without closing the connection. Error response bodies
and metadata are not forwarded for these `event` messages. Failed acknowledgements are not cached.

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
for all initial connections but only affect the raw processor, not JSON/reliable JSON messages.

### Unsupported handler options

**Outbound handler authentication is not supported by the emulator.** Omit `Auth` entirely
(including `Auth.Type=None`); configuring it is rejected at startup, not silently sent anonymously.
Client access tokens are never reused as handler credentials. This does not change access-key
client/REST authentication or the separate inbound REST compatibility option below.

Protobuf responses and Key Vault URL references are also unsupported.
Unsupported handler configuration is rejected at startup.

## Event Hubs listeners

Listeners send events **from the Web PubSub emulator to Event Hubs** using the Azure Event Hubs SDK.
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
  `UserEventPattern` is a case-insensitive, comma-separated list of trimmed **literal
  names**, or a standalone `*`. Unlike HTTP `EventPattern`, `room.*` is not a wildcard pattern.
- Only `connected` and `disconnected` system events are eligible; `connect` and unknown system
  names are ignored. Reliable recovery does not emit another connected event.
- Listeners are attempted before HTTP handlers and share their event ID. Listener-only events
  need no response handler: JSON acknowledgements succeed and raw connections remain open.
  Listeners cannot reply or update state. If an HTTP handler is also configured, its failures
  still fail the event. Cached successful acknowledgements suppress duplicate dispatch.
- Event Hubs messages use `cloudEvents:*` AMQP properties, `MessageId=connectionId/eventId`, and
  `PartitionKey=connectionId`. Bodies preserve user payload bytes; connected uses `{}` and
  disconnected uses `{"reason":"..."}`. Ordinary message metadata, signatures, and cookies are
  not forwarded. Empty connection state is omitted. Partition affinity is not an ordering guarantee
  between concurrently dispatched lifecycle and user events.
- **Acknowledgement success is not proof of broker delivery.** As in the runtime, a matched
  listener counts even if delivery fails; failures are logged. The SDK handles transport retries;
  there is no emulator dead-letter store or durable replay. Shutdown allows 10 seconds to drain.

The opt-in `EventHubLiveTests` test sends raw WebSocket events through the actual producer and
reads them from a broker. Set `AWPS_TEST_EVENTHUB_NAME` plus either `AWPS_TEST_EVENTHUB_NAMESPACE`
or `AWPS_TEST_EVENTHUB_CONNECTION_STRING` (local emulator only) before running the test suite.
Use a dedicated test Event Hub with a `$Default` consumer group; Azure testing also needs
**Azure Event Hubs Data Receiver**. Without those settings the test is explicitly skipped;
SDK test doubles in the regular suite do not establish real-broker interoperability.

## Local server SDK authentication

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

When multiple listener addresses are configured, the first address in ordinal order is the
effective endpoint.

## Pack and install the tool

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

The next release version is declared in `version.props` and documented in `CHANGELOG.md`.
Continuous integration packages use a unique `0.0.0-ci.<run-number>` version instead of the
release version.

See [Supported Features and Gaps](SUPPORTED_FEATURES.md) for the current implementation status.