# Validation

Candidate: `@oh-story/dsh` 0.1.28 on DeepSeek Harness `0.2.2-rc.5`, with release-gate coverage of `0.2.0-rc.2` and real `deepseek-official/deepseek-flash` provider validation. Local aggregate acceptance passed on 2026-11-22.

## 0.1.28 release evidence

0.1.28 syncs Oh Story 0.11.0, Drama Skills 0.13.0, and video-recap-skills 0.8.0 (NovelToGame 0.9.0 stays pinned), moves the default host to DeepSeek Harness `0.2.2-rc.5`, adopts DSH `0.2.2-rc.5` `connection.fetch.register`, `conversation.hero.frame`, and static `lib/workbench.css` delivery (while preserving `0.2.0-rc.2` fallback parity), hardens workspace/preview security, and adds creator UX upgrades across all four workbenches.

### Local evidence

- Upstream parity: Oh Story 0.11.0 (`e5a8b98657c0`, 14 Skills, 7 Roles, `agents_version` 45); Drama Skills 0.13.0 (`7fed9dfcd33c`, 12 Skills, 9 compiled scripts); NovelToGame 0.9.0 (`48328cd756cd`, 5 Skills, no bundled examples); video-recap-skills 0.8.0 (`4ae6380a6a5a`, `video-recap` + `video-reference`).
- DSH `0.2.2-rc.5` architecture & bundle budget: `/api/oh-story/*` mounts on `connection.fetch.register` (`POST` save, `connection.admit` trust delegation, `ETag`/`304` + `no-cache` on unversioned CSS, `503` on empty CSS); `WelcomeGuide` renders via `conversation.hero.frame` (with zero-observer fallback on `<0.2.2-rc.2`); static `packages/dsh-plugin/lib/workbench.css` (~151 KB) removes all `?inline` CSS from `packages/dsh-plugin/lib/client.js` (~275 KB, down ~27% from 379 KB).
- On 2026-11-22, `pnpm verify` + `pnpm test:dsh` (`0.2.2-rc.5`) + `pnpm test:dsh:rc` (`0.2.0-rc.2`) + `node scripts/release.mjs check --tag v0.1.28` all passed: lint (`--max-warnings=0`), typecheck, 4/4 parity checks, DSH boundary (94 non-plugin files), release/upstream tests (18/18), 364 unit/contract tests across 40 files, build, and packaged Chrome E2E on both DSH `0.2.2-rc.5` and `0.2.0-rc.2` (`ok: true` on both).

### Release gates

- **Local aggregate acceptance:** passed 2026-11-22 (`pnpm verify`, `pnpm test:dsh` on `0.2.2-rc.5`, `pnpm test:dsh:rc` on `0.2.0-rc.2`, `node scripts/release.mjs check --tag v0.1.28`).
- **Paid provider:** passed 2026-11-22. `pnpm test:dsh:real` ran packed `@oh-story/dsh` on DSH `0.2.2-rc.5` with `deepseek-official/deepseek-flash`: `{"ok":true,"dshVersion":"0.2.2-rc.5","provider":"deepseek-official","model":"deepseek-flash","skills":["story-review","short-drama-review"],"roleCalls":4,"successfulRoles":2,"durableSessionEvents":{"story":178,"drama":92},"projectUnchanged":true}`. The operator-authorized credential was injected in-memory from Railway and never printed, written to disk, or logged.

## 0.1.27 release evidence

- Workbench settings keep one shared visibility snapshot per workspace across Session A/B/A navigation; browser storage persists it across reloads. Tests cover canonical ordering, malformed data, blocked storage, stable snapshots, last-tab protection and visible-tab keyboard traversal. Hidden tabs do not disable Skills, delete files or cancel production.
- Drama Skills 0.12.1 (`37232f6d22e174c36e321d2e3a1a3ae871e7d602`) bundles 12 Skills and passes all 7 scripted-Skill selftests. The upstream EP001 fixture contents are unchanged from 0.12.0; provenance advances with the pin. No additional project migration is introduced.
- This release includes the previously merged welcome-guide controls from #129: persistent dismissal and host plugin configuration, with the conversation-mode Skill boundary stated explicitly.
- On 2026-11-17, `pnpm verify:release` passed: lint, typecheck, asset parity, DSH boundary, release/upstream tests, 270 unit/contract tests across 36 files, build, and packaged Chrome on DSH `0.2.2-rc.1`, `0.2.0-rc.2` and `0.2.2-rc.3`. Each browser run reported `ok: true`, `workbenchTabs: per-workspace-hide-restore-persist` and `roleToolE2e: true` with the local fixture provider.
- Browser scenarios exercise hiding the active tab, last-tab protection, Escape/focus return, 500px dialog bounds, official UI creation of Session B, A/B/A preference sharing, reload persistence, workspace isolation and restoring all tabs without reviving a stale selection. Blank Sessions are identified through their mounted conversation ID and selected tree row, not a non-existent hierarchy header. The settings screenshot was visually inspected.
- No paid provider run was performed for this release.

