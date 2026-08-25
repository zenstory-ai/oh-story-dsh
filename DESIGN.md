# Design

## Source of truth

- **Status:** Active. This is the implemented MVP design contract; Story and Short Drama behavior remains current-state unless this document explicitly says otherwise.
- **Last refreshed:** 2026-08-25
- **Primary product surfaces:** Story workspace, Short Drama workspace, proposed Game Studio workspace, DSH-native Conversation and Composer.
- **Target outcome:** Maintain a game-making panel that supports a tight prompt → build → play → diagnose → revise loop without duplicating DSH-owned chat, approval, agent, or session behavior.
- **Evidence reviewed:**
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `packages/dsh-plugin/src/client/index.tsx`
  - `packages/dsh-plugin/src/client/plugin.css`
  - `docs/images/oh-story-dsh-demo.gif`
  - `docs/images/short-drama-dsh-demo.gif`
  - `https://github.com/zenstory-ai/novel-to-game` at pinned version 0.3.0
  - Official product material for Rosebud, GDevelop, Roblox Studio Assistant, Unity AI Assistant, PlayCanvas Editor MCP, Replit Agent, Lovable, Bolt, v0, and Figma Make.
- **Decision rule:** When this document conflicts with an implemented Story or Short Drama behavior, preserve the implemented behavior until an explicit migration is approved. New game behavior should follow this document.

## Brand

The game-making surface should feel like a **Live Game Lab** inside DSH: calm, tool-like chrome around a high-contrast playable stage. The game itself provides spectacle; the workspace should provide confidence.

- Keep DSH navigation, Conversation, Composer, typography, spacing, borders, and semantic colors native.
- Give only the playable stage a stable dark matte frame so light and dark DSH themes do not visually compete with game content.
- Use the existing DSH business/success/warning tokens for the status line and runtime states. The game workspace must feel as mature as 小说/短剧 rather than introducing a separate neon identity.
- Use monospaced text only for build IDs, paths, timestamps, metrics, and logs.
- Do not load remote fonts. Prefer the host font stack and existing bundled assets.

## Product goals

### Primary goals

1. Let a creator describe a game or change in the right-side Chat and immediately observe the build and playable result on the left.
2. Keep the last successful version playable while a new version is building or has failed.
3. Make “done” mean observable runtime evidence, not merely changed files or an optimistic agent message.
4. Keep execution authority legible: asking, planning, changing files, running builds, validating, and publishing are distinct Agent actions without turning each into a permanent Studio surface.
5. Preserve Story and Short Drama as focused three-column writing workspaces.

### Success signals

- At desktop width, the playable surface is visibly dominant while Chat remains at least 400 px wide and fully native.
- Project switching, Preview, Design, reload, fullscreen and return-to-writing controls remain legible without a second permanent utility column.
- A generated workspace game and the bundled example both accept real browser input in the packaged DSH E2E.
- The Studio contains no QA tab, scorecard, badge, or release dashboard; validation remains available through Agent workflows and project artifacts.
- No generated-game request can reach the workspace API outside the preview asset prefix.

### Non-goals for MVP

- Replacing the DSH Conversation, Composer, approval, Todo, Trajectory, or Agent UI.
- Building a browser IDE with terminal, Git client, completion, multi-cursor editing, or a permanent scene hierarchy.
- Supporting arbitrary native engines inside an iframe.
- Treating asset existence, `_progress.md`, or a completed tool call as proof that the game works.
- Providing production publishing, multiplayer orchestration, or save-data migration.

## Personas and jobs

### Prompt-first creator

- Describe a playable idea without understanding the repository structure.
- See meaningful progress while the first build is created.
- Play the result, report what feels wrong, and iterate without leaving the session.

### Hands-on game designer

- Inspect design documents, source files, build logs, and relevant artifacts.
- Preserve a manual draft when the agent updates the same file.
- Compare the current playable version with a newly built version before reloading.

### Reviewer or producer

