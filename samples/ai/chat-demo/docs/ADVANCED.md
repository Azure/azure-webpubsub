# Advanced Architecture & Operations

This document dives deeper into how the chat demo works across explicit transport + storage modes, the benefits of using Azure Web PubSub (service + client protocol), environment configuration, and extensibility.

---
## 1. Runtime Modes Overview

| Combination | Transport (`TRANSPORT_MODE`) | Storage (`STORAGE_MODE`) | Inbound Events | Typical Use |
|-------------|------------------------------|--------------------------|----------------|-------------|
| self + memory (default) | Internal WebSocket server on :5001 | Ephemeral memory | N/A (in‑process) | Quick prototype / offline |
| self + table | Internal WebSocket | Azure Table / Azurite | N/A | Local dev with persistent history |
| webpubsub + memory | Azure Web PubSub service | Memory | CloudEvents if service can reach handler | Test service transport without persistence |
| webpubsub + table (Azure deploy) | Azure Web PubSub service | Azure Table | CloudEvents POSTed to `/eventhandler` | Realistic multi‑user, scalability |


---
## 2. Local Development Paths

### 2.1 Pure Local (No Azure)
- Start everything with `python start_dev.py` after building the React client.
- WebSocket: ws://localhost:5001
- Pros: zero Azure dependency, instant start.
- Cons: No persistence, no service semantics (e.g. different connection negotiation, scaling).

### 2.2 Hybrid Local + Azure (No Tunnel)
- Set `TRANSPORT_MODE=webpubsub` and `WEBPUBSUB_ENDPOINT=https://<name>.webpubsub.azure.com`.
- Clients negotiate `/negotiate` (local) → returns signed URL from Azure.
- No CloudEvents because Azure cannot reach your local endpoint.
- Suitable when you only need send/broadcast behavior for iteration.

