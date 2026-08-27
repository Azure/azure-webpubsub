# Azure Web PubSub Emulator

This directory contains the .NET tool host for the Azure Web PubSub Emulator. The current
scaffold starts an ASP.NET Core process and exposes a health endpoint. Client protocols, REST
APIs, event handlers, and other service behavior will be added in follow-up changes.

## Prerequisites

- .NET 10 SDK

## Run from source

From the repository root, run:

```powershell
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

The tool listens on `http://localhost:8080` by default. To check whether it is ready, open
`http://localhost:8080/health`. A healthy process returns:

```json
{ "status": "Healthy" }
```

Set the ASP.NET Core `Urls` configuration value to use another address. For example:

```powershell
$env:Urls = "http://localhost:8090"
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

## Pack and install the tool

```powershell
dotnet pack tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator `
  --configuration Release `
  --output artifacts\emulator

dotnet tool install `
  --tool-path artifacts\emulator-tool `
  Microsoft.Azure.WebPubSub.Emulator `
  --add-source artifacts\emulator `
  --configfile tools\emulator\NuGet.Config

artifacts\emulator-tool\awps-emulator
```

See [Supported Features and Gaps](SUPPORTED_FEATURES.md) for the current implementation status.