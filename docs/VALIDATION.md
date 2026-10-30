# Validation

Candidate: `@oh-story/dsh` 0.1.21 on DeepSeek Harness `0.2.1-rc.5`, with the earlier `0.2.0-rc.2` and the `0.2.2-alpha.2` trial line covered. Local aggregate acceptance passed on 2026-10-30.

## 0.1.21 release evidence

0.1.21 moves the default host to DSH `0.2.1-rc.5` (the npm `latest` and `next`) and syncs Oh Story 0.9.2 and Drama Skills 0.10.0. NovelToGame 0.6.1 and video-recap 0.6.2 keep their pins.

### Local evidence

- Oh Story 0.9.2 (`f08a66ddd599`), 14 Skills, 7 Roles and `agents_version` 38; Drama Skills 0.10.0 (`d22979578d35`), 11 Skills with 6 passing selftests. Both were synced from clean checkouts of the release tags. The drama demo fixture files are unchanged; only their provenance commit moved.
- The new `story-publish` Skill is listed and routed by the DSH `story` entry, and its DSH bridge forbids operating a platform author backend. `story-cover` offers the prompt-only mode when no image capability is visible. Unit tests assert the 14-Skill catalog, the route and both bridge sentences.
- Between DSH `0.2.1-rc.4` and `0.2.1-rc.5`, 19 of the plugin's 20 DSH peer packages are byte-identical; `dsh-client-ui-chat` only adds `rawText` to the reasoning-body Slot, which the plugin does not use.
- On 2026-10-30, `pnpm verify:release` passed in a clean clone of the candidate (`84294ff`) with the upstream release checkouts: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 198 unit/contract tests, and the build. Packaged Chrome on DSH `0.2.1-rc.5`, `0.2.0-rc.2` and `0.2.2-alpha.2` returned `"ok": true`.

### Release gates

- **Local aggregate acceptance:** passed 2026-10-30.
- **Paid provider:** passed 2026-10-30. `pnpm test:dsh:real` ran on DSH `0.2.1-rc.5` with `deepseek-official/deepseek-flash`: 2 Role calls, both required Roles successful and non-empty, 94 and 68 durable events, project digest unchanged. The operator-authorized credential was read from a 0600 temporary file, deleted after the run, and never appeared in logs; the shared account balance dropped 0.15 CNY. The run covers the review chain, not `story-publish`.
- **New-user audit:** not rerun.

## 0.1.20 release evidence

0.1.20 widens the declared DSH range to the 0.2.2 prerelease line. The default host, development host and upstream Skill pins are unchanged from 0.1.19.

### Local evidence

- `engines.dsh` and the DSH peers add `>=0.2.2-alpha.2 <0.2.3-0`, and the Cordis and Schemastery peers add `^4.0.6-alpha.1` / `^3.18.6-alpha.1`. With the `semver` package, `0.2.0-rc.2`, `0.2.1-rc.2`, `0.2.1-rc.4`, `0.2.2-alpha.2` and `0.2.2-rc.1` satisfy the new range, and `0.2.3-alpha.1` does not.
- Compared with `0.2.1-rc.4`, 17 of the plugin's 20 DSH peer packages change their type declarations. A scratch copy with development dependencies and overrides on `0.2.2-alpha.2`, Cordis `4.0.6-alpha.1`, Schemastery `3.18.6-alpha.1` and the matching Cordis plugin alphas passed typecheck, 198 unit tests, 7 real-Cordis contract tests, the DSH boundary and the build.
- On 2026-10-29, `pnpm verify:release` passed in a clean clone of the candidate (`585f401`) with the three upstream release checkouts: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 198 unit/contract tests, and the build. Packaged Chrome on DSH `0.2.1-rc.4`, `0.2.0-rc.2` and `0.2.2-alpha.2` returned `"ok": true`.

### Release gates

- **Local aggregate acceptance:** passed 2026-10-29.
- **Paid provider:** not rerun. The Skills, bridge and default host are unchanged since the 0.1.19 run on `0.2.1-rc.4` below; the `0.2.2-alpha.2` line has deterministic packaged evidence only.
- **New-user audit:** not rerun.

## 0.1.19 release evidence

0.1.19 moves the default host to DSH `0.2.1-rc.4` and syncs Oh Story 0.9.1, Drama Skills 0.9.2 and NovelToGame 0.6.1. video-recap 0.6.2 keeps its pin.

### Local evidence

