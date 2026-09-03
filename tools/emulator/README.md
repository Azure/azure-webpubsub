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

The emulator supports checking whether a connection exists, sending text, JSON, or binary data,
and closing a connection through the Azure Web PubSub REST API. For example, use the generated
connection string with the Azure Web PubSub .NET server SDK:

```csharp
using Azure.Messaging.WebPubSub;

var serviceClient = new WebPubSubServiceClient(
  "Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;",
  "chat");

bool exists = await serviceClient.ConnectionExistsAsync(connectionId);
await serviceClient.SendToConnectionAsync(
  connectionId,
  BinaryData.FromString("Hello"),
  ContentType.TextPlain);
await serviceClient.AddConnectionToGroupAsync("room", connectionId);
await serviceClient.RemoveConnectionFromGroupAsync("room", connectionId);
await serviceClient.CloseConnectionAsync(connectionId, "Done");
```

Direct sends return success when the connection does not exist, matching the service's
fire-and-forget behavior. Valid `messageTtlSeconds` values are accepted, but the emulator does not
model message expiration.

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