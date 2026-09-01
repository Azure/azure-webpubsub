# Admin UI for Azure Socket.IO

This project is a tailor-made version of [Socket.IO Admin UI](https://github.com/socketio/socket.io-admin-ui),
adapted to connect to Azure Web PubSub for Socket.IO.

## Relationship to upstream

Most of this directory is vendored from upstream and is meant to stay
byte-identical to it. Only a small, declared set of files carries Azure-specific
changes. Both the upstream baseline and the declared changes live in
[`upstream.json`](./upstream.json).

`yarn verify:upstream` checks that the declaration is still accurate. It runs
automatically before every build, and it is fully offline: `upstream.json`
records upstream's Git blob hashes, so nothing needs to be fetched to verify
them.

If the check fails, either revert the file so it matches upstream again, or add
it to the `divergence` section of `upstream.json` with a short reason. Keeping
that list short and honest is what makes the next upstream sync cheap.

### Syncing with a newer upstream release

```
yarn verify:upstream                                      # confirm a clean starting point
node scripts/update-upstream-manifest.js --commit <sha>   # move the pin (clones upstream)
yarn verify:upstream                                      # see exactly what upstream changed
```

The second command is the only part of this tooling that needs network access,
and it is only ever run by hand. Work through whatever the last command reports,
re-applying the Azure changes on top of the new upstream files, then record the
result in `CHANGELOG.md`.

Upstream is MIT licensed; see [`ThirdPartyNotices.txt`](./ThirdPartyNotices.txt).

## Project setup

This project builds with yarn. Using npm here would produce a `package-lock.json`
alongside the checked-in `yarn.lock` and resolve a different dependency tree.

```
yarn install
```

### Compiles and hot-reloads for development
```
yarn dev
```

### Compiles and minifies for production
```
yarn build
```

### Previews the production build
```
yarn preview
```

### Lints and fixes files
```
yarn lint
```

### Verifies this fork against upstream
```
yarn verify:upstream
```

### Customize configuration
See [Vite Configuration Reference](https://vite.dev/config/).
