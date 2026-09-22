# Package releases

`.pipelines/release.yml` builds affected packages on pushes to `main`.
For a manual build, select **Run pipeline** and choose `main` or `release/*`.

## Emulator

- MyGet preview: published automatically as `<version>-preview-<BuildId>`.
- Signed release package: download `drop_emulator/release/*.nupkg` from the build's
  artifacts. NuGet.org publication is not enabled.

## npm

Open a completed build → **Release npm packages (manual)** → **Run stage**.
Review the package versions and approve publication.

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
