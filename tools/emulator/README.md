# Azure Web PubSub Emulator

Use the Azure Web PubSub Emulator to develop and test Web PubSub applications locally without
creating an Azure Web PubSub resource. The emulator supports common client connections,
messaging, groups, REST operations, event handlers, and Event Hubs listeners.

The emulator stores all state in memory. Connections, groups, and messages are cleared when it
stops.

## Get started

```powershell
dotnet run --project tools\emulator\src\Microsoft.Azure.WebPubSub.Emulator
```

The emulator listens on `http://localhost:8080` and prints a connection string you can use with
an Azure Web PubSub server SDK:

```text
Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;
```

The access key is for local development only. Do not use it outside the emulator.

To check whether the emulator is ready, open `http://localhost:8080/health`. A healthy instance
returns:

```json
{ "status": "Healthy" }
```

## Configure the emulator

Settings use the `WebPubSub` section in `appsettings.json`:

| Setting | Purpose |
| --- | --- |
| `WebPubSub:ConnectionString` | Changes the local endpoint or access key. |
| `WebPubSub:AllowUnvalidatedEntraTokens` | Enables limited local compatibility for server SDKs that use `TokenCredential`. Keep this disabled unless required. |
| `WebPubSub:ManagedIdentityClientId` | Selects a user-assigned managed identity for event delivery. |
| `WebPubSub:EventHandlerTimeout` | Sets how long the emulator waits for an HTTP event handler. |
| `WebPubSub:Hubs` | Configures event handlers and Event Hubs listeners by hub name. |
| `Urls` | Changes the address where the emulator listens. |

The following configuration keeps all optional integrations disabled:

```json
{
  "WebPubSub": {
    "ConnectionString": "Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;",
    "AllowUnvalidatedEntraTokens": false,
    "EventHandlerTimeout": "00:00:30",
    "Hubs": {}
  },
  "Urls": "http://localhost:8080"
}
```

You can also use environment variables. Replace each `:` with `__`, for example
`WebPubSub__ConnectionString`.

## Configure an event handler

Add an HTTP event handler under the hub that should send events:

```json
{
  "WebPubSub": {
    "Hubs": {
      "chat": {
        "EventHandlers": [
          {
            "UrlTemplate": "http://localhost:7071/runtime/webhooks/webpubsub?hub={hub}&event={event}",
            "EventPattern": "*",
            "SystemEvents": [ "connect", "connected", "disconnected" ],
            "Auth": { "Type": "None" }
          }
        ]
      }
    }
  }
}
```

The URL can contain `{hub}` and `{event}` placeholders. The emulator sends connection and user
events in the same CloudEvents format used by Azure Web PubSub. A `connect` response can assign
the user ID, roles, groups, and subprotocol. Responses to user events are returned to the client.

For an authenticated handler, set `Auth:Type` to `ManagedIdentity` and configure
`Auth:ManagedIdentity:Resource` with the handler's application ID URI.

## Configure an Event Hubs listener

Add a listener to send user and lifecycle events to Azure Event Hubs:

```json
{
  "WebPubSub": {
    "Hubs": {
      "chat": {
        "EventListeners": [
          {
            "EventNameFilter": {
              "UserEventPattern": "*",
              "SystemEvents": [ "connected", "disconnected" ]
            },
            "EventHubEndpoint": {
              "FullyQualifiedNamespace": "example.servicebus.windows.net",
              "EventHubName": "webpubsub-events"
            }
          }
        ]
      }
    }
  }
}
```

Event Hubs delivery uses your local Azure credentials or managed identity. Grant that identity
the Azure Event Hubs Data Sender role. Event Hubs connection strings and access keys are not
accepted.

## Authentication notes

Access-key authentication is enabled by default for client and REST requests.

The emulator does not validate Microsoft Entra identities or Azure role assignments. Enable
`WebPubSub:AllowUnvalidatedEntraTokens` only when you need to test a server SDK's
`TokenCredential` flow locally. This mode validates only basic token properties and must not be
used on an untrusted network. The server SDK requires HTTPS when it sends bearer tokens.

## Feature support

See [Supported Features and Gaps](SUPPORTED_FEATURES.md) for supported REST operations,
subprotocols, integrations, and differences from Azure Web PubSub.
