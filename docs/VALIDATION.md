# Validation

Target: DeepSeek Harness `0.1.2-alpha.3` · validated 2026-09-01.

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
| Capability catalog | Native DSH Session exposes 13 Oh Story Skills, 10 Drama Skills, 7 NovelToGame Skills and the 2 user-invocable video entries; provider tests retain all 6 upstream video Skills |
| Upstream integrity | Four knowledge manifests verify pinned commits, catalogs, every bundled file hash, portable-source exclusions and the Drama 0.6 creator-first contract; all 10 bundled Drama selftests run without bytecode writes, the five demo documents verify recorded fixture hashes, NovelToGame parity covers the playable `jin-ping-mei` build, its six-check PASS record and authoring-material exclusions, and video-recap parity requires the complete six-Skill pipeline plus its orchestrator/inspect entry points |
| Plugin boundary | Host bundle and source audit keep all DSH imports inside `@oh-story/dsh` |
| Workspace safety | Unit tests cover Host/Origin/Fetch Metadata trust and creative media allowlists, while the packaged route rejects traversal and exercises session-scoped reads, media byte ranges and atomic writes; generated-game CSP is browser-probed to reject workspace API access outside the preview asset prefix; child-session, absolute-path and symbolic-link negative cases remain follow-up contracts |
| Editor concurrency | Versioned GET/PUT rejects stale saves; Chrome edits, saves, rereads and restores a real workspace file |
| File following | Tests cover DSH Step location data, nested running calls, streamed write/edit previews, creative path classification and workbench switching |
| Markdown rendering | Component tests cover tables, task lists, fenced code, inline formatting, safe links and inert raw HTML |
| JSONL rendering | Component tests cover typed record summaries, source line numbers, scalar records and per-line parse failures |
| Three-column layout | Native DSH Chrome smoke checks ordered tree/editor/Chat geometry and minimum usable widths |
| Conversation ownership | Unit tests cover creative-project detection, the bundled example exclusion, explicit-choice precedence and unusable browser storage; native smoke runs a workspace with no creative project, asserts DSH's own conversation layout survives, watches the first Agent-written creative file hand the layout over, collapses the workbench back to the official layout inside the conversation column, and requires the collapsed choice to hold in a new Session of the same workspace |
| Composer stability | Browser interaction contracts run `scrollIntoView()` and verify dynamic Composer clearance in wide, medium and 500 px compact layouts |
| Dual workbench | Native smoke switches 小说/短剧, opens all five creator-first document types, and exercises Markdown preview/source modes |
| Game Studio | Native smoke verifies Preview-left/Chat-right geometry, real iframe input, explicit new-version loading, state preservation across Preview/project-file, compact Studio/Chat and 小说/游戏 switches, fullscreen focus return, the absence of QA UI, the bundled Jin Ping Mei opening, and a non-clipping 500 px layout even when the host drawer remains open |
| Video Studio | Unit tests cover project-root validation, high-volume artifact exclusion, full/cut pause projection, source/edited/final selection and standards-compliant byte ranges; packaged catalog and tarball checks cover all six Skills |
| Compact Game Studio | Chrome runs the game-specific surface at 500×900, checks tab/tabpanel relationships and horizontal containment, enters a Composer draft in Chat, returns to the same live game state, and emits screenshot evidence |
| Short-drama production | Unit tests cover document parsing, episode isolation, prompt authority, cross-episode image-reference filtering, media-typed version selection, DSH Queue/current-Turn classification, dispatched-unknown safety, jobs, versions and sequence logic; packaged Chrome checks two-episode switching, per-episode task/reference/canvas isolation, project-media search/reuse, concurrent submit/remove/cancel semantics, late partial-batch reconciliation, successful composition backfill, version selection, sequence reorder/blockers, creator keyboard canvas movement, Agent semantic focus, native Conversation dispatch, realistic image/MP4 backfill and 500 px containment |
| Agent production operability | The packaged fixture model calls the registered `oh_story_production` tool in a real DSH turn; the durable successful call is rendered by the plugin tool view and focuses the requested EP001 production target without granting cosmetic canvas control. Unit tests reject traversal, duplicate sequence IDs, failed calls and malformed replay payloads. |
| Roles and hooks | Real Cordis Fiber contracts cover plugin-runtime capture, `Context.get()` fallback and missing-runtime failure; packaged DSH deterministically completes one child-Agent Role invocation; unit contracts cover pinned reference reads, path escape and scoped-shadow rejection |
| Package contents | Build and pack include all four pinned knowledge sets, the Jin Ping Mei playable build and QA record, package metadata and license while omitting source tests and the standalone Drama Dashboard |

The gate discovers all `*.test.ts` and `*.contract.test.ts` files. Coverage claims below are tied to executable behavior, not a manually maintained test-count snapshot.

## Contract evidence matrix