## 0.1.26 release evidence

0.1.26 syncs all four upstream Skill sets — Drama Skills 0.12.0, NovelToGame 0.9.0, Oh Story 0.10.5 and video-recap-skills 0.7.1 — moves the 0.2.2 trial line to DSH `0.2.2-rc.3` (the npm `next`), and consolidates shared path, canvas and synchronization modules while removing dead host-side QA code.

### Local evidence

- Oh Story 0.10.5 (`41a9b6c855d7`), 14 Skills, 7 Roles and `agents_version` 44; Drama Skills 0.12.0 (`047ae8625021`), 12 Skills with all 7 scripted-Skill selftests passing and `EP001` demo fixtures synced; NovelToGame 0.9.0 (`48328cd756cd`), 5 Skills with no bundled examples; video-recap-skills 0.7.1 (`36df69fe9e70`), `video-recap` + `video-reference`. All four were synced from clean checkouts of the release tags.
- Drama 0.12.0 contract adaptations: `drama-adapters.ts` points all five bundled adapters at `short-drama-produce/references/builtin-providers.md`, narrows `minimax-h3` required environment variables to `MINIMAX_API_KEY` and `MINIMAX_VIDEO_MODEL`, and reflects the built-in `seedance`/`minimax-h3` default admission of `reference_audio` alongside explicit `reference_roles` on custom external configs; `drama-production.ts` reads `### 首帧提示词` with a `### 冻结关键帧提示词` fallback, supports `开场画面`/`动作过程` and `GROUP-*` headings, and avoids misclassifying `造型状态`; `short-drama-edit` and composition prompts match 0.12.0 `GROUP-*` accounting and same-aspect-ratio auto-scaling.
- NovelToGame 0.9.0 graybox cold-start playtesting is mapped to the same DSH subagent boundary as `game-qa` Round 1; `video-project.ts` surfaces `promo_copy.json`, `sfx_plan.json`, `original_subtitles.json` and `narration_lint.json`.
- Between DSH `0.2.2-rc.1` and `0.2.2-rc.3`, the client UI, store and skill peer declarations are unchanged, and `dsh-subagent` and `dsh-tools` preserve compatibility with the dual-shape activation and hook contracts. `check-dsh-boundary.ts` now scans all 72 non-plugin files recursively, `native-dsh-smoke.ts` verifies game-preview inline-script blocking via `securitypolicyviolation`, and short-drama canvas asset cards size cleanly for two-line Chinese copy without clipping. Showcase screenshots in `docs/images/` were refreshed from packaged `@oh-story/dsh` 0.1.26 running in official DSH `0.2.2-rc.1` Web.
- On 2026-11-15, `pnpm verify:release` passed with the four upstream release checkouts: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 251 unit/contract tests across 34 files, and the build. Packaged Chrome on DSH `0.2.2-rc.1`, `0.2.0-rc.2` and `0.2.2-rc.3` returned `"ok": true`; a separate packaged Chrome run on `0.2.1-rc.5` also returned `"ok": true`.

### Release gates

- **Local aggregate acceptance:** passed 2026-11-15.
- **Paid provider:** not rerun. Default host (`0.2.2-rc.1`), `oh_story_role` activation and review-chain hooks are unchanged from the 0.1.25 paid run below.
- **New-user audit:** not rerun.

## 0.1.25 release evidence

0.1.25 follows two breaking upstream releases, video-recap-skills 0.7.0 and NovelToGame 0.8.0, and moves the default and development host to DSH `0.2.2-rc.1`. Oh Story 0.10.3 and Drama Skills 0.11.2 keep the pins from 0.1.24.

### Local evidence