### 2.3 Hybrid Local + Azure (With Tunnel)
- Use [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to forward traffic using `tunnel:///eventhandler` to your localhost.
- Update hub event handler URL in Azure to the tunnel URL `tunnel:///eventhandler`.
- Now connects/disconnects/room change events flow exactly like production.

---
## 3. Why Azure Web PubSub Service?

### 3.1 Operational Benefits
- Fully managed fan‑out: high concurrency, elastic scaling.
- Native groups abstraction (maps to chat rooms) – optimized group membership management.
- Built‑in authentication: short‑lived signed URLs (client access tokens) reduce credential exposure.
- CloudEvents integration: consistent lifecycle and user event hooks delivered via HTTPS – polyglot friendly.
- Role Based Access Control (RBAC) with Managed Identity: principle of least privilege.
- TLS + global infrastructure + SLA vs maintaining your own WebSocket fleet.

### 3.2 Development Velocity
- Switch between local and cloud without refactoring application logic – `build_chat_service` factory abstracts transport.

### 3.3 Cost / Efficiency
- Free tier (F1) adequate for small demos / POCs.
- Pay for actual service capabilities only when you outgrow self‑hosted local mode.

---
## 4. Web PubSub Client Protocol Benefits

The application uses a JSON-based protocol shaped around Azure Web PubSub conventions (`json.reliable.webpubsub.azure.v1`). Benefits:

1. Reliability & Ordering: The reliable subprotocol includes sequencing that aids clients resuming or detecting drops.
2. Consistent Abstraction: Whether self-host or service-backed, the message envelope (type / room / payload) is uniform.
3. Server Simplification: The negotiation endpoint returns a fully formed service access URL; the server does not need to manage individual socket lifetimes in Azure mode.
4. Extensible Event Surface: User events (`user.eventName`) flow through CloudEvents + the protocol without special wiring.
5. Future‑proofing: Additional Web PubSub features (e.g., large message handling, upstream REST calls, live trace) can be introduced without client-breaking changes.

---
## 5. Environment Variables & Precedence

| Variable | Local Default | Azure App Service | Purpose / Notes |
|----------|---------------|------------------|-----------------|
| `TRANSPORT_MODE` | self | webpubsub | Transport implementation |
| `STORAGE_MODE` | memory | table | Persistence backend |
| `WEBPUBSUB_ENDPOINT` | (optional) | Injected via Bicep | Service endpoint; if set uses credential chain |
| `WEBPUBSUB_CONNECTION_STRING` | (optional) | (not set) | Fallback auth if endpoint+AAD not used |
| `WEBPUBSUB_HUB` | demo_ai_chat | demo_ai_chat | Hub resource name |
| `GITHUB_TOKEN` | (user supplied) | (not injected) | Enables AI responses |
| `USE_MANAGED_IDENTITY` | false | true | Prefer ManagedIdentityCredential in Azure |
| `PUBLIC_WS_ENDPOINT` | (unset) | (optional) | Override externally reachable ws(s) URL |
| `AZURE_STORAGE_CONNECTION_STRING` | (optional) | (not set if MI used) | Table storage connection (or Azurite) |
| `AZURE_STORAGE_ACCOUNT` | (optional) | injected | Used with MI if connection string absent |
| `CHAT_TABLE_NAME` | chatmessages | chatmessages | Azure Table name |
| `PORT` | 5000 | Platform-provided | Flask bind port |

Credential resolution (webpubsub transport):
1. If `WEBPUBSUB_ENDPOINT` present → `WebPubSubServiceClient(endpoint, credential)`
2. Credential chain: if `USE_MANAGED_IDENTITY=true` and MI available → ManagedIdentityCredential else DefaultAzureCredential
3. Else if `WEBPUBSUB_CONNECTION_STRING` present → connection string client

---
## 6. Negotiation Flow

Sequence in `webpubsub` transport mode:
1. Browser hits `/negotiate` (Flask)
2. Server asks `WebPubSubServiceClient` for a client access token (roles: joinLeaveGroup, sendToGroup)
3. Token (signed URL) returned to browser
4. Browser opens WebSocket directly to service endpoint with negotiated subprotocol
5. Lifecycle & user events emitted by the service → CloudEvents POST to `/eventhandler`

In self‑host mode the negotiate endpoint just returns `ws://<host>:5001` (local WebSocket server started in background).

---
## 7. CloudEvents Handling

- Single endpoint: `/eventhandler`
- System events processed:
  - `azure.webpubsub.sys.connect` (opportunity to assign `userId`)
  - `azure.webpubsub.sys.connected`
  - `azure.webpubsub.sys.disconnected`
- User events: `azure.webpubsub.user.message` (standard chat message) and any `azure.webpubsub.user.<custom>` pattern.
- Handlers convert system/user events into internal callbacks aligning with self-host event model.

Tunnel Mode: Provide publicly reachable HTTPS → update hub event handler to point to `tunnel:///eventhandler`.

---
## 8. Persistence Strategy

- Table mode: `AzureTableRoomStore` uses Azure Table Storage (PartitionKey=room, RowKey=timestamp_random) for scalable, query-friendly history.
- Memory mode: InMemoryRoomStore only (ephemeral).

### 8.1 Local Table Development with Azurite
You can emulate table persistence locally without full Azure service mode:

```
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 mcr.microsoft.com/azure-storage/azurite
```
Then set in `python_server/.env`:
```
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
CHAT_TABLE_NAME=chatmessages
```
Set `STORAGE_MODE=table` with Azurite connection string while keeping `TRANSPORT_MODE=self` to persist history locally without Azure Web PubSub.

Design choices:
- Table storage yields efficient per-room queries (single partition scan) and avoids large monolithic blob rewrites.
- Entities store minimal columns (messageId, type, fromUser, text, ts) to reduce payload.
- Room list is approximated by cached discoveries + lightweight scan (sufficient for demo scale; could move to dedicated Rooms table for very large deployments).

---
## 9. Initialization & Concurrency

- Eager bootstrap at module import ensures:
  - Background asyncio loop started exactly once
  - Chat service (self-host or Azure variant) constructed
  - CloudEvents route registered before first request (avoids Flask late-route errors)
- Thread separation: Flask main thread + dedicated asyncio loop thread for chat operations.
- `wait_until_ready()` gates HTTP handlers (e.g., `/negotiate`) to avoid race during very early startup.

---
## 10. Reliability Enhancements

| Concern | Mitigation |
|---------|------------|
| Transient storage / service errors | Broad try/except with logging; degrade gracefully to in‑memory |
| Role assignment delay (403) | Retry after propagation (~1–2 min); avoid re-creating roles unnecessarily |

---
## 11. RBAC & Security

- Managed Identity assigned to App Service (System Assigned) – least privilege role assignments:
  - Web PubSub Service Owner (for sending to groups, managing groups)
  - Storage Table Data Contributor (for persistence)
- Local dev uses DefaultAzureCredential (env vars, Azure CLI login) – ensure you `az login`.

---
## 12. Extensibility Points

| Extension | Where | Notes |
|-----------|-------|-------|
| Custom user events | Client send with `type` set; handled in CloudEvents path | Add additional branches in `attach_flask_cloudevents` |
| AI response strategy | `chat_model_client.py` | Swap model provider / streaming policy |
| Persistence backend | Implement new `RoomStore` | Register via `build_room_store` selection logic |
| Alternative transports | Implement new `ChatServiceBase` subclass | Keep callback contract consistent |

### 12.1 Transport Layout (Code Organization)

- Base contract and helpers
  - `python_server/chat_service/base.py`: `ChatServiceBase`, event registrations, group name helpers

- Concrete transports (import only what you need)
  - `python_server/chat_service/transports/self_host.py`: Native websockets server (`ChatService`)
  - `python_server/chat_service/transports/webpubsub.py`: Azure Web PubSub (`WebPubSubChatService`)

- Selection logic
  - `python_server/chat_service/factory.py`: `build_chat_service(...)` picks the transport based on `TRANSPORT_MODE`

Adding a new transport
1. Create `python_server/chat_service/transports/<your_transport>.py` implementing a subclass of `ChatServiceBase`.
2. Keep the same callback semantics (`on_connecting/connected/disconnected/event_message`).
3. Update `factory.py` to import and instantiate your transport for a new `TransportMode` value.
4. Tests should target the transport in isolation and via the factory to ensure wiring is correct.


---
## 13. Transport Comparison (Quick Matrix)

| Aspect | self transport | webpubsub transport |
|--------|---------------|--------------------|
| Scaling | Single process | Managed, horizontal scale |
| Persistence (memory) | Ephemeral | Ephemeral (service manages connections) |
| Persistence (table) | Local/Azurite or Azure Table | Azure Table (durable) |
| Latency | Loopback | Regional network |
| Security | Local trust | AAD + RBAC + signed URLs |
| CloudEvents | N/A | Yes (tunnel or deployment) |
| Ops burden | You own | Microsoft managed |

---
## 14. Common Problems

| Issue | Cause | Resolution |
|-------|-------|------------|
| 403 on negotiation | Missing role assignment propagation | Wait 1–2 mins or re-provision with roles |
| CloudEvents not firing locally | Hub event handler still points to App Service | Update hub handler to tunnel URL |
| Connection drops in self-host | Browser reload or dev tooling restart | Expected – ephemeral server |
| Blob writes fail silently | Missing storage connection / MI | Check logs; ensure MI has Blob Data Contributor |

---
## 15. Reference Links

- Azure Web PubSub: https://learn.microsoft.com/azure/azure-web-pubsub/
- Azure Developer CLI: https://learn.microsoft.com/azure/developer/azure-developer-cli/

---
*End of advanced guide.*
