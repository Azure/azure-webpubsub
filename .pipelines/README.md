# Package release pipeline

`.pipelines/release.yml` automatically builds, tests, and packs affected packages
on `main`, without package-selection parameters. Runs are not batched: a pending
npm approval does not hold up automatic work in later runs. Manual runs are also
eligible on `release/*`. The exact branch
`vicancy/vicancy-fix-emulator-publish-runtime` permits **manual** build/MyGet tests,
never public npm publication or automatic test-branch publishing.

## Affected packages and versions

`Get-ReleasePackages.mjs` compares the checkout with the latest qualifying build
among the previous 25 builds of this definition and source branch. Its
`release_check`, affected builds, and MyGet stage must have completed successfully;
unaffected automatic stages may be skipped. Current/later build IDs do not consume
the 25-prior-build window. Pending or rejected npm approvals do not prevent the
automatic baseline advancing. Canceled/cancelling builds are rejected, and candidate
status is refreshed after reading its timeline. Missing/nonancestor Git history or
no qualifying baseline builds all packages; REST/authentication errors fail the
check instead of silently skipping work. Checkout requires full history.

The path map covers package sources and shared inputs and matches the trigger
paths. Versions must be canonical `major.minor.patch` or `major.minor.patch-beta.N`
and agree exactly between project metadata and the first bracketed version heading
in `CHANGELOG.md`. A literal `[Unreleased]` heading is skipped, while
`## [1.0.0-beta.1] - Unreleased` is a valid versioned entry. Missing or mismatched
versions fail validation.

## Emulator: automatic MyGet and formal download

For an affected emulator, the Linux job uses `tools/emulator/global.json` (SDK
10.0.401) to build/test once at the release-note version. It signs the first-party
**intermediate `obj` DLL**, then packs both versions with `--no-build --no-restore`.
The formal `.nupkg` is signed and signature-verified. Both actual packages are
installed from a local-package-only feed and must pass the loopback health smoke.
There is no rebuild after DLL signing.

Download **`drop_emulator`** from the run's pipeline artifacts:

| Folder | Version and purpose |
| --- | --- |
| `release/` | Exact release-note/project version, signed and validated, ready for later manual NuGet publication. For example, `Microsoft.Azure.WebPubSub.Emulator.1.0.0-beta.1.nupkg`. |
| `preview/` | `<version>-preview-<Build.BuildId>`, automatically published to MyGet. For example, `Microsoft.Azure.WebPubSub.Emulator.1.0.0-beta.1-preview-182000000.nupkg`. |

**No approval is required to prepare or download the formal package. Nothing is
uploaded to NuGet.org.** No NuGet.org API key or publishing Key Vault is needed.
The separate Windows MyGet job installs SDK 8.x for injected PowerShell tasks and
uses native `1ES.PublishNuGet@1` with the existing `azure-webpubsub-dev` API-key
service connection. Its glob matches only `drop_emulator/preview/*.nupkg`.
Do not replace this with the OneBranch DotNet-based NuGetCommand wrapper.
Emulator-only runs do not wait for an npm approval or create release tags.

## Public npm releases

Affected builds produce validated tarballs for:

- `@azure/web-pubsub-chat-client` (including its custom `pack:publish` step)
- `@azure/web-pubsub-socket.io`
- `@azure/web-pubsub-tunnel-tool`

Socket.IO and tunnel builds restore the shared server-proxies and tunnel client
before building their package; the tunnel build also builds its client.

Update `package.json` and the matching versioned changelog entry together. Builds
run automatically. On `main` or `release/*`, the npm-only `manual_release` gate
appears when at least one npm package is affected and every affected npm build
succeeded. Skipped, failed, or canceled affected builds cannot pass this gate.
Queue-build users may approve; self-approval is allowed. Rejection or the 24-hour
timeout prevents publication.

After approval, each affected successful npm build follows the existing shared
`.pipelines/templates/stages/release-package.yml` flow:

1. Check npm version and GitHub tag availability (200 means already exists;
   404 means available; other responses fail the lookup).
2. Publish the tarball through ESRP.
3. Create `release/<package>/v<version>` in GitHub.
4. Open a PR updating **both** `package.json` and a new
   `## [<next>] - Unreleased` changelog heading. A beta increments its beta number;
   a stable version advances to the next patch's `-beta.1`.

There is no npm MyGet path. Emulator artifacts and MyGet publication are independent
of npm approval. Local checks do not demonstrate cloud signing or live publication.

## Pipeline configuration

Keep the existing `npm-release` variable group and Azure Artifacts restore feed:

- `ESRP_SERVICE_CONNECTION`
- `NPM_FEED_REGISTRY`
- `ESRP_CLIENT_ID`
- `ESRP_TENANT_ID`
- `ESRP_KEY_VAULT_NAME`
- `ESRP_SIGN_CERT_NAME`
- `ESRP_OWNERS`
- `ESRP_APPROVERS`
- `ESRP_MAIN_PUBLISHER`

`System.AccessToken` needs build/timeline read access for baseline detection.
Credentials remain outside the repository. Local restores must use the approved
company feeds; public package metadata availability checks are not restores.

## Local checks

Run the built-in Node helper tests with `node --test .pipelines/scripts/*.test.mjs`
and YAML/graph/condition tests with
`python -m unittest discover -s .pipelines/scripts -p test_release_pipeline.py`
(the latter requires PyYAML). These checks do not expand the remote OneBranch
template or execute Azure DevOps tasks.

For package validation, use `Build-EmulatorPackage.ps1 -Phase Build -ReleaseVersion`,
then `-Phase Pack` and `-Phase Validate` for separate formal (`-ReleaseVersion`)
and preview output directories with the same `-BuildId`. Local unsigned packages
cannot pass `-RequireSignature`; the pipeline signs and requires that check before
publishing its formal artifact. Do not rebuild between signing and packing.