- video-recap 0.7.0 (`fc40ffd3f235`) bundles exactly `video-recap` and `video-reference`, both user-invocable; parity requires the merged pipeline scripts under `skills/video-recap/scripts/` and still keeps the 审片台 dashboard out. NovelToGame 0.8.0 (`270a603c9035`) bundles 5 Skills.
- Every plugin read of a video artifact (fields of `recap_run_manifest.json`, `assembly_manifest.json`, `narration.json`, `clip_plan_validated.json`, `visual_audio_board.json`, `recap_story_plan.json`, and the source, edited and final output paths) was checked against the 0.7.0 writers and still holds. `narration_review.md` is no longer listed; `packaging_plan.json` and `shot_review.json` are.
- DSH `0.2.2-rc.2` changed two host contracts the plugin relies on. Subagent activation now reads `parent`, `prompt` and `maxDepth` from the spec itself; `oh_story_role` sends both shapes, and a scratch copy typechecked against rc.2 fails before the fix and passes after it. The conversation scroll container now sits inside the `conversation.hero.frame` slot; the welcome guide and workbench lookups use a descendant combinator. The packaged smoke's module-boundary regex also accepts rc.2's template-literal module ids.
- On 2026-11-12, `pnpm verify:release` passed in a clean clone of the candidate (`1e7fc31`) with the four upstream release checkouts: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 251 unit/contract tests, and the build. Packaged Chrome on DSH `0.2.2-rc.1`, `0.2.0-rc.2` and `0.2.2-rc.2` returned `"ok": true`; a separate packaged Chrome run on `0.2.1-rc.5` also returned `"ok": true`.

### Release gates

- **Local aggregate acceptance:** passed 2026-11-12.
- **Paid provider:** passed 2026-11-12 on DSH `0.2.2-rc.1` and `0.2.2-rc.2` with `deepseek-official/deepseek-flash` (candidate `5136557`, which carries the same server code and Role fix as `1e7fc31`): both runs made 2 Role calls with both required Roles successful and non-empty, durable events 116/86 and 118/72, and project digests unchanged. The operator-authorized credential was read from a 0600 temporary file, deleted after the runs, and never appeared in logs; the shared account balance dropped 0.85 CNY. The runs cover the review chain, not the video or game pipelines.
- **New-user audit:** not rerun.

## 0.1.24 release evidence

- Oh Story 0.10.3 bundles 14 Skills and 7 Roles with `agents_version` 42. Drama Skills 0.11.2 bundles 12 Skills and passes all 7 upstream selftests. NovelToGame 0.7.1 bundles 7 Skills. Asset parity also verifies the video-recap 0.6.2 pin.
- `pnpm verify:release` passed on 2026-11-08, including 251 plugin tests and packaged Chrome on DSH `0.2.1-rc.5`, `0.2.0-rc.2` and `0.2.2-rc.1`. Each run reported `ok: true` and `roleToolE2e: true` with the local fixture provider. The tarball checks include the new cross-book recall and short-drama reconstruction references.

## 0.1.23 release evidence

0.1.23 syncs NovelToGame 0.7.0 without bundling upstream examples, moves the trial line to DSH `0.2.2-rc.1`, and carries the workbench redesign merged in #104. The default host, Oh Story 0.10.0, Drama Skills 0.10.2 and video-recap 0.6.2 are unchanged from 0.1.22.

### Local evidence

- NovelToGame 0.7.0 (`b06f4b3b4f33`), 7 Skills, synced from a clean clone of the release tag; parity requires no `examples/` path in the manifest. The bundled NovelToGame directory is about 244 KB, and the packed tarball is 2.8 MB.
- The example preview route, project `source` field, `PINNED` verification binding, welcome-card entry and project-list group are removed; unit tests no longer construct example projects.
- The packaged smoke now asserts that the tarball has no `lib/novel-to-game/examples/`, that the first-launch guide and an empty Game Studio offer no example, that the retired example route serves nothing, and that the workspace reports only workspace games. Project switching, quick save/load through the sandboxed preview's `localStorage`, iframe preservation, fullscreen, the 500px layout and novel/game switching run against a second test-only workspace game (`smoke-game-alt`).
- A scratch copy with dependencies on `0.2.2-rc.1`, Cordis `4.1.0`, Schemastery `3.19.0` and Cordis plugins `1.1.0` passed typecheck, 250 unit tests, 7 real-Cordis contract tests, the DSH boundary and the build.
- On 2026-11-05, `pnpm verify:release` passed in a clean clone of the candidate (`672629a`) with the upstream release checkouts: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 250 unit/contract tests, and the build. Packaged Chrome on DSH `0.2.1-rc.5`, `0.2.0-rc.2` and `0.2.2-rc.1` returned `"ok": true` with `gameSaveRestore: true`.

