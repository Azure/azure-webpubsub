# Package releases

All four packages build automatically on pushes to `main`.
To build a different branch, select **Run pipeline** and choose that branch.
Emulator previews publish to MyGet automatically. Other releases start only
when you choose them; builds finish without waiting for release approvals.

## Publish packages

1. Open the completed build containing the package you want to release.
2. Select its **Release** stage below and choose **Run stage**.
3. Review the package version, source branch/commit, and artifacts. Choose
   **Resume** to continue or **Reject** to stop that package's release.

You can approve your own selection. npm publication also requires the separate
publication approval shown in the pipeline.

| Manual stage | Package | Destination |
| --- | --- | --- |
| Release emulator | `Microsoft.Azure.WebPubSub.Emulator` | Downloadable NuGet package |
| Release chat client | `@azure/web-pubsub-chat-client` | npm |
| Release Socket.IO | `@azure/web-pubsub-socket.io` | npm |
| Release tunnel | `@azure/web-pubsub-tunnel-tool` | npm |

Leave other packages unstarted. Each package can be approved independently.
Selection approvals expire after 24 hours without a response. Reject a package
to stop its release; cancel the whole run only to stop all packages.

Use `drop_emulator/release` from a successful **Build emulator** run for Azure SDK
**net - partner-release**, which signs and publishes the package to NuGet.org.
The optional **Release emulator** stage also provides it as `drop_emulator_nuget`.

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
