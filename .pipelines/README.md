# Package releases

`.pipelines/release.yml` builds all four packages on pushes to `main`.
To build a different branch, select **Run pipeline** and choose that branch.
No package-selection parameters are needed.
The four package builds can run in parallel. Each checks its own version and
changelog before building, without a separate version-check stage. A version
error fails that package's build and prevents its release, while the other
packages can continue.
CI runs are batched. Builds and MyGet previews run automatically; package
releases start only on demand, so ordinary CI runs finish without waiting for
release approvals.

## Publish packages

Open the completed build you want to release, select the package's **Release**
stage below, and choose **Run stage**. This starts its manual validation.
Review the package version, source branch/commit, and artifacts, then choose
**Resume** to release that package or **Reject** to stop it. The release reuses
that build's artifacts. CI builds and manual feature-branch builds both support
this flow. After approval, the next stage requires a successful package build,
including its version validation, before it can check or prepare the release.

| Manual stage | Package | Destination |
| --- | --- | --- |
| Release emulator | `Microsoft.Azure.WebPubSub.Emulator` | NuGet artifact (placeholder) |
| Release chat client | `@azure/web-pubsub-chat-client` | npm |
| Release Socket.IO | `@azure/web-pubsub-socket.io` | npm |
| Release tunnel | `@azure/web-pubsub-tunnel-tool` | npm |

Leave other release stages unstarted; no rejection is needed for those packages.
Once started, a release waits for approval and rejects after 24 hours without a
response. Approvals are independent: a pending, rejected, or failed package does
not block the other packages' release chains. Rejection marks that approval as
failed and skips its release chain; cancel the whole run only to stop all packages.

The emulator preview still publishes automatically to MyGet as
`<version>-preview-<BuildId>`. Both preview and signed release packages remain
available in `drop_emulator`. Approving emulator prepares `drop_emulator_nuget`
with the signed release `.nupkg` from this build. This is a placeholder for the
future NuGet.org publish step; it does not publish a package or require credentials.

## Updating versions

Update the version file and the versioned `CHANGELOG.md` heading together,
for example `## [1.0.0-beta.2] - Unreleased`.

| Package | Version file | Changelog |
| --- | --- | --- |
| Emulator | `tools/emulator/version.props` (`VersionPrefix` and `VersionSuffix`) | `tools/emulator/CHANGELOG.md` |
| Chat client | `sdk/webpubsub-chat-client/package.json` | `sdk/webpubsub-chat-client/CHANGELOG.md` |
| Socket.IO | `sdk/webpubsub-socketio-extension/package.json` | `sdk/webpubsub-socketio-extension/CHANGELOG.md` |
| Tunnel | `tools/awps-tunnel/server/package.json` | `tools/awps-tunnel/server/CHANGELOG.md` |

Emulator version updates are manual. After npm publication, the pipeline creates
release tags and next-beta version/changelog PRs.
