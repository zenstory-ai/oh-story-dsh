# Release process

`@oh-story/dsh` is distributed as the same prebuilt tarball through npm and
GitHub Releases. A release is created only from a `v<package-version>` tag.

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
2. Run `pnpm verify:release` locally.
3. Commit and push `main`.
4. Create and push the matching `v<package-version>` tag.

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

Do not announce a release until the registry reports the exact version:

```bash
VERSION=0.1.12
npm view "@oh-story/dsh@$VERSION" version dist.integrity
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.0-rc.1 dsh plugin --profile web add "@oh-story/dsh@$VERSION"
```

The GitHub Release tarball remains a registry-independent installation path:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.0-rc.1 dsh plugin --profile web add "https://github.com/zenstory-ai/oh-story-dsh/releases/download/v$VERSION/oh-story-dsh-$VERSION.tgz"
```