- Understand what changed and directly exercise the current playable build.
- Use the Agent conversation and project artifacts for formal validation or failed-check investigation.
- Avoid accepting a version whose runtime never launched.

## Information architecture

### Workspace ownership

```text
DSH Session
├── DSH-owned navigation, session state, agent state and permissions
└── Game workspace
    ├── Game Studio — plugin-owned, left
    │   ├── Studio Toolbar
    │   ├── Context Strip
    │   ├── Active Surface
    │   │   ├── 试玩 / Preview
    │   │   └── 设计 / Design
    │   └── Utility Dock (post-MVP)
    │       ├── 阶段
    │       ├── 文件
    │       └── 日志
    └── Conversation — DSH-owned, right
        ├── Messages, tools, Todo, Trajectory and approvals
        └── Composer
```

### Mode-level layout

- **Story and Short Drama:** retain the current file tree + editor + Chat three-column layout.
- **Game:** use two primary columns only:
  - **Left:** Game Studio, normally 64–70% of useful width.
  - **Right:** unmodified DSH Conversation and Composer, normally 30–36%, clamped to approximately 400–520 px on wide desktop layouts.
- Files, stages, artifacts, and logs are secondary tools inside the left Studio. They must not become a third permanent primary column.
- Preview is the default surface. Design temporarily replaces the visible left surface while the mounted preview preserves its live state.
- Switching between 小说 and 游戏 within the same Session hides rather than unmounts Game Studio, so returning to 游戏 preserves the active runtime.

### External benchmark implications

- Rosebud validates the simple combination of persistent conversation, live preview, asset/code inspection, screenshots, and checkpoints.
- GDevelop validates an explicit distinction between question answering and an agent that modifies project objects, plus visible plan/progress/pause behavior.
- Roblox and Unity validate a progression from Ask to Plan to Build/Agent, with review or permission before higher-risk edits.
- PlayCanvas provides the strongest model for runtime proof: inspect the viewport, launch the game, capture the running result, read logs/state, exercise input, and only then claim success.
- Replit, Lovable, Bolt, v0, and Figma Make reinforce co-locating conversation and preview, object-level feedback, visible version history, and switching rather than squeezing columns on narrow screens.
- Benchmark orientation is not a requirement. This product deliberately keeps **Preview left and DSH Chat right** to match the current DSH conversation seam and the user's chosen mental model.

## Design principles

### 1. Playable result first

The largest area belongs to the running game, not its files. Preview should be visible by default and remain useful during background work.

### 2. Preserve the last known good version

A new build must not blank or replace a working preview until it is ready. A failed build leaves the last successful version available and labels it clearly.

### 3. Evidence over assertion

Completion should be tied to a build ID and may include launch success, screenshot, interaction path, assertions, logs, and validation artifacts. File changes alone are insufficient. Formal QA remains an Agent/artifact concern rather than a Studio tab.

### 4. Native authority boundaries

DSH remains the source of truth for messages, permissions, tool execution, approvals, Todo, and Agent status. The plugin presents project artifacts and runtime evidence; it does not simulate Composer input or invent a parallel approval system.

### 5. Object context beats vague prose

Where the host later supports it, selected preview objects, screenshots, failed checks, files, scenes, and assets should be attachable as explicit context. MVP may copy structured diagnostics but must not pretend a Composer prefill API exists.

### 6. Recoverable exploration

Builders should be able to keep playing the old version, inspect the new one, and recover from failed changes. Any restore control must state its scope: code, assets, settings, local save data, and remote data are not interchangeable.

### 7. Focus is explicit

The game receives keyboard, pointer, or gamepad focus only after an explicit interaction. Agent output, builds, tab switches, and reload notices must never steal focus from Chat or an active game.

## Visual language

### Shell

- Reuse existing `--dsw-*` colors, spacing, border, radius, focus, and semantic tokens.
- Maintain a quiet, flat tool surface. Separators should do more work than cards and shadows.
- Preserve the official Conversation scroll and sticky Composer behavior.

