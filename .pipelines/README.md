# Package release pipeline

`.pipelines/release.yml` automatically publishes emulator CI packages to MyGet
and supports manual releases of these npm packages:

- `@azure/web-pubsub-chat-client`
- `@azure/web-pubsub-socket.io`
- `@azure/web-pubsub-tunnel-tool`

## Emulator preview packages

Changes to the emulator, its protobuf definitions, or its pipeline on `main` trigger
a batched CI run. The pipeline builds and tests the solution, packs the .NET tool,
and verifies installation and startup before publishing that same package to MyGet.
Versions append `.ci.<Build.BuildId>` to the preview version in
`tools/emulator/version.props` (for example, `1.0.0-beta.1.ci.12345`); a stable
version instead gets `-ci.<Build.BuildId>`. CI does not edit the changelog or create
release tags.

For a validation-only manual run, select `build_emulator`. Manual runs, PRs, and
branches other than `main` never publish emulator packages. `publish_packages`
continues to control only npm publication; official NuGet publication is not configured.
The validated package is available in the `drop_emulator` pipeline artifact.

## Run an npm release

1. Update the package version in `package.json`.
2. Add a dated entry for that version to the package `CHANGELOG.md`.
3. Run `.pipelines/release.yml` from `main` and select the packages to release.

The pipeline skips a selected package when its changelog entry is missing. It
fails when either the npm package version or its release tag already exists,
preventing a published version from being reused.

## Release flow

For each selected package, the pipeline:

1. validates the package version and changelog;
2. builds and validates the npm tarball;
3. publishes the tarball through ESRP;
4. creates a `release/<package>/v<version>` Git tag; and
5. opens a pull request that advances `package.json` to the next beta version.

Emulator build and MyGet publication stages are defined directly in
`.pipelines/release.yml`, alongside the npm release configuration. The shared npm
release implementation is in `.pipelines/templates/stages/release-package.yml`.

## Pipeline configuration

The pipeline expects these settings in the `npm-release` Azure DevOps variable group:

- `ESRP_SERVICE_CONNECTION`
- `NPM_FEED_REGISTRY`
- `EMULATOR_MYGET_SERVICE_CONNECTION`: authorized external NuGet service connection
  containing the MyGet feed URL and publishing credentials.
- `ESRP_CLIENT_ID`
- `ESRP_TENANT_ID`
- `ESRP_KEY_VAULT_NAME`
- `ESRP_SIGN_CERT_NAME`
- `ESRP_OWNERS`
- `ESRP_APPROVERS`
- `ESRP_MAIN_PUBLISHER`

Their values and credentials are intentionally kept outside this public
repository.