### Release gates

- **Local aggregate acceptance:** passed 2026-11-05.
- **Paid provider:** not rerun. The Oh Story and Drama Skills, their bridges and the default host are unchanged since the 0.1.22 run on `0.2.1-rc.5` below; the paid run does not exercise the game pipeline.
- **New-user audit:** not rerun.

## 0.1.22 release evidence

0.1.22 syncs Oh Story 0.10.0 and Drama Skills 0.10.2 and moves the trial line to DSH `0.2.2-alpha.3`. The default host stays `0.2.1-rc.5`; NovelToGame 0.6.1 and video-recap 0.6.2 keep their pins.

### Local evidence

- Oh Story 0.10.0 (`95c698a73a71`), 14 Skills, 7 Roles and `agents_version` 39; Drama Skills 0.10.2 (`c8f90a79032d`), 12 Skills with 7 passing selftests including the new `short-drama-breakdown`. Both were synced from clean clones of the release tags.
- Every upstream file, command and step the DSH bridge, native hooks and Role code cite was checked against 0.10.0. `references/author-memory-maintenance.md` was merged upstream into `references/author-memory.md`, and the author-memory bridge now points there. The upstream `story_hook_core.js` is unchanged, so the native outline gate still mirrors it.
- The Markdown preview now hides HTML comments outside code; a new unit test covers 0.10.0's `<!-- L1-01 -->` heading anchors, template comments and preserved code.
- A scratch copy with dependencies on `0.2.2-alpha.3`, Cordis `4.0.6-alpha.2` and Schemastery `3.18.6-alpha.2` passed typecheck, 199 unit tests, 7 real-Cordis contract tests, the DSH boundary and the build.
- On 2026-11-03, `pnpm verify:release` passed in a clean clone of the candidate (`970389a`) with the upstream release checkouts: lint, typecheck, four parity checks, the DSH boundary, release and upstream-update tests, 199 unit/contract tests, and the build. Packaged Chrome on DSH `0.2.1-rc.5`, `0.2.0-rc.2` and `0.2.2-alpha.3` returned `"ok": true`.

### Release gates

