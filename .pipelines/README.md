# Package releases

`.pipelines/release.yml` builds all four packages on pushes to `main`.
To build a different branch, select **Run pipeline** and choose that branch.
No package-selection parameters are needed.
CI runs are not batched: a run waiting for package approvals does not delay
builds or MyGet previews for newer commits. That run stays pending until its
approvals are resolved or time out.

## Publish packages

After each package builds, its **Approve** stage waits for manual validation,
including on CI runs and manual builds of feature branches. Open the pending
validation, review the package version, source branch/commit, and artifacts,
then choose **Resume** to release that package or **Reject** to skip it.

| Approval | Package | Destination |
| --- | --- | --- |
| Approve emulator | `Microsoft.Azure.WebPubSub.Emulator` | NuGet artifact (placeholder) |
| Approve chat client | `@azure/web-pubsub-chat-client` | npm |
| Approve Socket.IO | `@azure/web-pubsub-socket.io` | npm |
| Approve tunnel | `@azure/web-pubsub-tunnel-tool` | npm |

Approvals are independent: a pending, rejected, or failed package does not block
the others. Unanswered approvals reject after 24 hours. Rejection marks that
approval as failed and skips its release chain; do not cancel the whole run
unless you want to stop all packages.

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
