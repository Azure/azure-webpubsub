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

The tool listens on `http://localhost:8080` by default and prints its connection string and client
endpoint at startup. To check whether it is ready, open the service health endpoint:

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

The token must be signed with the access key from `WebPubSub:ConnectionString` and have the
client endpoint URL as its audience. Tokens may provide `sub`, `role`, and `webpubsub.group`
claims. The default local connection string is:

```text
Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;
```

Raw clients do not request a WebSocket subprotocol. A client receives messages for groups listed
in its token's `webpubsub.group` claims. To publish raw text or binary frames to a group, add
`webpubsub_mode=sendToGroup&group={group}` and use a token with the corresponding
`webpubsub.sendToGroup` role.

Set the ASP.NET Core `Urls` configuration value to use another address. For example:

```powershell
$env:Urls = "http://localhost:8090"
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

Set `WebPubSub__ConnectionString` when changing the public endpoint or access key:

```powershell
$env:WebPubSub__ConnectionString = `
  "Endpoint=http://localhost:8090;AccessKey=<local-access-key>;Version=1.0;"
```

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