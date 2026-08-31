# awps-tunnel client

The React dashboard served by [`awps-tunnel`](../server). It shows live tunnel
traffic, lets you replay requests against your local upstream, and exposes an API
playground generated from the Web PubSub REST swagger in `public/api/`.

This app is built with [Vite](https://vite.dev/). It is not published on its own:
`../server` runs `npm run build:npm` here and copies `build/` into its own
`dist/client/`, which the tunnel then serves as static files.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Dev server on port 44477 with the mock data source. |
| `npm run start:manual` | Dev server using the manual data source. |
| `npm run build` | Production build with the mock data source (alias of `build:mock`). |
| `npm run build:npm` | Production build used by the published `awps-tunnel` package. |
| `npm run preview` | Serve the contents of `build/` locally. |
| `npm test` | Run the [Vitest](https://vitest.dev/) suite. |
| `npm run lint` | Run ESLint over `src/`. |

## Data sources

Which backend the dashboard talks to is chosen at build time by `VITE_DATA_FETCHER`
(see `src/providers/IDataFetcher.tsx`):

- `mock` — canned data, no server required.
- `manual` — data entered by hand in the UI.
- `npm` — the real tunnel server, over Socket.IO.

`VITE_API_VERSION` selects which swagger folder under `public/api/` the API
playground loads.

Only variables prefixed with `VITE_` are inlined into the bundle. `.env` and
`.env.development` also hold build-machine settings such as `PORT` and
`AWPS_TUNNEL_SERVER_PORT`; `vite.config.ts` reads those directly.

## Dev server proxy

In development the app runs on its own port, so `/dataHub` and `/socket.io` are
proxied to the tunnel server (`AWPS_TUNNEL_SERVER_PORT`, default 8888). WebSocket
upgrades are forwarded too. See `server.proxy` in `vite.config.ts`.

## Notes

- `index.html` lives at the project root, not in `public/`, and `<base href="/">`
  must stay a real element: `src/index.jsx` reads it at runtime to derive the
  router basename.
- `build.outDir` is `build/` because `../server` copies from that path.
- Everything in `public/` is copied to the output verbatim.