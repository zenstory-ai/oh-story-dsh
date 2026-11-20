# Architecture

`oh-story-dsh` is a Cordis plugin loaded into DeepSeek Harness (DSH). The repository ships one product package, `@oh-story/dsh`, with Host and Browser entries.

## Ownership

| Surface | Owner |
| --- | --- |
| Workspace, Session, and durable history | DeepSeek Harness |
| Agent loop, provider, model, and credentials | DeepSeek Harness |
| Preset, sandbox, tools, permissions, and approvals | DeepSeek Harness |
| Chat, Trajectory, Todo, and Composer | DeepSeek Harness conversation UI |
| Novel craft and specialist personas | Pinned Oh Story Skills and Roles |
| Short-drama workflow and project contracts | Pinned Drama Skills |
| Interactive-game workflow and artifact contracts | Pinned NovelToGame Skills |
| Video-recap workflow and artifact contracts | Pinned video-recap Skills |
| Creative file tree, editor, production projection, game/video preview, and file following | `@oh-story/dsh` Browser contribution |

## Host entry

The Host entry registers nine contributions in the current Cordis context:

1. An `oh-story` Skill provider for 14 pinned novel Skills.
2. A `short-drama` Skill provider for 12 pinned Drama Skills.
3. A `novel-to-game` Skill provider for 5 pinned game-production Skills.
4. A `video-recap` Skill provider for the 2 pinned video Skills (`video-recap` and `video-reference`), both user-invocable.
5. The `oh_story_role` tool, backed by DSH's `spawn` provider and bounded by the caller's visible tools.
6. The read-only `oh_story_bundled_reference` tool for exact, pinned Role craft references.
7. The side-effect-free `oh_story_production` UI-intent tool for semantic production focus, explicit sequence order, and Agent-owned job projection. Cosmetic canvas layout stays creator-controlled Session state.
8. `tools/pre-execute` and `tools/post-execute` hooks for long-form outline and Tracking checks, plus a write fence limiting any `chapter-extractor` Role child to its `_analysis_cache/输入-{批次ID}.md` batch file (identified from the Role label DSH persists in `subagent/descriptor`).
9. A Session-scoped creative file route for Markdown, text, JSON, JSONL, and previewable production media, plus separate game-preview, video-preflight, drama-preflight, and config routes.

DSH `0.2.1-alpha.1` dropped the earlier invariant export and split Composer statistics into separate projections; the plugin imports neither removed export nor retired Composer slots. Tool-call following accepts the `args-preparing` lifecycle before final arguments arrive while preserving the `0.2.0-rc.2` path.

Development and default packaged integration target DSH `0.2.2-rc.1` (npm `latest`) with Cordis `4.1.0` and Schemastery `3.19.0`. Packaged release checks also cover `0.2.0-rc.2` and the `0.2.2` trial line on `0.2.2-rc.3` (npm `next`). `engines.dsh` (read by `0.2.1+` hosts) and the DSH `peerDependencies` (used by older hosts) declare `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-alpha.1 <0.2.2-0 || >=0.2.2-alpha.2 <0.2.3-0`; each prerelease line needs its own comparator set because semver matches prereleases only against bounds on the same `major.minor.patch`. Cordis and Schemastery peers accept `^4.0.4` / `^3.18.4` (covering `4.1.0` / `3.19.0`) alongside the `4.0.5` / `4.0.6` and `3.18.5` / `3.18.6` alphas shipped by earlier hosts. DSH `0.2.2-rc.2` flattened subagent activation fields (`parent`, `prompt`, `maxDepth`) onto the spec itself instead of nested `request`; `oh_story_role` sends both shapes so old and new hosts each read the form they expect.

All four Skill providers prepend a concise DSH bridge at load time. Each bridge maps upstream host integration points to the active DSH Session, tools, approvals, and UI while leaving upstream craft instructions and references untouched:

- **Short drama** keeps the creator-first boundary: each episode stores only the requested subset of up to five Markdown files (`剧本.md`, `视觉设定.md`, `分镜.md`, `图片提示词.md`, `视频提示词.md`), without backfilling empty files or unrequested stages; persisted reviews are written as readable Markdown while oral reviews write nothing; paid runs require explicit confirmation; and legacy v0.5 structured projects stay untouched in place. Downstream assembly (`short-drama-edit`) writes `剪辑单.md`—recording kept and unused footage, cut timing, post-processing, and delivery specs without becoming a sixth source of creative truth—and renders to `剧集/<EP>/制作成果/成片/` in the active DSH execution environment. `ffmpeg` + `libass` stays the default burned-subtitle path because the optional Remotion path installs Node packages and renders every frame in a headless browser. `edit_tool.py` blocks unaccounted `MOTION` or `GROUP` entries unless listed on `未采用镜头`, auto-scales and converts frame rates for same-aspect-ratio clips, and rejects mismatched aspect ratios; any external mix must re-run two-pass loudness normalization before replacing `成片.mp4` and running `verify`.
- **NovelToGame** keeps `game-adaptations/<project>` as the project root, `build/app/index.html` as the playable entry, and `qa/verification.json` as the six-check QA record.
- **Video recap** keeps projects under `video-recaps/<project>` with `work/` as the upstream working directory, leaves upstream manifests and timelines authoritative, and keeps API keys in process environment only—adding no second Agent runtime, render queue, project database, or timeline store.

Specialist Roles intersect their upstream tool lists with the calling Agent's visible DSH tools. Roles that read shared `story-setup` craft material receive only `oh_story_bundled_reference` when visible; that reader serves a canonical allowlist inside the pinned package, rejects path traversal, and fails closed if shadowed by a scoped same-name tool so project Skills cannot redirect or inject Role instructions. Roles never inspect `.claude`, `.codex`, or other external host directories.

Both prose hooks and workspace routes resolve the active Agent and read or write through its DSH `FileSystem` and sandbox policy, matching native tool behavior across local, sandboxed, and remote environments. Every `/oh-story` request first passes Host, `Origin`, and Fetch Metadata checks aligned with DSH's native browser API. Editable writes use atomic `replaceIfVersion` preconditions and are restricted to documented creative paths; child Sessions receive no editor route. Loopback origins are trusted by default, while non-loopback deployments must list authorities in `trustedHosts`. Media previews are read-only and extension-allowlisted: real files inside the host-visible workspace stream HTTP byte ranges without buffering whole files, while non-local backends use DSH's bounded byte API with a 256 MiB cap (malformed `Range` headers are ignored per RFC 9110, and only unsatisfiable ranges return `416`).

The Host `Config` also declares volatile `welcomeGuide` (default `true`), disables DSH's auto-generated settings card (`settings.configure({ auto: false })`) in favor of the Browser's `plugins.bundle.config` switch, and exposes live `welcomeGuide` state on `/oh-story/workspace` and `/oh-story/config`.

Playable game builds are served from workspace `build/app` directories through a dedicated content route with canonical path containment, per-file size limits, and a restrictive HTML CSP. On loopback, the Browser swaps `127.0.0.1` and `localhost` for the preview iframe so each game keeps working `localStorage` on an isolated origin away from DSH; when no alternate origin is available, the fallback iframe sandbox omits `allow-same-origin`. Because an iframe fires `load` even on HTTP error pages, the Browser probes the same build URL on its own origin and prioritizes in-progress Agent writes or newer waiting builds over transient probe errors.

## Browser entry

All four workbenches share a **Workbench settings** dialog beside the mode tabs. All four tabs show by default; creators can hide unused tabs per workspace in browser storage (keeping at least one visible) or restore all tabs in one click. Hiding the active tab switches to the first remaining tab, and startup discovery, file following, and production focus leave hidden tabs closed. Visibility preferences affect navigation only—files, unsaved buffers, Skills, active jobs, and mounted media stay untouched. The dialog also clarifies that DSH chat models and credentials are separate from external media APIs, without adding a credential store or mutating host settings.

The Browser entry registers three official DSH slots:

| Slot | Contribution |
| --- | --- |
| `shell.overlay` | Mounts the Session-scoped creative workbench beside native Chat |
| `plugins.bundle.config` | Renders the `@oh-story/dsh` blank-Session welcome-guide switch on the Plugins page |
| `tool.call.toolview` | Compact cards for `oh_story_role` and `oh_story_production` calls |

