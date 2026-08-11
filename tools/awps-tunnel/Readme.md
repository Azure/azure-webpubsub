# Azure Web PubSub local tunnel tool

Azure Web PubSub local tunnel pairs a CLI with a lightweight web view so you can connect your Azure Web PubSub resource to a local HTTP/WebSocket server without exposing it publicly. Use it to inspect traffic end-to-end while you iterate locally.

## What is in this folder
- `server/`: CLI package published as `@azure/web-pubsub-tunnel-tool` (command `awps-tunnel`) plus docs and bundled assets.
- `client/`: React web view hosted by the CLI to visualize connections, inspect requests/responses, and toggle the built-in echo upstream.
- `docker/`: Sample Dockerfile for running the CLI in a container.
- `server/samples/upstream`: Quick Node.js upstream sample used by the docs.

## Prerequisites
- Node.js 16+
- An Azure Web PubSub resource
- Authentication: either set `WebPubSubConnectionString` to your service connection string, or use an Azure identity with `Web PubSub Service Owner` and run `az login`
- Optional: Docker for containerized runs

## Install the CLI
```bash
npm install -g @azure/web-pubsub-tunnel-tool
```

## Quick start
1. In the Web PubSub portal, configure the event handler URL for your hub to start with `tunnel:///`.
2. Start the tunnel (replace with your endpoint and hub):
   ```bash
   awps-tunnel run --hub <hub> --endpoint https://<resource-name>.webpubsub.azure.com
   ```
   Add `--upstream http://localhost:3000` to forward to your own server, or enable the **Built-in Echo Server** later from the web view. Use `awps-tunnel bind --hub <hub> --endpoint ...` once if you want to save the settings.
3. Open the printed web link to check status. The link contains a one-time access token (`#access_token=...`) that the dashboard needs to connect, so open the exact URL printed in the terminal and keep it private — anyone who obtains it can drive the tunnel's messaging hub. Use the **Client** tab to start a test WebSocket connection and the **Tunnel** tab to inspect requests/responses flowing through the tunnel.
4. Need a quick upstream? Run the sample:
   ```bash
   cd server/samples/upstream
   npm install
   node server.js
   ```

## Developing from this repo
- First-time setup: from `tools/awps-tunnel`, run `npm run bootstrap` to install deps in both `server/` and `client/`.
- CLI/server: `cd server && npm run build` regenerates the CLI and bundles the client assets.
- Client web view only: `cd client && npm install && npm start` to run against mock data, or `npm run build:npm` to refresh the assets consumed by the CLI.
- Root helpers: from `tools/awps-tunnel`, `npm run server` or `npm run client` simply forward into the folders above.

## Docker
Build and run the published CLI in a container:
```bash
docker build -f tools/awps-tunnel/docker/Dockerfile -t awps-tunnel .
docker run --rm -p 127.0.0.1:4000:4000 -e WebPubSubConnectionString="<connection-string>" awps-tunnel run --hub <hub> --webviewHost 0.0.0.0 -u http://host.docker.internal:3000
```
The container prints an `Open webview at: http://localhost:4000/#access_token=...` link. Open that exact link (the access token is required to connect).

When running detached (`docker run -d`), or if you want a stable bookmark, pin the token with `AWPS_TUNNEL_DASHBOARD_TOKEN` instead of using the random per-run token:
```bash
docker run --rm -p 127.0.0.1:4000:4000 -e WebPubSubConnectionString="<connection-string>" -e AWPS_TUNNEL_DASHBOARD_TOKEN="<your-token>" awps-tunnel run --hub <hub> --webviewHost 0.0.0.0 -u http://host.docker.internal:3000
```
Then browse to `http://localhost:4000/#access_token=<your-token>`.

> The dashboard is protected by a per-process access token, but binding it to a non-loopback interface (`--webviewHost 0.0.0.0`) still exposes the privileged endpoint to your network. Publish the port to loopback only (`-p 127.0.0.1:4000:4000`) unless you specifically need remote access, and keep the `#access_token=...` URL (and any pinned token) private.

## More info
- Detailed CLI usage and screenshots: `server/README.md`
- Release notes: `server/CHANGELOG.md`