| Product contract | Deterministic evidence required on every PR | Credentialed observation |
| --- | --- | --- |
| `oh_story_role` service scope | Real Cordis Fiber contract tests plus packaged parent Agent → Role child → parent result flow | Official DeepSeek model follows the complete review workflow |
| Chat anchor clearance | Chrome performs `scrollIntoView({ block: "end" })` in wide, medium and compact layouts and checks the target remains above the Composer | None; provider behavior is irrelevant |
| Workspace and mutation hooks | Unit tests resolve named Agent services; packaged DSH exercises Session routes and native tool execution | Real projects remain read-only during review |
| Provider compatibility | Not used as deterministic correctness evidence | The Real Provider workflow must report `EXECUTED_AND_PASSED`; `SKIPPED_NO_CREDENTIAL` is not a pass |

## Native DSH Web audit

`pnpm test:dsh` creates an isolated DSH installation and profile, packs `@oh-story/dsh`, installs the tarball through `dsh plugin --profile web add`, and starts the official Web UI. It copies the pinned public demo projects from Oh Story (`让你管账号，你高燃混剪炸全网`) and Drama Skills 0.6 (`让你管账号`) into temporary workspaces, creates a minimal workspace game, and loads the pinned NovelToGame Jin Ping Mei example. The Chrome pass verifies:

- 13 Oh Story Skills, 10 Drama Skills, 7 NovelToGame Skills and the 2 upstream user-invocable video entries in the Session catalog; provider tests cover all 6 bundled video Skills;
- Session-scoped workspace reads, a 20-writer atomic CAS race, stale-write rejection and path-traversal rejection;
- allowlisted media discovery, read-only byte-range preview and media path-traversal rejection through the current Agent FileSystem, using two alternate 941×1672 generated keyframes and a real 704×1280 five-second seekable MP4 rather than one-pixel placeholders;
- invalid project metadata isolation without taking down the workspace;
- published Browser module and official UI slot registrations;
- a real DSH Agent `write` tool call, incremental editor content, authoritative disk reconciliation and official tool-file navigation;
- a deterministic `oh_story_role` call that starts a packaged `story-explorer` child, returns its result to the parent and completes the parent turn;
- 小说/短剧 navigation, recursive project directories, creator-first five-document exclusivity and Markdown rendering;
- 游戏 defaults to real-time Preview, keeps the playable iframe left of the wider official Chat, executes workspace-game input, preserves the same runtime across Preview/project-file switching, switches projects, enters the Jin Ping Mei first day, and restores focus after fullscreen;
- Game Studio exposes no QA tab, scorecard, badge or QA screenshot; the six-check artifact contract remains covered by parity, Host API assertions and packaged automation;
- at 500×900 the game-specific `制作 / 对话` switch preserves both iframe state and Composer usability without horizontal clipping;
- two isolated creator-first episodes, including production projection rebuilds, EP-local tasks, versions, selections, sequence and canvas coordinates when switching EP001 ↔ EP002;
- direct `oh_story_production` execution by the fixture Agent, durable semantic-focus replay and navigation isolation; cosmetic canvas coordinates remain creator-controlled Session state;
- a searchable project media library and explicit EP001 → EP002 image-reference reuse without duplicating prompt editing inside production cards;
- running + queued submissions, exact Queue removal, current-Turn cancellation with the remaining Queue preserved but not auto-executed, and a late real MP4 that upgrades a completed batch from 0/8 to an explicit 1/8 partial result without a render loop;
- a fully populated eight-video sequence that enables composition, dispatches the ordered native composition request, and becomes completed only after a task-ID-linked MP4 appears in the Agent FileSystem;
- the short-drama production shot board, two-version selection and restoration, image-only reference resolution, video-only sequence resolution, asset board, missing-video sequence reorder/blockers, relationship canvas, keyboard layout movement, native `/short-drama-produce` Conversation dispatch, realistic image/video version backfill and cross-document source navigation;
- blank-session mounting, Session-switch draft recovery, source editing, conflict isolation and saved-state behavior;
- ordered tree/editor/Chat geometry at desktop and 500 px widths, a Composer that remains fixed during long-message scrolling, and anchor clearance in wide, medium and compact layouts.

When `OH_STORY_GAME_E2E_DIR` is set, the same pass emits game evidence screenshots. The checked-in evidence is `docs/images/game-studio-jin-ping-mei.png` and the 500×900 `docs/images/game-studio-compact.png`.

The same audited surface generates all four README demos. One pass captures every workbench, so `pnpm demo` renders the complete set and `pnpm demo:story`, `pnpm demo:drama`, `pnpm demo:game` and `pnpm demo:video` only narrow which GIFs get written. Demo commands require `DEEPSEEK_API_KEY` and `ffmpeg`, use the real `deepseek-official` provider, wait for successful assistant turns, collapse the DSH navigation rail, and record the complete workbench/Chat surface. `OH_STORY_DEMO_MOCK=1` re-renders the same surfaces from the deterministic fixtures without a provider key. The API key is process-only and is redacted from captured failure logs.

## Real DeepSeek observation

The 2026-08-25 release observation used `deepseek-official/deepseek-v4-flash` against the packed plugin:

- `story-review` completed with 2 required `oh_story_role` calls and 17,384 durable Session events;
- `short-drama-review` completed with 8,606 durable Session events;
- both sessions produced durable assistant output;
- the combined fiction/short-drama project digest remained unchanged;
- the API credential did not appear in captured DSH logs.

Event totals are observations, not fixed assertions.

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