The workbench stays out of the way in coding workspaces. It claims the conversation layout only when a Session's workspace holds creative files—long-form novel folders (`正文/`, `大纲/`, `设定/`, `追踪/`, `对标/`, `参考资料/`), short-story root files (`正文.md`, `设定.md`, `小节大纲.md`), short-drama folders or `short-drama.json`, a `game-adaptations/*` project, or a `video-recaps/*` project. New Sessions start on `小说` and switch once per workspace to the first populated workbench if `小说` is empty.

In a blank Session with no creative files, `WelcomeGuide` renders only while `welcomeGuide` is enabled. It explains that existing creative folders open the workbench under any preset while starting a new project via `/story` and sibling Skills requires a skill-enabled preset (`Standard` or `PTC`, as `Minimal` skips skills), and provides a one-click dismiss button backed by DSH `configForms` (`oh-story.welcomeGuide` in `cordis.patch.yml`, falling back to browser storage on profileless hosts, with a toggle in `Plugins → @oh-story/dsh`). Once the first turn starts or `welcomeGuide` is turned off, non-creative workspaces render nothing at all, leaving stock DSH Chat, Composer, `Ctrl/Cmd+S`, and file links untouched until an Agent writes the first creative file. Creators can also collapse the workbench back to stock DSH at any time, leaving a small corner launcher and remembering that choice per workspace across reloads and restarts.

When open, the workbench portals into `conversation.session`. `小说` and `短剧` use a file-tree / editor-or-canvas / native-Chat layout; `游戏` and `视频` pair a wide preview/canvas/documents studio on the left with native DSH Chat on the right (switching to a single `制作 / 对话` pane on narrow viewports without unmounting either side).

