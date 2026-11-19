# Security Policy

## Supported versions

Security fixes land on the latest published `@oh-story/dsh` release. Report issues against `main`.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private
[Report a vulnerability](https://github.com/zenstory-ai/oh-story-dsh/security/advisories/new)
form instead. Include the DSH version, the plugin version, and a reproduction. We aim to
acknowledge within 72 hours.

Vulnerabilities in DeepSeek Harness itself belong to the
[upstream project](https://github.com/deepseek-ai/deepseek-harness).

## Trust boundary

`@oh-story/dsh` runs as a Cordis plugin inside a DSH process. DSH owns models, credentials, sandbox policy, tool permissions, and approvals. The plugin opens no network listener of its own and starts no second agent runtime. Host preflight checks only whether media environment variables are set and returns readiness status, never secret values. Media adapters run through the current DSH execution environment.

The plugin mounts `/oh-story` routes on DSH's existing web server for creative files, read-only media and game previews, plugin config state, and runtime preflight:

- **Browser trust.** Workspace, file, media, config, and preflight requests enforce Host, `Origin`, and Fetch Metadata checks matching DSH's native API boundary. Only loopback authorities are trusted by default; non-loopback deployments must list each authority in `trustedHosts`, and malformed entries fail plugin loading. Generated-game previews additionally allow isolated document navigation under a trusted Host and apply a restrictive CSP to preview responses.
- **Session scoping.** Workspace paths come from the DSH Session, never from a request-supplied working directory. Child-Agent Sessions receive no editor route.
- **Path containment.** Creative file access uses an allowlist of directories and extensions covering the documented novel, short-drama, `game-adaptations`, and `video-recaps` roots. The current Agent's DSH `FileSystem` resolves paths and verifies containment inside its workspace. Workspace game-preview assets are confined to that game's `build/app` directory; media previews are extension-allowlisted and read-only.
- **Concurrent writes.** Reads return the DSH filesystem's opaque version. Writes pass that version to atomic `replaceIfVersion` under the current Session's sandbox policy, rejecting stale saves instead of overwriting concurrent changes.

## Bundled upstream content

Oh Story's login/CDP rank scrapers and the standalone dashboard servers from Drama Skills and
`video-recap-skills` are excluded during synchronization, and the build fails if any of them
reappear in the release bundle. The two scan Skills ship DSH-native instructions that use only
visible tools and do not bypass captchas, paywalls, or access controls.