- Oh Story 0.9.1 (`70d1cf426f8c`), 13 Skills, 7 Roles and `agents_version` 37; Drama Skills 0.9.2 (`fdb7b7c58017`), 11 Skills; NovelToGame 0.6.1 (`c3075f35cc14`), 7 Skills. All three were synced from clean clones of the release tags with the existing exclusion rules.
- Drama 0.9.1 no longer bundles the legacy JSON checkers, so only the six Skills that ship scripts carry a selftest. Drama parity now requires a passing selftest for every Skill with scripts, and all six pass. The drama demo fixture was re-copied from the pinned `examples/creator-first/EP001` and passes the bundled `creator_markdown_check.py`.
- Between DSH `0.2.1-rc.2` and `0.2.1-rc.4`, 18 of the plugin's 20 DSH peer packages are byte-identical. `dsh-api-session-controller` changes one doc comment. `dsh-client-ui-conversation` only adds a View-tab More menu, `ComposerSubmission.newSession` and a `whenDraftExists` draft option, none of which the plugin imports. The `@deepseek-ai/dsh` dependency set is unchanged.
- On 2026-10-27, `pnpm verify:release` passed in a clean clone of the candidate (`e723653`) with the three upstream release checkouts: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 198 unit/contract tests across 25 files, and the build. Packaged Chrome on DSH `0.2.1-rc.4` and `0.2.0-rc.2` returned `"ok": true`; a separate packaged Chrome run on `0.2.1-rc.2` also returned `"ok": true`.

### Release gates

- **Local aggregate acceptance:** passed 2026-10-27.
- **Paid provider:** passed 2026-10-27. `pnpm test:dsh:real` on the candidate source ran on DSH `0.2.1-rc.4` with `deepseek-official/deepseek-flash`. Both review Skills resolved to the installed plugin. There were 2 Role calls, and both required Roles returned successful, non-empty results. Story and drama produced 118 and 86 durable events, and the project digest remained unchanged. The operator-authorized credential was read from a 0600 temporary file, deleted after the run, and never appeared in logs. The account balance dropped 0.89 CNY during the run, an upper bound because other traffic shares the account.
- **New-user audit:** not rerun. 0.1.19 changes no workbench surface; the 0.1.17 audit below still describes the product flow.

## 0.1.18 release evidence

0.1.18 fixes the plugin-owned P2/P3 findings left by the 0.1.17 new-user audit. Upstream Skill pins, the default host and the paid-provider surface are unchanged from 0.1.17.

### Local evidence

- Fixed findings:
  - The bundled Jin Ping Mei example (18+) is reachable from the welcome card before any creative work.
  - The empty 视频 state runs the runtime check.
  - The game preview probe reads the build on the page's own origin. It no longer reports a false 「预览载入失败」 beside a working game.
  - The drama Python floor follows the bundled scripts' declared 3.9; video stays 3.10.
  - The file tree re-lists the workspace while a Session runs.
  - Game project names drop the brief label, dash and wrapping 书名号.
- New unit tests cover the preview status rules, the same-origin probe address, project-name cleanup, the empty-video runtime check, and the drama Python floor checked against every bundled script's `MINIMUM_PYTHON`.
- The packaged smoke covers the example entry, the loaded preview status across the loopback-alias isolation, the empty-video runtime check, and the absence of a stored workspace layout after the example visit.
- On 2026-10-19, `pnpm verify:release` passed on the merged source (`4648ca2`): lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 198 unit/contract tests across 25 files, and the build. Packaged Chrome on DSH `0.2.1-rc.2` and `0.2.0-rc.2` returned `"ok": true`.
- An independent review found no blockers. Its should-fix and nit findings were fixed before merge: the error flickering during quiet refreshes, the in-flight flag race, the stored layout choice, and the ARIA role.
- The live file-tree refresh has no automated test, because the fixture model starts no long-running writing Role.

### Release gates

- **Local aggregate acceptance:** passed 2026-10-19.
- **New-user audit and paid provider:** not rerun. 0.1.18 changes only Browser workbench surfaces and host preflight floors. The 0.1.17 evidence below still applies to Skills, Roles and provider behaviour.

## 0.1.17 release evidence

### Local evidence

- Oh Story 0.9.0 (`74080143dd1a`), 13 Skills, 7 Roles and `agents_version` 36; NovelToGame 0.6.0 (`7758caa8d957`), 7 Skills. Both were synced from clean clones of the release tags. Drama 0.9.0 (`dafe80ee390e`) and video-recap 0.6.2 (`5785c33d8b51`) keep their pins. Upstream's new `story-setup/scripts/merge-project-instructions.py` is excluded by the synchronizer and rejected by parity.
- Between DSH `0.2.1-alpha.4` and `0.2.1-rc.2`, every `@deepseek-ai` package the plugin imports has byte-identical type declarations, and every DOM selector the packaged smoke uses is still present.
- The candidate (`ba64b81`) passed clean-source `pnpm verify:release`: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 179 unit/contract tests and the build. Packaged Chrome on both DSH `0.2.1-rc.2` and `0.2.0-rc.2` returned `"ok": true`.

