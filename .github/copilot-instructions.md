# Copilot instructions for `azure-webpubsub`

Repository-wide guidance for AI agents. Everything here has been verified against this
repository; if you find a statement is no longer true, fix it in the same pull request
that proves it wrong.

## Contributing workflow

- **Push topic branches to your own fork, then open the pull request from the fork.**
  Do not push working branches to `Azure/azure-webpubsub`. Keep the upstream remote for
  fetching and for the pull request target only.
- `main` is protected. Merges are **squash-only** and require **one approving review**.
- The only **required** status checks are `license/cla` and `GitGuardian Security Checks`.
  Every other check is advisory and does not block merge — but do not merge past a red
  check until you understand it. Say plainly in the pull request why it is unrelated.
- Branch protection is not `strict`, so a branch does not need to be up to date with
  `main` to merge. Stale bases are still a common source of misleading CI (see below).

### Files under `.github/workflows/`

GitHub rejects any push touching `.github/workflows/**` unless the credential carries the
`workflow` OAuth scope, and the rejection fails the **entire** push, not just that file.
Agent sessions usually do not have that scope. When a change is needed there:

1. Make the edit and commit it locally.
2. Ask a human to push the branch, or point them at the GitHub web editor.
3. Keep workflow-only changes in their own commit so they are easy to hand off.

This restriction is enforced per *credential*, not per repository, so pushing to a fork
does not avoid it. It also reaches further than it first appears: pushing **any** branch
whose history contains a workflow commit the target does not already have will be
rejected, even when your own commits touch nothing under `.github/`. A fork that has
fallen behind an upstream `main` containing workflow changes therefore cannot receive any
branch at all — and `POST /repos/{owner}/{repo}/merge-upstream` is gated by the same
scope, so the fork cannot be resynced without the scope either. Until a human syncs the
fork, push the branch to the upstream repository instead.

## Package feeds

All dependency installation must go through the approved proxy. Public registries are
reachable from CI but **blocked from developer machines**, so a plain install that works
in CI may fail locally.

| Ecosystem | Feed |
| --- | --- |
| npm / yarn / pnpm | `https://packagefeedproxy.microsoft.io/npm/` |
| pip / uv / Poetry | `https://packagefeedproxy.microsoft.io/pypi/simple` |
| NuGet / dotnet | `https://packagefeedproxy.microsoft.io/nuget/v3/index.json` |

**The proxy lags public advisories.** Before choosing a target version for a security
bump, confirm the feed actually carries it:

```sh
npm view <package> versions --json
```

Dependabot resolves against the public registry and will happily propose a version the
proxy has never mirrored. Prefer the advisory's **first patched version**, which is both
sufficient to close the alert and far more likely to be available.

To reproduce a CI install locally, copy the project to a scratch directory and rewrite
`registry.npmjs.org` to the proxy **in the copy only**. Never commit proxy URLs into a
lockfile; `resolved` URLs in committed lockfiles should stay canonical.

## Read which CI jobs actually ran

`build.yml` starts with a `Detect affected components` job, and every build job is gated
on a path filter. **A job that did not match its filter is reported as skipped, and the
pull request still looks green.** Before trusting a green run:

- Cross-check the files you changed against which checks *ran* versus *were skipped*.
- Known gap: the `csharp` job's filter is `samples/csharp/**` only, so that job compiles no
  C# outside `samples/csharp/`. Much of the rest is picked up by dedicated workflows that
  do run on pull requests — `tools/emulator/**` by `emulator-tests.yml`,
  `sdk/clients/protobuf-client/csharp/**` by `protobuf-client-tests.yml`, and
  `tests/integration-tests/csharp/**` by `integration-tests-csharp.yml`. Check for one of
  those before assuming a directory is uncovered. What is genuinely left over is
  `sdk/webpubsub-socketio-extension/examples/*/extensions.csproj`: the only other workflow
  matching `sdk/**` is `socketio_e2e.yml`, which triggers on `push` alone and builds
  nothing but the Node packages. Build those locally before merging.
- Read the test source before trusting a green test job. For example,
  `samples/ai/chat-demo/tests/test_chat_model_client.py` monkeypatches the `OpenAI` class
  away entirely, so it passes regardless of which `openai` version is installed.

For Dependabot pull requests specifically, also check the base commit. A batch of
Dependabot pull requests is often cut from the same stale base, which makes every result
in the batch — green and red alike — describe old code. Comment `@dependabot rebase` and
re-read the run before drawing a conclusion.

## Editing lockfiles

- The repository has **no `.gitattributes`** and developers commonly run with
  `core.autocrlf=true`. Any script that rewrites a lockfile must match `\r?\n`, not `\n`,
  or it will silently match nothing in `yarn.lock`.
- `package-lock.json` at `lockfileVersion: 2` stores **every entry twice** — once under
  `packages` (`"node_modules/foo"`) and once under the legacy `dependencies` (`"foo"`).
  Both copies must be updated. `lockfileVersion: 3` has only `packages`.
- Patch lockfile text in place. Round-tripping through `JSON.parse`/`JSON.stringify`
  reformats the whole file and buries the real change in noise.
- `integrity` hashes are content-addressed and therefore **mirror-independent**: a hash
  computed from a tarball fetched via the proxy is valid alongside a canonical
  `registry.npmjs.org` URL.
- Always verify with a real install (`yarn install --frozen-lockfile` or `npm ci`), not by
  inspection.

## Things CI does not cover

- `website/` is built only by `deploy-demo-website.yml`, not by pull request CI. Run
  `yarn build` there yourself when you change its dependencies.
- C# outside `samples/csharp/`, `tools/emulator/`, `sdk/clients/protobuf-client/csharp/`
  and `tests/integration-tests/csharp/` — in practice
  `sdk/webpubsub-socketio-extension/examples/*/extensions.csproj`. See the path-filter
  note above; do not generalise this to all of `sdk/**`, which does contain covered
  projects.
