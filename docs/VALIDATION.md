# Validation

Target: DeepSeek Harness `0.1.1-rc.1` · validated 2026-08-25.

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
| Capability catalog | Native DSH Session exposes 13 Oh Story Skills, 10 Drama Skills and 7 NovelToGame Skills |
| Upstream integrity | Three knowledge manifests verify pinned commits, catalogs and every bundled file hash; NovelToGame parity includes the complete playable `jin-ping-mei` example and six-check PASS record |
| Plugin boundary | Host bundle and source audit keep all DSH imports inside `@oh-story/dsh` |
| Workspace safety | Unit tests cover Host/Origin/Fetch Metadata trust, while the packaged route rejects traversal and exercises session-scoped reads plus atomic writes; generated-game CSP is browser-probed to reject workspace API access outside the preview asset prefix |
| Editor concurrency | Versioned GET/PUT rejects stale saves; Chrome edits, saves, rereads and restores a real workspace file |
| File following | Tests cover DSH Step location data, nested running calls, streamed write/edit previews, creative path classification and workbench switching |
| Markdown rendering | Component tests cover tables, task lists, fenced code, inline formatting, safe links and inert raw HTML |
| JSONL rendering | Component tests cover typed record summaries, source line numbers, scalar records and per-line parse failures |
| Three-column layout | Native DSH Chrome smoke checks ordered tree/editor/Chat geometry and minimum usable widths |
| Composer stability | Browser interaction contracts run `scrollIntoView()` and verify dynamic Composer clearance in wide, medium and 500 px compact layouts |
| Dual workbench | Native smoke switches 小说/短剧, opens all five creator-first document types, and exercises Markdown preview/source modes |
| Game Studio | Native smoke verifies Preview-left/Chat-right geometry, real iframe input, explicit new-version loading, state preservation across Preview/project-file, compact Studio/Chat and 小说/游戏 switches, fullscreen focus return, the absence of QA UI, the bundled Jin Ping Mei opening, and a non-clipping 500 px layout even when the host drawer remains open |
| Compact Game Studio | Chrome runs the game-specific surface at 500×900, checks tab/tabpanel relationships and horizontal containment, enters a Composer draft in Chat, returns to the same live game state, and emits screenshot evidence |
| Roles and hooks | Real Cordis Fiber contracts cover plugin-runtime capture, `Context.get()` fallback and missing-runtime failure; packaged DSH deterministically completes one child-Agent Role invocation; unit contracts cover pinned reference reads, path escape and scoped-shadow rejection |
| Package contents | Build and pack include all three pinned knowledge sets, the full Jin Ping Mei example, package metadata and license while omitting source tests and the standalone Drama Dashboard |

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

- 13 Oh Story Skills, 10 Drama Skills and 7 NovelToGame Skills in the Session catalog;
- Session-scoped workspace reads, a 20-writer atomic CAS race, stale-write rejection and path-traversal rejection;
- invalid project metadata isolation without taking down the workspace;
- published Browser module and official UI slot registrations;
- a real DSH Agent `write` tool call, incremental editor content, authoritative disk reconciliation and official tool-file navigation;
- a deterministic `oh_story_role` call that starts a packaged `story-explorer` child, returns its result to the parent and completes the parent turn;
- 小说/短剧 navigation, recursive project directories, creator-first five-document exclusivity and Markdown rendering;
- 游戏 defaults to real-time Preview, keeps the playable iframe left of the wider official Chat, executes workspace-game input, preserves the same runtime across Preview/project-file switching, switches projects, enters the Jin Ping Mei first day, and restores focus after fullscreen;
- Game Studio exposes no QA tab, scorecard, badge or QA screenshot; the six-check artifact contract remains covered by parity, Host API assertions and packaged automation;
- at 500×900 the game-specific `制作 / 对话` switch preserves both iframe state and Composer usability without horizontal clipping;
- blank-session mounting, Session-switch draft recovery, source editing, conflict isolation and saved-state behavior;
- ordered tree/editor/Chat geometry at desktop and 500 px widths, a Composer that remains fixed during long-message scrolling, and anchor clearance in wide, medium and compact layouts.

When `OH_STORY_GAME_E2E_DIR` is set, the same pass emits game evidence screenshots. The checked-in evidence is `docs/images/game-studio-jin-ping-mei.png` and the 500×900 `docs/images/game-studio-compact.png`.

The same audited surface generates the README demos through `pnpm demo` (both), `pnpm demo:story`, or `pnpm demo:drama`. Demo commands require `DEEPSEEK_API_KEY`, use the real `deepseek-official` provider, wait for successful assistant turns, collapse the DSH navigation rail, and record the complete tree/editor/Chat surface. The API key is process-only and is redacted from captured failure logs.

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