### New-user audit

- Four personas (short story, long-form serial, short drama, game/video) used the packed candidate on a fresh DSH `0.2.1-rc.2` home, following the README install, with a real DeepSeek model. Each completed its main task: an 8052-character short story, a book opening with 5 chapters, a 60-episode outline with the first three scripts, and a playable five-ending game from a user-written story. Output quality scored 4.0–4.6. There were no P0 findings.
- The audit found four plugin defects, all fixed before release:
  - The bundled require-based checkers failed under the package's ESM type. This affected short-story design, outline contract, deslop detection and the chapter check.
  - Short stories at the workspace root never showed in the 小说 workbench.
  - Drama and game workspaces opened on an empty 小说 tab.
  - The welcome card implied that adding a folder came first.
- The build now runs a bundled checker and fails if it cannot load. The rebuilt candidate was re-checked on a fresh DSH `0.2.1-rc.2`: the short-story workspace shows 小说 · 短篇, and a drama-only workspace opens on 短剧 before and after a reload.
- Findings that belong to the DSH host are recorded for upstream follow-up rather than claimed as fixed: stop not cascading to subagents, the native folder picker's missing page feedback, English progress, and token-only usage. So are findings that belong to the upstream Skills: long first-turn latency, short chapters, and editing on a vague request without asking first.

### Paid provider

- On 2026-10-19, `pnpm test:dsh:real` on the fixed source (`bac50b1`) passed on DSH `0.2.1-rc.2` with `deepseek-official/deepseek-flash`. Both review Skills resolved to the installed plugin. There were 2 Role calls, and both required Roles returned successful, non-empty results. Story and drama produced 130 and 66 durable events, and the project digest remained unchanged. The operator-authorized credential was read from a 0600 temporary file and never appeared in logs.

### Release gates

- **Local aggregate acceptance:** passed 2026-10-19. This is the full `pnpm verify:release` with packaged Chrome on `0.2.1-rc.2` and `0.2.0-rc.2`, repeated on the final source after the audit fixes.
- **New-user audit:** passed 2026-10-19. No P0 findings, and every plugin-owned P1 was fixed and re-verified on DSH.
- **Paid provider:** passed 2026-10-19. Native Story and Drama review succeeded, with both required Roles returning results.

## 0.1.16 release evidence

### Local evidence

- Oh Story 0.8.6 (`86a8000cc890`), 13 Skills, 7 Roles and `agents_version` 35: all 365 bundled files pass parity. Author-memory resources belong to the long- and short-form writing Skills; the ignored local ZIP is excluded by the synchronizer and rejected by parity. Drama 0.9.0 (`dafe80ee390e`), NovelToGame 0.5.0 (`bf0ffbc0cedf`) and video-recap 0.6.2 (`5785c33d8b51`) retain their reviewed pins.
- The first local aggregate command encountered unrelated old checkouts under `.claude/worktrees/` during ESLint. Verification uses a clean export of committed source; no local checkout or lint exclusion was changed to hide a source failure.
- The first alpha.4 browser run exposed the obsolete global-single-blank-session assumption. The test now binds the welcome guide to its selected Session ID and checks that Session's blank state and canonical default-workspace path.

- A later alpha.4 run reached streaming Todo geometry but encountered an invisible auxiliary tail node. The smoke now measures the last visible semantic row in its own flow and checks its full viewport/Composer bounds and padding in one snapshot; product CSS and visibility thresholds are unchanged.

- On 2026-10-16, the clean-source `pnpm verify:release` completed successfully: lint, typecheck, four parity checks, the DSH boundary, 16 release tests, 3 upstream-update tests, 179 unit/contract tests across 23 files and the build. Packaged Chrome on both DSH `0.2.1-alpha.4` and `0.2.0-rc.2` returned `"ok": true`, with Role streaming, mixed composition, ADV save/restore, compact 500 px layouts and 20-writer atomic CAS enabled. Main and tag workflows repeat the full suite on the final submitted source.

### Paid provider

- On 2026-10-16, `pnpm test:dsh:real` against the packed runtime from `44b9b7e` passed on DSH `0.2.1-alpha.4`, using `deepseek-official/deepseek-flash`. Both `story-review` and `short-drama-review` resolved to the installed plugin. The Session logs contain 3 Role calls; the two required Roles (`story-explorer` and `consistency-checker`) each returned a correlated, non-error, non-empty tool result. Story and drama produced 109 and 68 durable events respectively; the project digest remained unchanged.
- This is paid review/Role compatibility evidence. The README browser GIFs remain the 0.1.13 recordings, and no new paid media production is claimed. The temporary credential stayed outside the repository, was not exposed in DSH logs, and its local file was removed after the run.