- **Video Studio** provides `预览 / 创作画布 / 文稿` without bundling a nonlinear editor. Discovery reads an allowlist of upstream artifacts while skipping frame, ASR-chunk, cache, and TTS-segment folders. Segmented narration and preserved original-audio beats are read directly from authored files, keeping output and source clocks separate and enabling source jumps only when validated clip mappings exist. The player switches among source, `edited_source.mp4`, and final output, stays mounted across tabs, and waits for explicit user confirmation before loading newly generated versions. Segment edits update `narration.json` through shared CAS buffers without altering timestamps or regenerating existing voiceover. `制作详情` surfaces run manifests and host preflight status (Python, `ffmpeg`/`libass`, `ffprobe`, and key presence only; `scripts/doctor.py` remains authoritative inside the Agent's execution environment).
- **Game Studio** discovers projects under `game-adaptations/*`, fingerprints `build/app`, and offers `试玩 / 创作画布 / 文稿`. The canvas maps authored design Markdown and the playable build without forcing a rigid stage wizard. Both the sandboxed preview iframe and native Chat stay mounted across tab and workbench switches, and new builds wait for the creator to click `载入新版本`. Playtest feedback goes directly into native Chat; any legacy `PLAYTEST_NOTES.md` remains editable under ordinary project files. Automated QA stays in `/game-qa` and `qa/verification.json` without a separate QA tab or badge.
- **Short-drama Studio** parses each episode's existing five Markdown files into an in-memory `short-drama/v1` projection keyed by stable IDs, surfacing line-numbered diagnostics for duplicate IDs, missing sources, or malformed prompt blocks instead of guessing. Episode switches isolate jobs, active version picks, manual cross-episode image references, sequence order, and canvas coordinates per episode directory without writing a sidecar database. Preparing an image or video card sends a prepare-only `/short-drama-produce` prompt through `ConversationController`; jobs stay `awaiting_confirmation` until the creator approves the preview in Chat and the Agent registers that same job ID via `oh_story_production`. Queue removal and active-turn cancellation delegate to DSH's official Conversation APIs. Completed paid turns without matching output files settle as `dispatched_unknown` rather than auto-retrying, while local composition turns surface `edit_tool.py check` blockers. `oh_story_production` replays durable tool calls idempotently to focus targets, set shot order, or track running jobs, with zero file, network, or billing side effects.

Live file following reads streamed tool blocks from `chat.timeline` (including tool-only Assistant steps omitted from `partial`) and `runningCalls`, projecting creative writes over the last disk snapshot until the tool settles and re-listing the workspace every few seconds while the Session runs so Role-child and script writes appear promptly. Clicking creative file paths in idle Chat opens them in the workbench. Human-edited buffers take precedence over incoming Agent or disk updates, raising an explicit per-file conflict prompt on version mismatch rather than overwriting unsaved work. Markdown and JSONL previews share buffers and atomic save paths with the source editor; Markdown renders safely in React (hiding HTML comments outside code blocks, treating raw HTML as text, and restricting external links to `http`/`https`).

## Upstream assets

- `packages/knowledge/oh-story/manifest.json`: Oh Story `0.10.5` (`41a9b6c855d7d29a2bf214b4eefda2b10a0e8afb`), 14 Skills, 7 Roles, `agents_version` 44, and per-file SHA-256 hashes. Author-memory scripts (`scripts/author_memory_commit.py`) stay owned by `story-long-write` and `story-short-write`; `story` routes memory requests there, while standalone `story-review` and `story-deslop` neither read nor write author memory.
- `packages/knowledge/drama/manifest.json`: Drama Skills `0.12.1` (`37232f6d22e174c36e321d2e3a1a3ae871e7d602`), 12 Skills, 7 scripted-Skill selftests, and per-file hashes. Character-bound `reference_audio` is validated before submission (`seedance` and `minimax-h3` accept it by default; custom external configs must declare `reference_roles`), and mixed static/video sequence assembly preserves `SHOT`/`IMG` still versus `MOTION`/`GROUP` video source identity.
- `packages/knowledge/novel-to-game/manifest.json`: NovelToGame `0.9.0` (`48328cd756cd400e617e97dc3bd5c4b42cda3f72`), 5 Skills and per-file hashes; upstream example games are excluded to keep the package lightweight.
- `packages/knowledge/video-recap/manifest.json`: video-recap-skills `0.7.1` (`36df69fe9e702dc2f15ccd05fac878ad623cf346`), `video-recap` and `video-reference` (both user-invocable), final QC schema 2 (`over_budget` lint-only, external `.srt` fallback when `libass` is absent), and per-file hashes.

Synchronization excludes standalone upstream web servers and host-specific deployment glue that DSH replaces: Drama Skills' `dashboard_server.py`, dashboard assets, and `creator_views.py`; `video-recap-skills`'s `dashboard_server.py` (审片台), `scripts/dashboard/`, and `assets/dashboard/` (keeping `library.py` and project-binding scripts); and Oh Story's login/CDP rank scrapers and `story-setup` platform deployers (`deploy-*.md`). Sync scripts also reject `__pycache__`, bytecode, and `.DS_Store` before writing manifests.

## Product boundaries

Each workbench projects its pinned upstream contract without becoming a competing source of project state:

- **Short drama** reads only the episode's authored Markdown files and workspace media, reporting duplicate IDs and broken cross-file links by line number without pre-creating empty files or backfilling unrequested stages.
- **Game Studio** leaves automated verification in `/game-qa` and `qa/verification.json`, adding no parallel QA tab, scorecard, or badge.
- **Video Studio** focuses on preview, segmented narration edits, and relationship mapping rather than multi-track timeline editing.
- **`oh_story_production`** updates UI focus, shot sequence order, and tracked job cards only; it never edits files, generates media, or substitutes for creator confirmation on paid jobs.
- **Bundled media fixtures** exist solely for offline UI regression tests and are never reported as live provider output.
- **Credential privacy**: short-drama and video preflight endpoints report only whether Python, `ffmpeg`/`libass`, `ffprobe`, and required environment variables are present on the DSH Host. Secret values never enter Skill text, browser responses, or project files. Built-in short-drama adapters (GPT Image 2, Seedance, MiniMax H3, MiniMax Music, MiniMax Speech) are registered in a credential-free host temp config unless overridden by `OH_STORY_DRAMA_ADAPTER_CONFIG`.

## Release boundary

`pnpm build` emits Host and Browser bundles under `packages/dsh-plugin/lib`, copies the four pinned knowledge sets with CommonJS-safe `package.json` boundaries for upstream scripts, and fails if excluded scrapers, standalone dashboards, development React builds, or parallel-runtime markers appear. Generated `lib/` artifacts and release tarballs stay out of Git history.
