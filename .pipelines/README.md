# Package releases

All four packages build automatically on pushes to `main`.
To build a different branch, select **Run pipeline** and choose that branch.
Emulator previews publish to MyGet automatically. Other releases start only
when you choose them; builds finish without waiting for release selections.

## Publish packages

1. Open the completed build containing the package you want to release.
2. Review the package version, source branch/commit, and artifacts.
3. Select its **Release** stage below and choose **Run stage** to authorize that release.

npm publication still requires the separate publication approval shown in the pipeline.

| Manual stage | Package | Destination |
| --- | --- | --- |
| Release chat client | `@azure/web-pubsub-chat-client` | npm |
| Release Socket.IO | `@azure/web-pubsub-socket.io` | npm |
| Release tunnel | `@azure/web-pubsub-tunnel-tool` | npm |

Leave other releases unstarted. Each release can be selected independently.

For Docker, review `drop_emulator_container/container-release.json` and start
**Release Docker version** after container validation succeeds. To also update
`latest`, start **Release Docker latest** after version publication succeeds.
Both use the same tested image archive from this build.

Use `drop_emulator/release` from a successful **Build emulator** run for Azure SDK
**net - partner-release**, which signs and publishes the package to NuGet.org.

## Updating versions

Update the package's version file and `CHANGELOG.md` together before building.

| Package | Version file |
| --- | --- |
| Emulator | `tools/emulator/version.props` |
| Chat client | `sdk/webpubsub-chat-client/package.json` |
| Socket.IO | `sdk/webpubsub-socketio-extension/package.json` |
| Tunnel | `tools/awps-tunnel/server/package.json` |

Emulator version updates are manual. After npm publication, the pipeline creates
release tags and next-beta version/changelog PRs.