### Playable stage

Suggested local variables, subject to contrast testing:

```css
--game-stage: #0d100e;
--game-stage-raised: #161a17;
--game-grid: rgb(221 242 201 / 7%);
--game-accent: var(--dsw-alias-state-business-primary);
--game-info: #65d9e8;
--game-warning: #f4bd55;
--game-danger: #f06b63;
```

- Frame the runtime with a dark matte surface.
- Use a 2 px build-status line at the stage edge:
  - ready: static accent;
  - building: slow linear movement;
  - error: segmented danger treatment;
  - offline: muted warning dash.
- Always pair color with icon and text.
- The workspace does not add decorative entrance animation to game content.

### Motion

- Hover, tab, and drawer transitions: 120–180 ms.
- Build-line loop: approximately 1.4 seconds when motion is allowed.
- A ready build may receive one subtle border emphasis. It must not flash repeatedly, scroll the page, reload an active game, or move focus.

## Components

### `GameStudio`

Owns the left column, current Studio tab, project-local UI state, and responsive utility surfaces. It does not own Conversation state.

### `GameToolbar`

- Leading: low-emphasis 小说/游戏 switch followed by a project selector grouped as `我的项目` and `内置示例`.
- Center/right: `试玩` plus workspace `项目文件` or bundled-example `说明`.
- Preview status row: text `刷新`, fullscreen, and explicit `载入新版本` when a changed digest exists. Audio remains owned by the running game in MVP.
- Full toolbar minimum height: 56 px. The two-row compact toolbar grows to approximately 101 px and coexists with the higher-level `制作 / 对话` switch.

### `GameContextStrip`

- Optional 32 px strip for current phase or build state.
- Example: `构建 · 正在更新输入系统`.
- It occupies no space when there is no meaningful context.

### `PreviewFrame`

- Runs the last known good web preview in an isolated frame or host-provided preview surface.
- Has an explicit accessible title, for example `《项目名》可试玩预览`.
- Provides an “进入试玩” affordance before keyboard capture.
- Supports reload and fullscreen in MVP.
- Keeps runtime content visible behind non-blocking state notices whenever safe.

### `NewBuildNotice`

- If Preview is not actively receiving input, a ready build may load automatically without moving focus.
- If Preview has input focus, show `新版本已就绪` with a user-triggered reload. Never interrupt active play.

### `DesignSurface`

- Opens the project design document or the most recently relevant text file.
- Reuses the current Markdown preview and source presentation.
- MVP is read-only inspection, not a browser IDE; bounded editing remains post-MVP.

### QA boundary

- Game Studio has no visible QA surface, QA tab, pass/fail cards, release score, or compact QA badge.
- `/game-qa` and `qa/verification.json` remain workflow and artifact contracts for the Agent, CI, and advanced users who inspect project files.
- Validation failures may appear through native DSH Chat/tool results. They do not create a parallel plugin-owned dashboard.
- If the product later needs a release-review experience, it requires a separate product decision rather than silently restoring the removed tab.

### `UtilityDock` (post-MVP)

- Opens `阶段`, `文件`, or `日志`.
- Only one utility is open at once.
- On desktop it opens a 320 px overlay drawer inside Game Studio, never pushing Chat.
- On narrow layouts it opens a bottom sheet up to `min(62vh, 520px)`.
- Badges use text or counts, not color-only dots.

### `BuildActivity`

- Shows target, action, state, and optional expandable parameters/results for each build step.
- Supported states: queued, running, paused, complete, failed, cancelled.
- It reflects DSH/tool evidence and must not invent success from elapsed time.

### `PreviewErrorOverlay`

- A preview navigation/load failure stays inside the stage, preserves the last selected build identifier, and offers reload.
- Agent build failures remain visible in native DSH Chat/tool results because the plugin has no authoritative build-failure event.
- The Studio must not infer build failure or success from elapsed time, iframe load alone, or unrelated mutating tools.

## Accessibility

