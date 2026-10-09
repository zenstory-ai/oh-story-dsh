# Release process

`@oh-story/dsh` is distributed as the same prebuilt tarball through npm and
GitHub Releases. A release is created only from a `v<package-version>` tag.

## Upstream update issues

`.github/workflows/upstream-updates.yml` runs daily and opens one
`upstream-update` issue per new version of a bundled Skill set (latest GitHub
release ahead of the pinned manifest commit) or of DeepSeek Harness (an npm
dist-tag on a version the plugin does not declare). Each issue carries the sync
checklist. Close an issue to decline that version; it will not be reopened.
Run `pnpm upstream:updates` for a local dry run.

## One-time npm setup

The npm account used for the first publication must be allowed to publish the
public `@oh-story/dsh` package. Store a granular publish token as the repository
secret `NPM_TOKEN`; never commit it or put it in an issue, workflow file, or
release note.

After the first publication, configure npm Trusted Publishing for:

- repository: `zenstory-ai/oh-story-dsh`
- workflow: `release.yml`

The workflow requests an OpenID Connect identity and publishes with provenance.
Once Trusted Publishing is verified, the long-lived `NPM_TOKEN` secret can be
removed.

## Cut a release

1. Update the root and package versions, installation examples, and
   `CHANGELOG.md` for the intended release.
2. Run `pnpm verify:release` locally. For 0.1.13 and later, retain fresh packaged
   Chrome E2E evidence on both the default DSH `0.2.0-rc.2` line and the explicit
   `0.2.1-alpha.1` opt-in line; alpha support must not be announced from peer
   metadata or unit tests alone.
3. Merge the release branch through a protected Pull Request after all four
   required CI checks pass, then wait for the newest main-push CI run for that
   exact merge commit to pass all four jobs.
4. Create and push the matching `v<package-version>` tag at that verified commit.

The release workflow then:

1. repeats the complete verification suite;
2. builds and inspects a clean installable tarball;
3. checks that the tag and package version match;
4. uploads the tarball and SHA-256 checksum to a GitHub Release;
5. publishes the identical tarball to npm with provenance.

The deterministic public manifest records the source commit, tool versions,
tarball size, SHA-256, and npm-compatible SHA-512 integrity. Separate CI and
promotion proofs bind the CI run/attempt and release run/attempt to the exact
manifest and artifact name without making public release bytes change on a
retry. GitHub and npm publishers download the exact artifact ID produced by
that run. The producing job also passes independent SHA-256 values for the
manifest, promotion proof, and CI proof as job outputs; every consumer compares
those values before a write credential is exposed. This prevents a coordinated
replacement of the tarball and all self-contained proof files.

GitHub assets are append-only under workflow control: an absent asset is
uploaded, an existing byte-identical asset is accepted, and an existing asset
with different bytes fails the run. The workflow never uses `--clobber` and it
does not delete a partial release. npm follows the same rule: an absent version
is published, the same version and `dist.integrity` is accepted on a retry, and
a different integrity fails. HTTP 401/403/429/5xx and network failures are
errors, not evidence that a release or version is absent.

This is workflow-enforced append-only behavior, not a claim that GitHub makes a
tag or release immutable against repository administrators. Immediately before
either GitHub or npm can mutate public state, the shared source gate re-resolves
the tag, confirms the canonical public repository and protected default `main`,
proves source ancestry, and rechecks the exact CI workflow. It refetches the
selected run after reading its latest-attempt jobs and rejects an attempt,
check-suite, source, status, conclusion, or GitHub Actions application change.

After both publishers finish, the workflow anonymously downloads the GitHub
tarball, waits a bounded time for npm registry propagation, compares
`dist.integrity`, and installs the exact public npm version with lifecycle
scripts disabled. A timeout or channel mismatch leaves the workflow red.

## Dry-run and failure outcomes

Manual dispatch is accepted only on `main`. It performs the source/CI checks,
the complete deterministic release suite, and package/manifest upload, but the
GitHub and npm publisher jobs do not run. Pull requests never receive release
write or OIDC permissions.

Tag publication requires all of the following before dependency installation
or package construction: a stable `vX.Y.Z` tag; matching root and plugin
versions; a dated changelog heading; the tag commit on `main`; and the newest
GitHub Actions `CI` main-push run for that exact SHA, latest attempt, expected
workflow path/application, and all four named jobs successful.

If GitHub succeeds and npm fails (or the reverse), do not overwrite or delete
the successful channel. Fix the credential or transient failure and rerun the
same workflow: the successful channel must verify as byte-identical and skip,
while the incomplete channel resumes. A moved tag, changed asset, changed npm
integrity, missing required CI job, or older successful attempt is a hard
failure and needs investigation rather than a retry that mutates public bytes.

## Verify the public installation

### One-time 0.1.13 npm recovery

The original [0.1.13 tag run](https://github.com/zenstory-ai/oh-story-dsh/actions/runs/37139595180)
passed verification and published GitHub assets, but npm interpreted its bare
relative tarball path as a GitHub package shorthand. The generic publisher now
passes an absolute local path, with a regression test. Do not move the tag,
replace public assets, or rerun that old tag workflow: its source still has the
relative-path bug.

`recover-v0.1.13.yml` is a narrowly bound manual recovery, not a new generic
publishing entry point. Dispatch it on protected `main` only after that exact
recovery commit passes all four main CI jobs. It reuses original artifact ID
`11279574541` from run `37139595180`, attempt `1`, and independently recorded
manifest/promotion/CI-proof digests. Before exposing npm credentials it proves
both CI sources, re-resolves the original tag, and anonymously compares the
tarball, manifest and checksums with the existing GitHub assets. It does not
rebuild or write GitHub state. It invokes the original tag's publisher with an
absolute directory, retains npm integrity idempotency, and finishes with
anonymous public-channel and isolated-install verification.

The recovery's npm provenance identifies the recovery workflow/main invocation,
not the original tag-build invocation. The unchanged package source remains
bound to `f207fa92863bd3626b8ee6bd7b5ad30762ef205c` by the original manifest,
producer proofs and protected-main CI. The original artifact has a 14-day
retention window; this recovery requires it to remain available. The normal
`release.yml` manual dispatch remains a nonpublishing dry-run.

[Recovery attempt 2](https://github.com/zenstory-ai/oh-story-dsh/actions/runs/37141721746/attempts/2)
completed on 2026-10-03 with npm `skip-exact` and both public channels reporting
`SUCCESS`, including isolated anonymous installation. Attempt 1 had already
submitted the original package, but npm was still processing its public metadata.
The original verifier accepted a 404 as a null result instead of waiting; that
contract now has a regression fix on main. The old tag source is unchanged, so
any repeat of this one-time workflow must first confirm the public exact-version
metadata and manifest integrity rather than resubmit while processing.

Do not announce a release until the registry reports the exact version:

```bash
VERSION=0.1.14
npm view "@oh-story/dsh@$VERSION" version dist.integrity
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.0-rc.2 dsh plugin --profile web add "@oh-story/dsh@$VERSION"
```

The default public smoke uses npm `latest` (`0.2.0-rc.2`). After it passes,
repeat the isolated install/start/browser smoke with
`@deepseek-ai/dsh@0.2.1-alpha.1`; never mix host versions within one profile or
describe the alpha line as supported before its Chrome run passes.

The GitHub Release tarball remains a registry-independent installation path:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.0-rc.2 dsh plugin --profile web add "https://github.com/zenstory-ai/oh-story-dsh/releases/download/v$VERSION/oh-story-dsh-$VERSION.tgz"
```
