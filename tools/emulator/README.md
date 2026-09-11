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

Configure per-hub `connect`, `connected`, and `disconnected` handlers through ASP.NET Core configuration:

```json
{
  "WebPubSub": {
    "Hubs": {
      "chat": {
        "EventHandlers": [{
          "UrlTemplate": "http://localhost:7071/events/{hub}/{event}",
          "SystemEvents": ["connect", "connected", "disconnected"]
        }]
      }
    }
  }
}
```

Hub names and event names match case-insensitively; the first matching handler is used.
There is no `_default` fallback. URL parameters are escaped. Notifications use binary-mode
CloudEvents with JSON bodies (`{}` for connected, `{"reason":"..."}` for disconnected),
an access-key signature, and cookies isolated to each logical connection. Notification failures
are logged without rejecting the WebSocket. Reliable reconnects do not produce another connected
notification; disconnected is sent only on final close or recovery expiration.

The optional `connect` handler runs after token validation and before the WebSocket upgrade or
connection activation. Its event ID is `0`; connected and disconnected start at `1` and `2`.
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

Before sending connect events or notifications, the emulator validates the handler URL with `{event}` set to
`validate`. The endpoint must answer OPTIONS (or GET when OPTIONS returns 404) with a 2xx status
and `WebHook-Allowed-Origin` containing `*` or the request's `WebHook-Request-Origin` host.
Origin matching is case-insensitive; values are matched as returned by the HTTP header parser,
not additionally split on commas. Validation carries `ce-awpsversion: 1.0`, but no connection
cookies or signature, and has a 10-second deadline per OPTIONS/GET operation.

Validation results are cached per resolved validation URL. The first request waits for validation;
later requests use the previous result while an expired entry refreshes. Success is cached for
one minute. Failed validation retries on subsequent use after 1, 2, 4, 8, 16, 32, then 60 seconds
(capped at one minute). Restart the emulator after changing handler configuration to clear the cache.

Validation, connect, and notification requests retry HTTP 408, 5xx, and eligible `HttpRequestException`
failures after 1, 3, and 5 seconds (at most four attempts). HTTP 429, other 4xx responses,
cancellation/timeouts, and the non-ASCII-header exception are not retried. Retries reuse the event
identity and body, so handlers should tolerate duplicates. The HTTP client's default
100-second deadline covers sending through response headers, including retry delays.

User-event responses, bearer authentication, Key Vault URL references, and Event Hubs listeners
are not supported yet. Unsupported handler configuration is rejected at startup.

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