- **Local aggregate acceptance:** passed 2026-11-03.
- **Paid provider:** passed 2026-11-03. `pnpm test:dsh:real` on the candidate ran on DSH `0.2.1-rc.5` with `deepseek-official/deepseek-flash`: 2 Role calls, both required Roles successful and non-empty, 86 and 48 durable events, project digest unchanged. The operator-authorized credential was read from a 0600 temporary file, deleted after the run, and never appeared in logs; the shared account balance dropped 0.16 CNY. The run covers the review chain, not `short-drama-breakdown` or `story-publish`.
- **New-user audit:** not rerun.

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
source. See [Dry-run and failure outcomes](RELEASING.md#dry-run-and-failure-outcomes).

## Test architecture

| Layer | Command | Coverage |
| --- | --- | --- |
| Deterministic quality gate | `pnpm verify` | ESLint, TypeScript, pinned asset hashes/catalogs, DSH boundary audit, unit/component tests, Host/Browser build |
| Cordis Context contracts | `pnpm test:contract` | Real Context/Fiber/provide/inject topology for cross-scope service access; leaf runtimes remain deterministic fakes |
| Cross-platform gate | `pnpm verify:portable` | Type, asset, unit, and build checks on macOS and Windows |
| Packaged DSH integration | `pnpm test:dsh` | Deterministic correctness gate for build, npm tarball, profile installation, official DSH Web startup, Session APIs, skill catalog, workspace routes, Role execution, and Chrome UI |
| Real provider | `pnpm test:dsh:real` | Paid compatibility check against the official DeepSeek API covering durable Agent turns, Oh Story Role calls, fiction and short-drama review, read-only project digests, and log redaction |
| Release candidate | `pnpm verify:release` | Full deterministic gate plus packaged DSH Web runs across supported host lines before cutting a tarball |

The deterministic packaged Role path is part of every release gate. Paid real-provider runs stay outside Pull Request CI because live model and network behavior are non-deterministic; the manual `Real Provider` workflow requires `DEEPSEEK_API_KEY`, and a missing-credential skip never counts as a pass.

`pnpm test:contract` provides a quick local entry point; `pnpm verify` runs the same `*.contract.test.ts` suite automatically on every PR.

## Automated coverage

| Area | Evidence |
| --- | --- |
| Capability catalog | Native DSH Session exposes 14 Oh Story Skills, 12 Drama Skills, 5 NovelToGame Skills, and the 2 user-invocable video Skills (`video-recap` and `video-reference`), all verified to resolve from `@oh-story/dsh/lib/` |
| Upstream integrity | Four `manifest.json` checks verify pinned commits, catalogs, per-file SHA-256 hashes, excluded scrapers and standalone dashboards, all 7 scripted-Skill Drama selftests (bytecode-free), the five `EP001` demo documents, NovelToGame's 5-Skill example-free bundle, and `video-recap` + `video-reference` parity |
| Plugin boundary | Recursive source and bundle checks confirm all `@deepseek-ai/*` imports remain inside `@oh-story/dsh` |
| Workspace safety | Unit tests cover Host/`Origin`/Fetch Metadata checks, `welcomeGuide` config endpoints, and media allowlists; packaged Chrome verifies traversal rejection, session-scoped reads, HTTP byte ranges, atomic CAS writes, and generated-game CSP script blocking |
| Editor concurrency | Versioned `GET`/`PUT` rejects stale saves; Chrome edits, saves, re-reads, resolves conflicts, and restores a real workspace file |
| File following | Tests cover DSH Step location data, nested running calls, streamed write/edit previews, pre-dispatch calls, creative path classification, periodic live workspace refreshes, and workbench switching |
| Markdown & JSONL | Component tests cover tables, task lists, fenced code, hidden HTML comments outside code, inert raw HTML, safe external links, and line-indexed JSONL summaries with per-line parse isolation |
| Workbench & tab controls | Unit and Chrome tests cover creative-project detection, blank-Session `WelcomeGuide` dismissal (`cordis.patch.yml` `welcomeGuide: false`) and `Plugins → @oh-story/dsh` re-enablement, collapsing back to stock DSH per workspace, and hiding/restoring individual workbench tabs per workspace across Sessions and reloads |
| Composer stability | Browser checks run `scrollIntoView()` and verify dynamic Composer clearance across wide, medium, and 500 px compact layouts |
| Dual workbench | Native smoke switches `小说` / `短剧`, opens all five creator-first document types, and exercises Markdown preview and source editing |
| Game Studio | Native smoke verifies Preview-left / Chat-right layout, isolated loopback-alias `localStorage` save/load across two workspace games (`smoke-game` and `smoke-game-alt`), explicit `载入新版本`, state preservation across tab/Chat/workbench switches, fullscreen focus return, 500×900 `制作 / 对话` switching, creative canvas editing, and the absence of any parallel QA tab |
| Video Studio | Unit and smoke tests cover project discovery, high-volume directory exclusions, segmented narration and preserved original-audio projection, validated source-range jumps, source/edited/final switching, explicit new-version loading, CAS narration edits, and host runtime preflight |
| Short-drama production | Unit and Chrome tests cover five-document parsing, `EP001` ↔ `EP002` episode isolation, infinite-canvas pan/zoom/fit/keyboard movement, cross-episode media reuse, prepare-only `/short-drama-produce` dispatch, Queue removal and active-Turn cancellation, `dispatched_unknown` handling, mixed still/video `/short-drama-edit` composition, and 500 px layout bounds |
| Media adapters | Unit tests pin the five bundled adapters against upstream `provider_adapters.py` and `builtin-providers.md`, verify `seedance`/`minimax-h3` default `reference_audio` admission versus explicit `reference_roles` on custom configs, and confirm preflight endpoints expose variable presence only |
| Agent production intents | Packaged smoke executes `oh_story_production` in a live DSH turn, renders its compact tool card, and replays semantic target focus without granting cosmetic canvas control |
| Roles and hooks | Real Cordis Fiber contract tests and packaged DSH runs verify `oh_story_role` dual-shape child activation, `oh_story_bundled_reference` allowlist reads and shadow rejection, outline pre-write guards, `chapter-extractor` write fencing, and Tracking reminders |
| Package contents | Build and tarball checks confirm all four knowledge sets, CommonJS checker compatibility, metadata, and license are packed while excluding tests, upstream examples, scrapers, and standalone dashboards |

`pnpm verify` discovers all `*.test.ts`, `*.test.tsx`, and `*.contract.test.ts(x)` files automatically rather than relying on hardcoded test counts.

## Contract evidence matrix

| Product contract | Deterministic evidence required on every PR | Credentialed observation |
| --- | --- | --- |
| `oh_story_role` service scope | Real Cordis Fiber contract tests plus packaged parent Agent → Role child → parent result flow | Official DeepSeek model completes multi-Role review |
| Chat anchor clearance | Chrome runs `scrollIntoView({ block: "end" })` in wide, medium, and compact layouts and confirms the target stays above the Composer | None; independent of model provider |
| Workspace and mutation hooks | Unit tests resolve named Agent services; packaged DSH exercises Session routes and native tool hooks | Sample projects remain unchanged during read-only review |
| Provider compatibility | Not used as a PR gate | Manual `Real Provider` workflow must finish `EXECUTED_AND_PASSED`; `SKIPPED_NO_CREDENTIAL` fails |

## Native DSH Web audit

`pnpm test:dsh` sets up an isolated DSH home and profile, packs `@oh-story/dsh`, installs the tarball via `dsh plugin --profile web add`, and launches official DSH Web against a local Anthropic-Messages-compatible fixture server (redirecting DSH's first-use Documents folder into the temp root so nothing touches the real home directory). It stages the pinned Oh Story (`让你管账号，你高燃混剪炸全网`) and Drama Skills (`让你管账号`) sample workspaces alongside two test workspace games (`smoke-game` and `smoke-game-alt`) and a `smoke-recap` video project. The Chrome suite verifies:

- 14 Oh Story Skills, 12 Drama Skills, 5 NovelToGame Skills, and the 2 user-invocable video Skills (`video-recap` and `video-reference`), all loaded from the installed plugin bundle;
- Session-scoped workspace reads, a 20-writer atomic CAS race, stale-write rejection, and path-traversal rejection;
- allowlisted media discovery, read-only byte-range streaming, and media traversal rejection through the active Agent `FileSystem`, using two 941×1672 keyframes and a 5-second 704×1280 seekable MP4;
- malformed project metadata isolation without breaking workspace loading;
- Browser module loading and official UI slot registrations (`shell.overlay`, `plugins.bundle.config`, `tool.call.toolview`);
- streamed `write` tool following in the file tree and editor across DSH's pre-dispatch window, disk reconciliation, human-draft conflict protection, and Chat file-link navigation;
- end-to-end `oh_story_role` execution (`narrative-writer` child reading a pinned `story-setup` reference via `oh_story_bundled_reference` and returning to the parent Session);
- first-launch `WelcomeGuide` rendering on blank default-workspace Sessions, 500 px viewport containment, persistent dismissal into `profiles/web/cordis.patch.yml` (`welcomeGuide: false`), re-enabling from `Plugins → @oh-story/dsh`, and automatic retirement once a conversation starts;
- per-workspace **Workbench settings** tab hiding, last-tab protection, Session A/B/A sharing, reload persistence, workspace isolation, and **Show all** restoration, alongside collapsing and reopening the whole workbench;
- `小说` / `短剧` switching, recursive directory trees, five-document exclusivity, and safe Markdown preview (including hidden HTML comments outside code);
- `游戏` live iframe input, CSP inline-script blocking, loopback-alias `localStorage` save/restore, explicit new-build loading, runtime preservation across tab/Chat/workbench switches, 500×900 `制作 / 对话` switching, creative canvas keyboard movement, and no QA tab;
- `视频` empty-state runtime preflight, source/edited/final switching, segmented narration navigation, and explicit new-version loading;
- two isolated short-drama episodes (`EP001` ↔ `EP002`), infinite-canvas pan/zoom/fit and node dragging, cross-episode media-library reference picking, prepare-only `/short-drama-produce` dispatch, Queue removal and active-Turn cancellation, late partial-batch backfill, `oh_story_production` focus replay, and mixed still/video `/short-drama-edit` assembly;
- desktop and 500 px three-column geometry, fixed Composer positioning during long-reply scrolling, and bottom-anchor clearance.

Setting `OH_STORY_GAME_E2E_DIR` or `OH_STORY_DRAMA_E2E_DIR` writes fresh browser screenshots during the run. `pnpm demo` (with `pnpm demo:{story,drama,game,video}` filters) records the four README showcase animations from official DSH Web using `DEEPSEEK_API_KEY` and `ffmpeg`, or from local fixtures when `OH_STORY_DEMO_MOCK=1` is set; credentials stay process-only and are redacted from logs.

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