- Target WCAG 2.2 AA for workspace chrome. Generated game content has a separate accessibility contract.
- Use the existing roving-tab pattern: Left/Right, Home, and End on `试玩 / 项目文件` (or bundled-example `说明`); keep focus on the selected tab rather than automatically entering its panel.
- Do not define unmodified single-key global shortcuts. They conflict with WASD, Space, Escape, and game-specific controls.
- Preview never receives focus on mount or build completion. It receives focus after clicking the frame or `进入试玩`.
- MVP deliberately does not grant iframe pointer-lock permission. A future pointer-lock capability requires persistent `按 Esc 退出指针锁定` guidance before it can ship.
- Fullscreen exit returns focus to the fullscreen button.
- Drawers and sheets use dialog semantics, bounded focus, Escape close, an explicit close control, and focus return to their trigger.
- Build phase changes use `role="status"` and `aria-live="polite"`. Rapid log lines are not live-announced. A newly surfaced error may alert once.
- Status and severity must include text and iconography rather than color alone.
- Touch targets are at least 44×44 px. Dense desktop-only controls remain at least 36 px.
- Focus rings are at least 2 px, use the host focus token, and cannot be clipped by the iframe or drawers.
- Respect `prefers-reduced-motion`; stop moving status lines, pulses, and spring-like sheet animations.
- Under `prefers-contrast: more`, strengthen borders and icons instead of relying on saturation.

## Responsive behavior

Use the current Conversation/workspace container measurement rather than viewport width alone, because DSH navigation changes available content width.

| Available workspace width | Game Studio | Chat | Behavior |
| --- | ---: | ---: | --- |
| `≥1280px` | about 64–68%, minimum 640 px | about 32–36%, 420–520 px | Full toolbar and horizontal phase text |
| `960–1279px` | about 58% | about 42%, minimum 380 px | Truncated project path; compact phase capsule |
| `720–959px` | about 52% | about 48%, minimum 320 px | Two-row toolbar; utilities become overlays |
| `<720px` | one primary region at a time | one primary region at a time | Persistent `制作 / 对话` switch; no squeezed dual columns |

- Preserve the Conversation component, Composer draft, Chat scroll, preview session, selected Studio tab, and relevant focus target when crossing breakpoints.
- When space contracts, degrade in this order: truncate paths, hide secondary labels while keeping accessible names, compact the phase strip, switch drawer to sheet, then enter single-region focus mode.
- The playable viewport should letterbox, scroll, or follow the project-declared resolution. Do not scale the entire iframe to fake responsive support.
- The visible Preview area should remain at least 320×240 px; otherwise prefer focus mode or fullscreen.

## Interaction states

### State model

The Studio reports only states it can observe directly. Agent validation and QA stay in native Chat/tool results and project artifacts.

| State | Surface behavior | Copy | Primary action |
| --- | --- | --- | --- |
| Loading | Preview skeleton; tabs visible but disabled | `正在连接项目…` | None |
| Empty | Honest empty state; no fake files or phases | `还没有可试玩版本。在右侧 Chat 描述玩法、目标平台和风格。` | Focus Chat only if an official API exists |
| Building, no good build | Build placeholder and current step | `正在生成首个可试玩版本…` | `查看日志` |
| Updating known game paths | Keep old preview mounted; show status line | `Agent 正在更新游戏文件 · 当前预览保持不变` | None |
| Loaded | Keep current selected build | `预览已载入` | Refresh / Fullscreen |
| New build | Never replace the mounted runtime automatically | `新版本已就绪 · 由你决定何时载入` | `载入新版本` |
| Preview load error | Keep an honest stage error and reload control | `预览载入失败 · 可重新载入` | `刷新` |
| Offline | Continue local preview when possible | `连接已中断；当前试玩可继续。` | `重试连接` |
| File conflict | Reuse current conflict semantics | `文件已在磁盘上更新；请选择保留哪一版。` | Load disk / keep local |