### Release gates

- **Local aggregate acceptance — PASSED 2026-10-16:** full `pnpm verify:release`, with successful packaged Chrome on alpha.4 and rc.2.
- **Paid provider — PASSED 2026-10-16:** native Story/Drama review and both required Role results on alpha.4; the separately recorded browser integration uses the fixture provider.

## 0.1.15 release evidence

### Local evidence

- Oh Story 0.8.5 (`2cf7be61b139`): synchronized from a clean detached worktree of the `v0.8.5` tag, so a locally excluded `skills/story-long-analyze.zip` in the neighbouring checkout is not bundled; parity passes against that worktree (365 files, 13 Skills, 7 Roles, `agents_version` 34). The upstream author-memory transaction suite and all 42 writer-pipeline tests pass on the tag.
- Issue #61 reproduction against the bundled scripts in the DSH single-book layout (workspace is the book root): 20 active global `prose_style` habits of about 40 characters each. The 0.8.4 `query` returns 8 items and omits 12; the 0.8.5 `query` returns 16 items with `lines`, omits 4 and reports each omission in `omitted_summaries`. `build_writer_prompt.find_workspace` recognises both the single-book layout and a book under `长篇/`.
- On 2026-10-10, `pnpm verify:release` completed against the release source: lint, typecheck, all four parity checks (Oh Story 0.8.5, Drama 0.8.1, NovelToGame 0.5.0, video-recap 0.6.2), the DSH boundary, 16 release checks, 3 upstream-update checks, 173 unit/contract tests across 23 files and the build; packaged Chrome result JSON reported `"ok": true` on DSH `0.2.1-alpha.1` and `0.2.0-rc.2`.
- No plugin source changed in this release; the diff under `packages/knowledge` is 35 bundled Oh Story files plus the manifest.

### Release gates

- **Local aggregate acceptance — PASSED 2026-10-10:** `pnpm verify:release` with both alpha and rc.2 result JSON reporting `"ok": true`.
- **Credentialed browser demos and paid provider — NOT RERUN:** no `DEEPSEEK_API_KEY` run was made for 0.1.15; the fixture provider does not exercise a real writer receiving the larger author-memory block.

## 0.1.14 release evidence

### Local evidence

- video-recap-skills 0.6.2 (`539168622918`): parity passes against a fresh `v0.6.2` checkout. The upstream groups touched by 0.6.2 pass unchanged: voiceover 161, script 128, orchestrator 464 with 9 skipped. Two orchestrator files need Python 3.10 and were not run on the Python 3.9 host.
- On 2026-10-08, `pnpm verify:release` completed against the final release source: lint, typecheck, all four parity checks (Oh Story 0.8.4, Drama 0.8.1, NovelToGame 0.5.0, video-recap 0.6.2), the DSH boundary, 16 release checks, 3 upstream-update checks, 173 unit/contract tests across 23 files and the build; packaged Chrome result JSON reported `"ok": true` on DSH `0.2.1-alpha.1` and `0.2.0-rc.2`.
- The packaged smoke now also drives the infinite canvas: background drag pans without changing node coordinates, the wheel changes zoom, and Fit frames every node after panning and zooming. A separate exploratory Chrome run against the packaged plugin checked 19 canvas behaviours, including cursor-anchored zoom, negative node coordinates, selection centring, keyboard follow, resize stability and the compact layout, and captured every Production tab in light and dark mode.
- The `Upstream Updates` workflow ran on GitHub against `main` both as a dry run (reporting video-recap 0.6.2 before the sync merged) and as a real run after the sync (`No new upstream versions.`, no issue opened).

### Release gates

- **Local aggregate acceptance — PASSED 2026-10-08:** `pnpm verify:release` with both alpha and rc.2 result JSON reporting `"ok": true`.
- **Credentialed browser demos and paid provider — NOT RERUN:** no `DEEPSEEK_API_KEY` run was made for 0.1.14; the README GIFs are unchanged from 0.1.13 and do not show the new canvas or status pills.

## 0.1.13 release evidence

### Local evidence

The following evidence has been reproduced while preparing the pinned asset updates:

- Drama Skills 0.8.1: 11 bundled selftests and 12 character voice-reference tests pass; 33 edit measurements include a real static-image FFmpeg composition.
- video-recap-skills 0.6.1: the unchanged upstream orchestrator suite passes all 495 tests and video-reference passes all 107 tests (602 total, with no skipped or relaxed case); the focused QC contract subset contains 52 passing cases. The run used an isolated copy of the already-cached Evermeet FFmpeg 8 build with freetype, harfbuzz and libass, so the `drawtext` path was exercised rather than waived.
- NovelToGame 0.5.0: the ADV lint traverses 401,810 choice states and 16 endings; a real browser route reaches the good ending.
- On 2026-10-03, `pnpm verify:release` completed successfully against the final local source state: lint, typecheck, every parity and DSH-boundary check, all 13 release checks, all 170 unit/contract tests across 22 files, and the final build passed.
- The same aggregate run emitted successful packaged Chrome result JSON on DSH `0.2.1-alpha.1` and `0.2.0-rc.2`. It covers Session/tool/Role streaming, 13 Story Skills, 11 Drama Skills, 7 game Skills, 3 user-invocable video Skills, the ADV age gate and quick save/load, video source/edited/final views, the 20-writer CAS race, and final-source mixed composition behavior: an explicitly selected `交付/EP001/` IMG still overrides an available video, the first source selector is visible and at least 100×20 px at the 500 px viewport, and the sequence has no horizontal overflow.
- A paid DSH `0.2.1-alpha.1` observation with `deepseek-official/deepseek-flash` passes both review flows: 2 required Role calls, 86 durable story events, 64 durable drama events, and an unchanged combined project digest. This observation does not claim to be a paid rerun of the exact final release source.
- A separate paid DSH `0.2.1-alpha.1` browser run with `deepseek-official` passed on 2026-10-03 and rendered all four Story, Drama, Game and Video GIFs. It exercised the ADV quick save/load path, the compact 500 px game view and the 20-writer CAS race. The paid path intentionally reports `mixedStaticComposition`, `agentWriteStreaming` and `roleToolE2e` as false; those contracts are covered by the fresh final-source fixture run and the independent paid provider review above, not attributed to this demo. The paid browser package predates the final compact-CSS adjustment, so it is provider-plus-four-workbench compatibility evidence rather than exact-final-CSS verification.

### Release gates

