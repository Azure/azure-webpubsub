# Package releases

`.pipelines/release.yml` builds and tests affected packages when changes reach
`main`. To run it manually, select **Run pipeline** and choose `main` or a
`release/*` branch.

## Emulator

Preview packages publish automatically to MyGet as `<version>-preview-<BuildId>`.

To get the package prepared for NuGet, open the completed build's artifacts,
select **drop_emulator**, and download the `.nupkg` under **release/**. It is signed
and uses the exact release version, such as `1.0.0-beta.1`. Preparing this package
requires no approval; the pipeline does not upload it to NuGet.org.

## npm

The pipeline builds these packages:

- `@azure/web-pubsub-chat-client`
- `@azure/web-pubsub-socket.io`
- `@azure/web-pubsub-tunnel-tool`

Automatic builds finish without waiting for npm approval. To publish, open a
completed build on `main` or `release/*` and select **Run stage** for
**Release npm packages (manual)**. It first checks that the npm builds succeeded
and their artifacts are available. Review the versions and tarballs, then approve
publication. This reuses that build's packages without rebuilding them.
Rejecting the approval or letting it expire after 24 hours prevents publication.

After publication, the pipeline creates a release tag and opens a PR preparing
the package version and changelog for the next beta.

## Updating versions

Keep each package's declared version and its versioned `CHANGELOG.md` heading in
sync, for example `## [1.0.0-beta.2] - Unreleased`.

| Package | Version file | Changelog |
| --- | --- | --- |
| Emulator | `tools/emulator/version.props` (`VersionPrefix` and `VersionSuffix`) | `tools/emulator/CHANGELOG.md` |
| Chat client | `sdk/webpubsub-chat-client/package.json` | `sdk/webpubsub-chat-client/CHANGELOG.md` |
| Socket.IO | `sdk/webpubsub-socketio-extension/package.json` | `sdk/webpubsub-socketio-extension/CHANGELOG.md` |
| Tunnel | `tools/awps-tunnel/server/package.json` | `tools/awps-tunnel/server/CHANGELOG.md` |

Emulator versions are currently updated manually. Publishing MyGet previews or
preparing a NuGet artifact does not advance the release version.