Display priority is `offline > preview load error > updating > new build > loaded`, but native Chat remains the authority for Agent/tool failure detail.

### First build

1. Empty Studio directs the creator to the existing right-side Chat.
2. Observed build activity changes the left surface to building.
3. Before the first preview exists, keep the example prompt and native Chat visible rather than inventing progress.
4. When the first preview appears, load it without moving keyboard focus and label only what was observed: `预览已载入`.

### Iteration

1. The creator requests a change in Chat while continuing to play the last good build.
2. Studio labels file activity without claiming the build is valid.
3. A new preview digest always waits for explicit `载入新版本`, even when the iframe is not focused.
4. A failed Agent build stays in native Chat and never destroys the mounted runtime.

### Validation failure to repair

1. `/game-qa` runs through the Agent and reports through native DSH Chat/tool results.
2. Related workspace files can be opened in `项目文件` without clearing or focusing the Composer.
3. Machine evidence remains in `qa/verification.json`; Game Studio adds no parallel result UI.
4. The next iteration returns to the same explicit new-build loading flow.

### Version and restore semantics

- The UI may expose last-known-good preview switching before full project checkpoint support exists.
- Do not label a preview reload, code rollback, or artifact restore as “restore project” unless it truly restores every documented category.
- If host checkpoints become available, preview the restore scope and preserve a non-destructive branch where possible.
- Never imply that rolling back code also rolls back databases, remote services, analytics, or player save data.

## Content voice

- Use direct, calm Chinese labels: `试玩`, `项目文件`, `说明`, `制作`, `对话`, `刷新`, `全屏试玩`.
- State what happened and what remains usable: `构建失败，仍在运行上一个可用版本。`
- Name the affected version or build when relevant.
- Avoid anthropomorphic filler, celebratory confetti, and vague claims such as `搞定了` or `应该可以`.
- Distinguish observed facts from suggestions: `运行成功` is reserved for runtime evidence; `已生成文件` describes only file output.
- Destructive or high-scope actions name their target and impact before approval.

## Implementation constraints

### Host and plugin boundary

- Continue using the official `shell.overlay`, Session child slot, and portal bridge.
- Keep DSH Conversation and Composer untouched in the right column.
- Do not inject text into Composer through DOM manipulation or simulated typing.
- Store Game Studio UI state in the existing Session-scoped store pattern.
- Reuse file activity, settled mutation, disk reload, dirty-buffer precedence, CAS save, file-link navigation, tab keyboard handling, and container `ResizeObserver` patterns.
- Apply a game-specific grid/template class or mode. Do not globally rewrite the Story/Short Drama three-column layout.
- Do not add a new design system or UI dependency for MVP.

### Artifact truth

- `_progress.md` is a display artifact, not semantic completion truth.
- `qa/verification.json`, or its eventual agreed successor, is the machine-readable QA source only after its schema and build association are defined.
- File existence does not prove a valid manifest, successful launch, successful input path, or completed QA.
- Every derived status needs provenance and a timestamp or build identifier.

### Preview runtime and safety

- MVP supports a web-playable target only after a single launch/manifest contract is defined.
- Prefer an isolated origin for generated content. Define iframe sandbox, CSP, navigation, network, storage, audio, fullscreen, gamepad, and clipboard capabilities explicitly; MVP omits pointer lock.
- Do not expose DSH credentials, host DOM access, unrestricted navigation, or arbitrary local files to generated game content.
- Bound runtime CPU, memory, log volume, asset size, and restart behavior where the host permits it.
- Preserve an explicit escape path from iframe focus and fullscreen. Exiting fullscreen restores focus to its trigger.
- Hidden runtimes should pause audio and expensive loops only through a defined pause/resume handshake; do not assume hiding an iframe pauses execution.

### Verification

Minimum UI acceptance scenarios:

1. Story and Short Drama retain their existing three-column layout and save/conflict behavior.
2. Game opens with Preview left and the original DSH Chat/Composer right.
3. Building with a good preview preserves active play.
4. A ready build never steals focus or interrupts a focused game.
5. Build failure with a good preview keeps that preview running.
6. No QA tab, card, badge, score or validation summary appears in Game Studio.
7. Chat file links open Design without clearing the Composer draft.
8. Keyboard navigation reaches tabs, toolbar, drawers, errors, and Chat without entering the game unexpectedly.
9. At narrow widths, the UI switches between Preview and Chat while preserving state instead of squeezing both.
10. Reduced motion, high contrast, fullscreen exit/focus return, and the deliberate absence of pointer-lock permission are verified.

## Resolved MVP decisions

| ID | Decision |
| --- | --- |
| OQ1 | A game project is a direct child of `game-adaptations/`; no extra manifest is required for discovery. |
| OQ2 | `game-adaptations/<project>/build/app/index.html` is the single playable entry. |
| OQ3 | Only observed `game-adaptations/` file activity is advisory update state; a deterministic digest identifies preview revisions. The current loaded revision stays mounted until the user explicitly loads a new digest. |
| OQ4 | Phase UI is omitted from MVP because no authoritative phase event exists. |
| OQ5 | `qa/verification.json` retains exactly `launch`, `render`, `input`, `coreLoop`, `outcome`, and `restart` for Agent/automation use. Game Studio does not render it. |
| OQ6 | Generated content runs in a sandboxed iframe on an alternate loopback origin when available. CSP permits only the preview asset prefix and blocks workspace/API access; sandbox permissions omit pointer lock. |
| OQ7 | Game Design may inspect Markdown, text, JSON/JSONL, HTML, CSS, JavaScript and TypeScript family files; binary assets are preview-only. |
| OQ11 | Automatic preview replacement is disabled. Every changed preview digest waits for an explicit `载入新版本` action so moving to Chat cannot discard player progress. |

## Post-MVP open questions

| ID | Question | Blocks |
| --- | --- | --- |
| OQ8 | Does DSH expose supported Composer focus, attachment, or prefill APIs? | Focus Chat and send-diagnostic actions |
| OQ9 | Is `<720px` a fully supported editing surface or a play/review-focused fallback? | Mobile acceptance scope |
| OQ10 | Can the runtime pause/resume, serialize state, or migrate state between builds? | Runtime cost while hidden and hot reload |
| OQ12 | What are the skill command, onboarding copy, checkpoint semantics, and publish boundary? | End-to-end product contract |

## Research sources

Official references used to derive the benchmark implications:

- [Rosebud AI Game Maker beginner guide](https://lab.rosebud.ai/blog/beginner-guide)
- [GDevelop AI Agent](https://gdevelop.io/blog/make-games-with-ai-agent-gdevelop-automated-prompt)
- [GDevelop AI Chat context](https://gdevelop.io/en-gb/blog/gdevelop-ai-chat-development-help-instant)
- [Roblox Studio Assistant guide](https://create.roblox.com/docs/zh-cn/assistant/guide)
- [Roblox Studio testing modes](https://create.roblox.com/docs/studio/testing-modes)
- [Unity AI Ask, Plan, and Agent modes](https://unity.com/blog/unity-ai-assistant-ask-plan-agent-mode-explained)
- [Unity AI documentation](https://docs.unity.com/en-us/ai)
- [PlayCanvas Editor MCP](https://developer.playcanvas.com/user-manual/editor/mcp-server/)
- [PlayCanvas Launch Page](https://developer.playcanvas.com/user-manual/editor/interface/launch-page/)
- [Replit Agent](https://docs.replit.com/learn/build-with-agent)
- [Lovable browser testing](https://docs.lovable.dev/features/browser-testing)
- [Bolt version history](https://support.bolt.new/building/using-bolt/rollback-backup)
- [v0 workflow](https://vercel.com/academy/vercel-foundations/v0-way)
- [Figma Make](https://help.figma.com/hc/en-us/articles/31304485164695-Create-a-Figma-Make-file)