- **Local aggregate acceptance — PASSED 2026-10-03:** `pnpm verify:release` completed with both alpha and rc.2 result JSON reporting `"ok": true` after all deterministic checks.
- **Credentialed browser demos — PASSED 2026-10-03:** the paid all-workbench run returned `"ok": true` and rendered all four GIFs, subject to the coverage and final-CSS boundary stated above.
- **Public channels — PASSED 2026-10-03:** [source-bound recovery attempt 2](https://github.com/zenstory-ai/oh-story-dsh/actions/runs/37141721746/attempts/2) completed `verify-public` with `{"github":"SUCCESS","npm":"SUCCESS","version":"0.1.13"}` after anonymous byte comparisons, npm integrity verification and an isolated public install. An independent local invocation returned the same result.

The original tag workflow passed the full release suite and published GitHub
assets, but its relative npm tarball argument failed. The recovery reused that
same producer artifact; neither the tag nor public assets were changed. npm
accepted the package on recovery attempt 1; its metadata was briefly unavailable
while processing, exposing a verifier null-handling bug. After the exact public
integrity became available, attempt 2 reported `skip-exact` rather than publishing
again and passed the complete public verification. The main verifier now rejects
missing metadata into its existing bounded wait, with a red/green regression.

The [public manifest](https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.13/RELEASE-MANIFEST.json)
binds the unchanged package to source
`f207fa92863bd3626b8ee6bd7b5ad30762ef205c`. npm provenance identifies the recovery
workflow/main invocation, not the original tag-build invocation; the manifest,
original producer proofs and exact protected-main CI independently bind package
source. See [the recovery process](RELEASING.md#one-time-0113-npm-recovery).

## Test architecture

| Layer | Command | Coverage |
| --- | --- | --- |
| Deterministic quality gate | `pnpm verify` | ESLint, TypeScript, pinned asset hashes/catalogs, DSH boundary audit, unit/component tests, Host/Browser build |
| Cordis Context contracts | `pnpm test:contract` | Real Context/Fiber/provide/inject topology for cross-scope service access; leaf runtimes remain deterministic fakes |
| Cross-platform gate | `pnpm verify:portable` | Type, asset, unit and build behavior on macOS and Windows |
| Packaged DSH integration | `pnpm test:dsh` | Deterministic correctness gate for build, npm tarball, profile installation, official DSH Web startup, Session APIs, skill catalog, workspace routes, Role execution and Chrome UI |
| Real provider | `pnpm test:dsh:real` | Paid provider-compatibility observation for the official DeepSeek model, durable Agent completion, Oh Story Role calls, fiction review, short-drama review, read-only project digest and credential redaction |
| Release candidate | `pnpm verify:release` | Deterministic gate plus packaged DSH integration before tarball creation |

The deterministic packaged Role path is part of the correctness gate. The paid real-provider layer is intentionally excluded from Pull Request CI because model, provider and network behavior are not deterministic. It is available as a manual GitHub Actions compatibility observation and requires the repository Secret `DEEPSEEK_API_KEY`; a credential-based skip is not a passing provider result.

`pnpm test:contract` is the focused developer entry point. The same `*.contract.test.ts` files are discovered by `pnpm verify`, so they remain mandatory in the normal Pull Request quality gate.

## Automated coverage

| Area | Evidence |
| --- | --- |
| Capability catalog | Native DSH Session exposes 13 Oh Story Skills, 11 Drama Skills, 7 NovelToGame Skills and the 3 user-invocable video entries; provider tests retain all 7 upstream video Skills |
| Upstream integrity | Four knowledge manifests verify pinned commits, catalogs, every bundled file hash, portable-source exclusions, the Drama creator-first contract and its assembly stage, and the absence of every standalone-dashboard file; all 11 bundled Drama selftests run without bytecode writes, the five demo documents verify recorded fixture hashes, NovelToGame parity covers the playable `jin-ping-mei` ADV build and authoring-material exclusions, and video-recap parity requires the complete seven-Skill pipeline plus its orchestrator/inspect entry points |
| Plugin boundary | Host bundle and source audit keep all DSH imports inside `@oh-story/dsh` |
| Workspace safety | Unit tests cover Host/Origin/Fetch Metadata trust and creative media allowlists, while the packaged route rejects traversal and exercises session-scoped reads, media byte ranges and atomic writes; generated-game CSP is browser-probed to reject workspace API access outside the preview asset prefix; child-session, absolute-path and symbolic-link negative cases remain follow-up contracts |
| Editor concurrency | Versioned GET/PUT rejects stale saves; Chrome edits, saves, rereads and restores a real workspace file |
| File following | Tests cover DSH Step location data, nested running calls, streamed write/edit previews, calls DSH holds between their finished step and dispatch, creative path classification and workbench switching |
| Markdown rendering | Component tests cover tables, task lists, fenced code, inline formatting, safe links and inert raw HTML |
| JSONL rendering | Component tests cover typed record summaries, source line numbers, scalar records and per-line parse failures |
| Three-column layout | Native DSH Chrome smoke checks ordered tree/editor/Chat geometry and minimum usable widths |
| Conversation ownership | Unit tests cover creative-project detection, the bundled example exclusion, explicit-choice precedence and unusable browser storage; native smoke runs a workspace with no creative project, asserts DSH's own conversation layout survives, watches the first Agent-written creative file hand the layout over, collapses the workbench back to the official layout inside the conversation column, and requires the collapsed choice to hold in a new Session of the same workspace |
| Composer stability | Browser interaction contracts run `scrollIntoView()` and verify dynamic Composer clearance in wide, medium and 500 px compact layouts |
| Dual workbench | Native smoke switches 小说/短剧, opens all five creator-first document types, and exercises Markdown preview/source modes |
| Game Studio | Native smoke verifies Preview-left/Chat-right geometry, real iframe input, explicit new-version loading, state preservation across Preview/project-file, compact Studio/Chat and 小说/游戏 switches, fullscreen focus return, the absence of QA UI, the bundled Jin Ping Mei opening, and a non-clipping 500 px layout even when the host drawer remains open |
| Video Studio | Unit tests cover project-root validation, high-volume artifact exclusion, optional `production_reference.json` / `reference_measurements.json` / `reference_breakdown.json` discovery without inventing a lifecycle stage, full/cut pause projection, source/edited/final selection and standards-compliant byte ranges; packaged catalog and tarball checks cover all seven Skills |
| Compact Game Studio | Chrome runs the game-specific surface at 500×900, checks tab/tabpanel relationships and horizontal containment, enters a Composer draft in Chat, returns to the same live game state, and emits screenshot evidence |
| Short-drama production | Unit tests cover document parsing, episode isolation, prompt authority, cross-episode image-reference filtering, media-typed version selection, DSH Queue/current-Turn classification, dispatched-unknown safety, jobs, versions and sequence logic; packaged Chrome checks two-episode switching, per-episode task/reference/canvas isolation, project-media search/reuse, concurrent submit/remove/cancel semantics, late partial-batch reconciliation, successful composition backfill, version selection, sequence reorder/blockers, creator keyboard canvas movement, Agent semantic focus, native Conversation dispatch, realistic image/MP4 backfill and 500 px containment |
| Media adapters | Unit tests pin the adapter catalog to the upstream provider script and its references, check the generated adapter config carries argv commands only, verify the produce Skill text names the config path and required variables, and confirm presence reporting never includes values. The generated generic profile deliberately omits `reference_roles`, so audio references fail closed; a creator-owned adapter config must explicitly opt a known model into `reference_audio`. |
| Agent production operability | The packaged fixture model calls the registered `oh_story_production` tool in a real DSH turn; the durable successful call is rendered by the plugin tool view and focuses the requested EP001 production target without granting cosmetic canvas control. Unit tests reject traversal, duplicate sequence IDs, failed calls and malformed replay payloads. |
| Roles and hooks | Real Cordis Fiber contracts cover plugin-runtime capture, `Context.get()` fallback and missing-runtime failure; packaged DSH deterministically completes one child-Agent Role invocation; unit contracts cover pinned reference reads, path escape and scoped-shadow rejection |
| Package contents | Build and pack include all four pinned knowledge sets, the Jin Ping Mei playable build and QA record, package metadata and license while omitting source tests and the standalone Drama and video-recap dashboards |

The gate discovers all `*.test.ts` and `*.contract.test.ts` files. Coverage claims below are tied to executable behavior, not a manually maintained test-count snapshot.

## Contract evidence matrix

| Product contract | Deterministic evidence required on every PR | Credentialed observation |
| --- | --- | --- |
| `oh_story_role` service scope | Real Cordis Fiber contract tests plus packaged parent Agent → Role child → parent result flow | Official DeepSeek model follows the complete review workflow |
| Chat anchor clearance | Chrome performs `scrollIntoView({ block: "end" })` in wide, medium and compact layouts and checks the target remains above the Composer | None; provider behavior is irrelevant |
| Workspace and mutation hooks | Unit tests resolve named Agent services; packaged DSH exercises Session routes and native tool execution | Real projects remain read-only during review |
| Provider compatibility | Not used as deterministic correctness evidence | The Real Provider workflow must report `EXECUTED_AND_PASSED`; `SKIPPED_NO_CREDENTIAL` is not a pass |

## Native DSH Web audit

`pnpm test:dsh` creates an isolated DSH installation and profile, packs `@oh-story/dsh`, installs the tarball through `dsh plugin --profile web add`, and starts the official Web UI. Its deterministic fixture model answers the Anthropic-compatible Messages API that DSH 0.2.0's DeepSeek provider speaks, and DSH's first-use Documents folder is redirected into the temporary root so a run never writes to the real home. It copies the pinned public demo projects from Oh Story (`让你管账号，你高燃混剪炸全网`) and Drama Skills (`让你管账号`) into temporary workspaces, creates a minimal workspace game, and loads the pinned NovelToGame Jin Ping Mei example. The Chrome pass verifies:

- 13 Oh Story Skills, 11 Drama Skills, 7 NovelToGame Skills and the 3 upstream user-invocable video entries in the Session catalog; provider tests cover all 7 bundled video Skills;
- Session-scoped workspace reads, a 20-writer atomic CAS race, stale-write rejection and path-traversal rejection;
- allowlisted media discovery, read-only byte-range preview and media path-traversal rejection through the current Agent FileSystem, using two alternate 941×1672 generated keyframes and a real 704×1280 five-second seekable MP4 rather than one-pixel placeholders;
- invalid project metadata isolation without taking down the workspace;
- published Browser module and official UI slot registrations;
- a real DSH Agent `write` tool call, incremental editor content, the tree following the new file through DSH's pre-dispatch window, authoritative disk reconciliation and official tool-file navigation;
- a deterministic `oh_story_role` call that starts a packaged `story-explorer` child, returns its result to the parent and completes the parent turn;
- 小说/短剧 navigation, recursive project directories, creator-first five-document exclusivity and Markdown rendering;
- 游戏 defaults to real-time Preview, keeps the playable iframe left of the wider official Chat, executes workspace-game input, preserves the same runtime across Preview/project-file switching, switches projects, reaches the Jin Ping Mei opening scene, and restores focus after fullscreen;
- Game Studio exposes no QA tab, scorecard, badge or QA screenshot; the six-check artifact contract remains covered by parity, Host API assertions and packaged automation;
- at 500×900 the game-specific `制作 / 对话` switch preserves both iframe state and Composer usability without horizontal clipping;
- two isolated creator-first episodes, including production projection rebuilds, EP-local tasks, versions, selections, sequence and canvas coordinates when switching EP001 ↔ EP002; background-drag panning that leaves node coordinates untouched, cursor-anchored wheel zoom and fit-to-nodes on the infinite canvas;
- direct `oh_story_production` execution by the fixture Agent, durable semantic-focus replay and navigation isolation; cosmetic canvas coordinates remain creator-controlled Session state;
- a searchable project media library and explicit EP001 → EP002 image-reference reuse without duplicating prompt editing inside production cards;
- running + queued submissions read from the host `inbox` projection, exact Queue removal, current-Turn cancellation with the remaining Queue preserved but not auto-executed, and a late real MP4 that upgrades a completed batch from 0/22 to an explicit 1/22 partial result without a render loop;
- a complete mixed sequence whose creator explicitly selects `交付/EP001/`'s IMG still for SHOT-EP001-001 ahead of an available video while the other 21 shots use video; it previews the actual still/video sources, dispatches the ordered native assembly request to `/short-drama-edit`, refuses a second composition while the first is unsettled, and completes only after the fixed upstream deliverable `制作成果/成片/成片.mp4` appears in the Agent FileSystem;
- the short-drama production shot board, two-version selection and restoration, same-episode delivery artifact discovery, explicit IMG selection, accepted SHOT keyframe fallback, mixed-source sequence reorder/blockers, asset board, relationship canvas, keyboard layout movement, native `/short-drama-produce` Conversation dispatch, realistic image/video version backfill and cross-document source navigation;
- first-launch guidance in the blank default-workspace Session a fresh DSH opens (its first-use Documents folder redirected into the temporary root), its containment at 500 px, its 「先玩内置示例」 entry opening the Jin Ping Mei preview as loaded (not failed) across the loopback-alias isolation, the empty 视频 state's runtime check, no workspace layout remembered after the example visit and the guide's return when it is collapsed, its retirement after that Session's first prompt, and removal when entering a creative Session;
- blank-session mounting, Session-switch draft recovery after DSH releases the Session's Store, source editing, conflict isolation and saved-state behavior;
- ordered tree/editor/Chat geometry at desktop and 500 px widths, a Composer that remains fixed during long-message scrolling, and anchor clearance in wide, medium and compact layouts.

When `OH_STORY_GAME_E2E_DIR` is set, the same pass emits game evidence screenshots. The checked-in evidence is `docs/images/game-studio-jin-ping-mei.png` and the 500×900 `docs/images/game-studio-compact.png`.

The same audited surface generates all four README demos. One pass captures every workbench, so `pnpm demo` renders the complete set and `pnpm demo:story`, `pnpm demo:drama`, `pnpm demo:game` and `pnpm demo:video` only narrow which GIFs get written. Demo commands require `DEEPSEEK_API_KEY` and `ffmpeg`, use the real `deepseek-official` provider, wait for successful assistant turns, collapse the DSH navigation rail, and record the complete workbench/Chat surface. `OH_STORY_DEMO_MOCK=1` re-renders the same surfaces from the deterministic fixtures without a provider key. The API key is process-only and is redacted from captured failure logs.

## Real DeepSeek observation

The 2026-10-03 compatibility observation used `deepseek-official/deepseek-flash` against a packed plugin on DSH `0.2.1-alpha.1`, with `~/.agents` isolated so both review Skills resolved to the packed plugin:

- `story-review` and `short-drama-review` completed with 2 required `oh_story_role` calls in total;
- the story Session recorded 86 durable events and the drama Session recorded 64;
- both sessions produced durable assistant output;
- the combined fiction/short-drama project digest remained unchanged;
- the API credential did not appear in captured DSH logs.

Event totals are observations, not fixed assertions. This run establishes provider compatibility for the tested packed state; because later local release edits may exist, it is not represented as a paid rerun of the exact final release source. The separately recorded credentialed all-workbench browser/demo run passed with its stated coverage and final-CSS boundary.

## CI workflows

- `.github/workflows/ci.yml`: Ubuntu quality gate, macOS/Windows portability, then packaged DSH Web integration.
- `.github/workflows/real-provider.yml`: manual paid compatibility observation with separate credential-preflight and real-test jobs. The always-running summary distinguishes `EXECUTED_AND_PASSED`, `EXECUTED_AND_FAILED`, `SKIPPED_NO_CREDENTIAL`, `PREFLIGHT_FAILED` and `PROVIDER_JOB_NOT_COMPLETED`. Only `EXECUTED_AND_PASSED` succeeds; missing credentials, preflight failures, cancellations and abnormal skips deliberately fail the workflow instead of producing a green non-result.
- `.github/workflows/release.yml`: tagged release gate, `.tgz` artifact upload, GitHub Release creation and npm publication with provenance.

## Commands

```bash
pnpm verify
pnpm test:contract
pnpm test:dsh
pnpm verify:release
DEEPSEEK_API_KEY_FILE=/path/to/key pnpm test:dsh:real
DEEPSEEK_API_KEY=... pnpm demo
pnpm pack:release
```
