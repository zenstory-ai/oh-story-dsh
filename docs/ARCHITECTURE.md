# Architecture

oh-story-dsh is a Cordis plugin loaded into DeepSeek Harness. The repository ships one product package, `@oh-story/dsh`, with Host and Browser entries.

## Ownership

| Surface | Owner |
| --- | --- |
| Workspace, Session and durable history | DeepSeek Harness |
| Agent loop, provider, model and credentials | DeepSeek Harness |
| Preset, sandbox, tools, permissions and approvals | DeepSeek Harness |
| Chat, Trajectory, Todo and Composer | DeepSeek Harness conversation UI |
| Novel craft and specialist personas | Pinned Oh Story Skills and Roles |
| Short-drama workflow and project contracts | Pinned Drama Skills |
| Interactive-game workflow and artifact contracts | Pinned NovelToGame Skills |
| Creative file tree, editor, game preview and file following | `@oh-story/dsh` Browser contribution |

## Host entry

The Host entry registers seven contributions in the current Cordis context:

1. An `oh-story` Skill provider for 13 pinned novel Skills.
2. A `short-drama` Skill provider for 10 pinned Drama Skills.
3. A `novel-to-game` Skill provider for 7 pinned game-production Skills.
4. The `oh_story_role` tool, backed by DSH's `spawn` provider and bounded by the caller's visible tools.
5. The read-only `oh_story_bundled_reference` tool for exact, pinned Role craft references.
6. `tools/pre-execute` and `tools/post-execute` hooks for long-form outline and Tracking checks.
7. A Session-scoped creative file and game-preview route.

All three providers prepend a small DSH bridge at load time. The bridge maps upstream platform integration points to the current Session, tools, approvals and UI while leaving craft instructions and references intact. The short-drama bridge fixes the Drama Skills 0.6 creator-first boundary: episodes keep only the requested subset of up to five creator-facing Markdown documents, no empty documents or nominal stages are backfilled, persisted reviews remain readable Markdown while oral reviews write nothing, production keeps the exact-job confirmation contract, and legacy v0.5 structured projects are never migrated in place. The NovelToGame bridge keeps `game-adaptations/<project>` as the project root, `build/app/index.html` as the playable authority and `qa/verification.json` as the six-check QA authority. Bundled legacy validators remain maintenance resources and do not reactivate the old JSON/JSONL workflow.

Specialist Roles preserve their upstream structured file tools and intersect them with the calling Agent's visible DSH tools. Roles that reference shared `story-setup` craft material receive only the plugin's `oh_story_bundled_reference` reader when it is visible. The reader exposes an allowlist built from the pinned package, resolves every file canonically inside that package, rejects path escape, and fails closed if a scoped same-name tool shadows it; project Skills can therefore neither redirect Role references nor inject replacement instructions. Roles never probe `.claude`, `.codex` or other deployment directories.

The prose guards and file route resolve the live Agent and use that Agent's DSH `FileSystem`, so their view of the workspace matches native tools under local, sandboxed and remote providers. The route first applies the same Host, Origin and Fetch Metadata trust boundary as DSH's native browser API, then uses the Agent filesystem and sandbox policy for resolution, containment, reads and atomic `replaceIfVersion` writes. Editable access remains limited to documented novel, short-drama and game project directories. Loopback is trusted by default; explicit non-loopback authorities must be declared through the plugin's `trustedHosts` config. Child Sessions do not receive an editor route.

Playable game assets are served from workspace `build/app` directories or the bundled example through a separate content route. Every path is canonically contained, files are size-limited and HTML receives a restrictive CSP. On loopback, the Browser swaps `127.0.0.1` and `localhost` for the iframe origin, preserving same-origin storage inside a game while isolating generated scripts from the DSH application origin. The fallback sandbox omits `allow-same-origin` when an alternate origin is unavailable.

## Browser entry

The Browser entry uses two official extension slots:

| Slot | Contribution |
| --- | --- |
| `shell.overlay` | Declares the Session-scoped three-column creative workbench seat |
| `tool.call.toolview` | Compact `oh_story_role` invocation view |

The bridge portals its workbench into the stable `conversation.session` layout seam. 小说/短剧 retain the file-tree/editor/Chat three-column surface. 游戏 switches to a focused two-column surface: the generated-game preview owns the larger left region and the mounted official conversation remains the right region, so Chat state, streaming, tools, Todo, approvals, history and Composer continue to use DSH implementations.

Game Studio discovers workspace projects from `game-adaptations/*`, fingerprints `build/app`, retains the current playable version during an Agent build, and exposes only Preview plus read-only project-file inspection. The Game Studio and Preview panel stay mounted while project files, Chat, or the same Session's 小说 workspace are visible, preserving the live iframe and player state. A new digest is never loaded merely because the iframe lost focus; the creator explicitly chooses `载入新版本`. Narrow layouts show either Studio or Chat at a time instead of shrinking the playable surface below a usable width; both regions and their drafts remain mounted.

QA remains invisible infrastructure. NovelToGame Skills, packaged QA artifacts and automated gates retain the six-check contract, while Game Studio intentionally renders no QA tab, pass/fail cards, badge or release score. The upstream schema has no build digest, so the Host-side API never guesses that an imported PASS belongs to the current preview: it reports that record as `UNBOUND`, binds an observed QA revision to its preview digest, and changes the binding to `STALE` when the preview digest moves. The immutable bundled example is `PINNED`.

The overlay declares a strict Session child slot, so DSH supplies `sessionId`, `useSession` and a per-Session workbench Store without manual Session subscriptions. DSH intentionally omits a tool-only Assistant from the visible Chat `partial`; its official Step location data still publishes that Assistant's streamed blocks, which the Browser reads from `chat.timeline`. Executing and nested tools come from `runningCalls`. The Browser restricts both sources to supported creative paths and projects them over the last disk version. Once a tool settles, the workspace route is the authority again. The file tree preserves every project directory level; selection changes also switch the 小说/短剧 mode and expand the matching group plus all ancestor directories.

When the Agent is idle, a capture listener recognizes existing workspace file links inside the official conversation. Those links update the same selection state used by Agent file following. Human-dirty buffers take precedence over incoming disk or Agent state and surface a per-file conflict with explicit disk/local resolution. DSH's unpersisted Session Store retains drafts and editor navigation across in-process Session switches and releases them with the Session lifecycle. File reads carry the opaque DSH filesystem version; saves use that version as an atomic precondition and reject stale writes instead of overwriting concurrent disk changes.

Markdown rendering is implemented as a safe React element tree with tables, task lists, quotes and fenced code. Raw HTML is treated as text and external links are limited to HTTP(S). JSONL is parsed one record per source line, keeps malformed lines visible, and summarizes stable IDs, types and statuses. Every preview shares its buffer and save path with source editing.

## Upstream assets

`packages/knowledge/oh-story/manifest.json` pins the Oh Story release, commit, 13 Skills, 7 Roles, agents version and every file hash. `packages/knowledge/drama/manifest.json` performs the same role for 10 Drama Skills. `packages/knowledge/novel-to-game/manifest.json` pins NovelToGame 0.3.0, all 7 Skills and the complete playable `jin-ping-mei` example.

The Drama Skills standalone dashboard server and assets are omitted during synchronization because the creator surface is supplied by the DSH workbench. Oh Story's login/CDP rank scrapers and platform deployment helpers are also excluded; the two scan Skills use DSH-native, visible-tool research instructions instead. Synchronization rejects Python bytecode, `__pycache__` and `.DS_Store` workspace pollution before manifests are generated. Remaining workflow, reference, validation and production-adapter resources are packaged with their upstream paths.

## Release boundary

The build produces Host and Browser bundles under `packages/dsh-plugin/lib`, copies all three knowledge sets, and rejects known parallel-runtime markers. Generated `lib` and tarballs are release artifacts and are excluded from Git history.
