# npm package release pipeline

The manual release pipeline publishes one or more npm packages from this
repository:

- `@azure/web-pubsub-chat-client`
- `@azure/web-pubsub-socket.io`
- `@azure/web-pubsub-tunnel-tool`

## Run a release

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

Package-specific build commands are declared in `.pipelines/release.yml`.
The shared release implementation is in
`.pipelines/templates/stages/release-package.yml`.

## Pipeline configuration

The `npm-release` Azure DevOps variable group provides the release settings:

- `ESRP_SERVICE_CONNECTION`
- `NPM_FEED_REGISTRY`
- `ESRP_CLIENT_ID`
- `ESRP_TENANT_ID`
- `ESRP_KEY_VAULT_NAME`
- `ESRP_SIGN_CERT_NAME`
- `ESRP_OWNERS`
- `ESRP_APPROVERS`
- `ESRP_MAIN_PUBLISHER`

Their values and credentials are intentionally kept outside this public
repository.
