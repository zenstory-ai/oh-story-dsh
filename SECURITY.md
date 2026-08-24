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

`@oh-story/dsh` is a Cordis plugin inside a DSH process. DSH owns the model, credentials,
sandbox, tool permissions, and approvals; this plugin never reads credentials, opens a
network listener of its own, or starts a second agent runtime.

The plugin adds one HTTP surface: a Session-scoped creative file route under `/oh-story`,
mounted on DSH's existing web server. It is defended in depth:

- **Browser trust fence.** Every request passes the same Host, `Origin`, and Fetch Metadata
  checks as DSH's native `/api`. The Host fence blocks DNS rebinding; the `sec-fetch-site`
  and `Origin` checks block cross-site requests. Only loopback authorities are trusted by
  default — a non-loopback deployment must declare each authority in the plugin's
  `trustedHosts` config, and a malformed entry fails the plugin load rather than silently
  widening access.
- **Session scoping.** The working directory comes from the DSH `sessionId`, never from the
  request. Child agent sessions get no editor route.
- **Path containment.** Every path segment is checked with `lstat`, symlinks are resolved and
  re-checked for containment at each level and again on the final target, and access is
  limited to the documented novel and short-drama project directories with an allowlist of
  editable extensions.
- **Concurrency safety.** Reads return a content version; writes require it as a precondition
  and are staged through an exclusive temporary file, so a stale save is rejected instead of
  overwriting concurrent changes.

## Bundled upstream content

Oh Story's login/CDP rank scrapers and Drama Skills' standalone dashboard server are excluded
during synchronization, and the build fails if either reappears in the release bundle. The two
scan Skills ship DSH-native instructions that use only visible tools and do not bypass
captchas, paywalls, or access controls.
