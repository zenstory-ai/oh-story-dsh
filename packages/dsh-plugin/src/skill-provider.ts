import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { dramaAdapterConfigPath, dramaAdapterSummary, DRAMA_ADAPTER_CONFIG_ENV } from "./drama-adapters.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider
} from "@deepseek-ai/dsh-skill";

const STORY_PROVIDER_NAME = "oh-story";
const DRAMA_PROVIDER_NAME = "short-drama";
const GAME_PROVIDER_NAME = "novel-to-game";
const VIDEO_PROVIDER_NAME = "video-recap";
const DSH_SKILL_BRIDGE = [
  "<oh-story-dsh-integration>",
  "This Skill is a native contribution to the current DeepSeek Harness session.",
  "DSH owns the workspace, model, preset, permissions, Session Log, tools, subagents, cancellation, resume, and Agent UI.",
  "Never start another Agent runtime, session transport, Dashboard, SSE stream, polling loop, or model configuration.",
  "All seven upstream Oh Story specialist Roles are bundled. Invoke one with oh_story_role and a self-contained prompt.",
  "Never inspect .claude/agents, .codex/agents, .opencode/agents, .agents/agents, .zcode, or .story-deployed to decide whether a Role is available.",
  "Oh Story Roles are reached only through oh_story_role. Never start one through a generic subagent or Task tool — not DSH's subagent or subagent_fork tools and not invoke_subagent — and never pass a Role name as subagent_type, agent_type, agent, or TypeName, even where the upstream text below describes that for another host.",
  "Use only DSH-visible tools. DSH sandbox and permission policy remain authoritative.",
  // Upstream deploys these 「与作者协作」 rules only in its CLAUDE.md/AGENTS.md
  // templates, which DSH does not install.
  "Working with the author: reply and report in the author's writing terms (book, chapter, outline, settings), never in script, field, or state names; attach a raw error only when something failed. A template block marked <!-- author-report --> is only a format reference: output its text directly, without that marker and without a code fence.",
  "Record a writing habit or preference the author asks to remember, forget, or confirm only through the story Skill's author memory, whose scripts/author_memory_commit.py writes .story/作者记忆/; never keep it in a host or DSH memory. Simply follow a one-off request without recording it.",
  "Never edit the bundled Skill files (SKILL.md, references/, scripts/). When a Skill script fails, stop and show the author the command you ran and its error instead of patching or working around it.",
  "</oh-story-dsh-integration>"
].join("\n");
/** Oh Story 0.8.0 long-form analysis Stage 2, shared by story-long-analyze and story-import. */
const DSH_ANALYSIS_BATCHES = [
  "Stage 2 batches in DSH: dispatch each planned batch with oh_story_role, role chapter-extractor, and a self-contained prompt carrying the batch ID, the input kind, the plan's source_files (per-chapter source_locator for a raw batch) and chapter_chars, the output file {拆文目录}/_analysis_cache/输入-{批次ID}.md, and the hand-off cache path when there is one.",
  "The extractor reads the source itself, writes or edits only that batch input file (DSH denies any other write or edit by a chapter-extractor child), and replies with one receipt line; do not read the file yourself.",
  "Commit it with manage_analysis_run.py commit, one commit at a time in this session; on rejection hand the error and the file path back to a chapter-extractor to fix in place with edit.",
  "Run manage_analysis_run.py and the other bundled Python 3 scripts through the current DSH execution world, trying python3, python, then py -3. If none is available, stop and tell the author in plain words that this step needs Python 3 on the machine running DSH; never simulate a script's output or hand-write the files it owns.",
  "Keep concurrent oh_story_role calls modest. The default is upstream's 有限并行 tier: three batches per round, issued together, the next round only after all three are committed; an unasked, full, multi-book, or import run uses it. DSH runs calls from one step in parallel only up to the host's own limit and may run them one after another, so never promise more. Use 串行 or 不限批次顺序 only when the author chooses it, and under 不限批次顺序 halve the count on any rate limit, timeout, or child error."
].join(" ");
const DSH_SKILL_OVERRIDES: Readonly<Partial<Record<string, string>>> = {
  story: "The 小说 workspace is an official DSH conversation view. Never start or open a second web application.",
  "story-setup": "Initialize or validate novel project data only. DSH already supplies Skills, Roles, hooks, tools, permissions, sessions, and UI; never deploy Claude/OpenCode/Codex/Antigravity/ZCode/OpenClaw/Reasonix files or a .story-deployed marker.",
  "story-long-analyze": `Use oh_story_role for chapter extraction or specialist analysis. Never inspect platform agent directories or require a deployed external Agent definition. ${DSH_ANALYSIS_BATCHES}`,
  "story-long-write": "All named Roles are provided through oh_story_role. Do not check platform agent files. Keep the upstream writing, Tracking, lint, outline, revision, and quality workflows. Create and assemble 正文/ chapter files only with the write and edit tools, never through shell redirection, cp, mv, tee, or a script, so that DSH's outline guard, its Tracking reminder, and the 小说 view observe the write; upstream's own in-place chapter fixes such as storyctl.py chapter check --fix-punctuation stay as upstream describes.",
  "story-review": "All named reviewer Roles are provided through oh_story_role. Do not check platform agent files; full/lean review may use the bundled Roles directly. When a review falls back to solo in DSH, the reason is that oh_story_role or DSH's spawn runtime is unavailable in this Session (Fallback agent tool unavailable -> solo) or a Role run failed (Fallback spawn failed -> solo); say that in one plain sentence. Never tell the author that the reviewers are not installed, missing, or outdated, and never tell them to run /story-setup.",
  "story-import": `All named Roles are provided through oh_story_role. Do not require story-setup to deploy them, and never inspect platform agent directories. Phase 2 runs the story-long-analyze pipeline the DSH way below; an import counts as automatic continuation, so it uses the limited-parallel tier without asking. ${DSH_ANALYSIS_BATCHES} Run the Python 3 scripts this Skill needs (storyctl.py wordcount measure, tracking_commit.py init and check) the same way. Keep upstream's Phase 3-L order: Step 2 copies the manuscript into 正文/, Step 6 writes the 细纲, Step 7 initialises Tracking. DSH's prose guard mirrors the outline gate of upstream proseBlockReason for books with 大纲/ or 追踪/, so open an import window before Step 2 copies any chapter: create .story/work/导入中.md in the book directory (the workspace root in DSH's usual single-book layout) with one line naming the book being imported, and delete it right after Step 7's tracking_commit.py init and check both succeed. The window only holds while 追踪/_tracking-state.json is absent.`,
  "story-deslop": "Use the bundled narrative-writer Role through oh_story_role when specialist review is useful. Never inspect platform agent directories.",
  "story-short-analyze": "Use oh_story_role for specialist analysis. Never inspect platform agent directories or require external Agent deployment.",
  "story-short-write": "All named Roles are provided through oh_story_role. Do not inspect platform agent files; preserve the upstream short-fiction workflow and quality gates.",
  "browser-cdp": "Use only browser or web capabilities visible in the current DSH preset. Do not start a parallel browser host; if no compatible capability is visible, explain the limitation.",
  "story-cover": "Use only image-generation or HTTP capabilities visible in the current DSH preset. Never assume a separate Codex or Claude runtime."
};
const DSH_DRAMA_BRIDGE = [
  "<short-drama-dsh-integration>",
  "This Skill is a native contribution to the current DeepSeek Harness session.",
  "DSH owns the workspace, model, preset, permissions, Session Log, tools, approvals, cancellation, resume, and Agent UI.",
  "The 短剧 tab is the creator workspace. Never start dashboard_server.py, another web server, Dashboard, Agent runtime, session transport, or model configuration.",
  "Drama Skills uses a creator-first contract: each episode keeps only the requested documents, up to five creator-facing sources at 剧集/<EP>/剧本.md, 视觉设定.md, 分镜.md, 图片提示词.md, and 视频提示词.md. Never precreate empty documents, backfill nominal stages, or start work the creator did not request. Persisted reviews use creator-readable Markdown under 审查/; an oral review writes nothing.",
  "剧集/<EP>/剪辑单.md is the v0.7 assembly record, not a sixth creative truth: the five creator documents stay the creative truth. It is written after footage exists and records what reaches the cut — which footage is kept or left unused and why, each cut's in/out timing, post-processing such as shot-match correction or an external mix, and the delivery spec including optional 颗粒 grain. It never changes a line, a shot's job, or a declared duration; changing any of those means returning to the document that owns it.",
  "For a v0.6 project, never create a parallel JSON/JSONL lifecycle truth, indexes, fingerprints, coverage tables, or QA records merely because legacy maintenance scripts and templates remain bundled.",
  "Never upgrade a v0.5 structured project in place or mix both contracts in one project root. Keep legacy production/audit artifacts read-only and pinned to v0.5; migrate only into a new creator-first root with manual per-episode creator confirmation.",
  "Use only tools visible in the current DSH preset and preserve the upstream project ownership, freshness, review, and explicit production-confirmation contracts.",
  "Use oh_story_production only for semantic production-view intents (open/focus, explicit shot order, or tracking a job that this Agent is actually executing). Cosmetic canvas layout remains creator-controlled. The tool changes only the Session projection: it does not edit creator documents, generate media, or authorize production.",
  "Production credentials remain outside project files. Never treat a prior acceptance, preview, continuation request, or budget discussion as confirmation for a paid production run.",
  "</short-drama-dsh-integration>"
].join("\n");
const DSH_DRAMA_OVERRIDES: Readonly<Partial<Record<string, string | ((skillRoot: string) => string)>>> = {
  "short-drama": "A dashboard request means focus or use the native 短剧 tab in this DSH Session. Do not run the bundled standalone Dashboard script. New projects follow only the v0.6 creator-first contract and create only documents required by the current request.",
  "short-drama-produce": (skillRoot) => `Use an upstream adapter only after the creator explicitly confirms the exact current job. Its source must be the current creator-first Markdown and its output belongs under 剧集/<EP>/制作成果/. DSH permissions and approval UI remain authoritative. When oh_story_production is visible, register a previewed image or video job with track_job after the confirmation is valid and before run — never at prepare time — passing the same job ID, target, modality and count the creator just approved. track_job's jobKind is image, video or composition (the assembled cut), so from this Skill it registers image and video jobs only: speech (tts) and music jobs pass through the same prepare → explicit creator confirmation → run gate but are never registered with track_job or relabelled as another kind, and their audio results stay under 剧集/<EP>/制作成果/. In this DSH integration audio is never bound as a video job's reference: upstream's creator-first path has no audio binding (输入参考图 takes png/jpg/webp images only) and documents audio only as an external step, the edit stage's mix. DeepSeek generates no media: every image, video, speech, or music result comes from a provider adapter. The bundled adapters are ${dramaAdapterSummary()}; they are registered for this DSH host in ${dramaAdapterConfigPath(skillRoot).path} — pass that file as --adapter-config unless the creator names another config (${DRAMA_ADAPTER_CONFIG_ENV}). Credentials are read only from the DSH host process environment. Before preparing a paid job, name the adapter that will run it; if its variables are missing, tell the creator exactly which ones to export before starting DSH instead of failing inside run. Never read, print, or write credential values. A submitted video job is already billed, so an interrupted run is recovered, not resubmitted: when audit reports orphaned_provider_job, recover it with collect, passing --job-id — the drama job the finding names, not its provider_job_id, which collect reads from the run handle itself. collect spends nothing and does not need the confirmation gate — the gate exists to stop unintended spending — but re-running the same job does, and would charge the creator twice.`,
  "short-drama-edit": [
    "Assembly runs inside this DSH Session. Write 剧集/<EP>/剪辑单.md first, then run edit_tool.py check and render through the current DSH execution world; the rendered cut belongs under 剧集/<EP>/制作成果/成片/ and the 短剧 tab shows it there. ffmpeg and ffprobe come from the DSH host — when one is missing, say so instead of approximating or reporting an untested measurement as a pass.",
    // edit_tool.py 0.7.1 `_unaccounted_shots`: `- 未采用镜头：` is read only outside CUT blocks, split on `；`, and each item must fullmatch `MOTION-…（理由：<non-empty>）`.
    "check blocks until every `## MOTION-*` heading in 视频提示词.md either backs a CUT's 来源 or is listed in the cut list's opening block, before the first `## CUT-` heading, on one line: `- 未采用镜头：MOTION-…（理由：…）；MOTION-…（理由：…）`. Join items with a full-width `；`; each reason is non-empty, contains no `；`, and names 文件缺失, 质量不可用 or 叙事取舍.",
    "Every cut must share one width, height and frame rate: render hard-joins the encoded segments and never scales or retimes them. When check reports a mismatch, normalise the odd clips to the delivery spec with ffmpeg in the DSH execution world, under approval, preserving the composition. Write them under 剧集/<EP>/制作成果/成片/规格统一/, an edit-owned intermediate, never beside the produce-stage originals and never over produced footage, and name them without the original's job-id token (the MOTION ID will do). Record the crop or pad in that CUT's block (not in its 画面 line, which accepts only 亮度/饱和/色温), point 来源 at the new file, update 入点/出点 if the conversion moved them, and rerun check.",
    "The default burned-subtitle route needs an ffmpeg built with libass; when the host's ffmpeg lacks it, say so instead of silently dropping subtitles. The Remotion route installs Node dependencies and renders every frame through a headless browser, so take it only after the creator approves that install, and never treat it as a second Agent runtime, dashboard, or session transport.",
    "The 声音 line in 剪辑单.md is a record, not an instruction the built-in render executes: render only trims, hard-joins, burns subtitles, applies 画面 corrections and optional 颗粒, and normalises loudness. A mix, crossfade, music bed, transition or format conversion is an external ffmpeg step, run under approval, that writes a temporary file, ends as render does with whole-film two-pass loudnorm to the declared 交付响度 (I=<交付响度>:TP=-1.5:LRA=11, the second pass fed the first pass's measurements with linear=true, audio re-encoded as AAC 192k at 48 kHz), and only then replaces 剧集/<EP>/制作成果/成片/成片.mp4; record its command in 剪辑单.md and repeat it after any re-render, which overwrites that file. Run edit_tool.py verify last, on that delivered file, and report every 未测 item as untested, never as passed.",
    "This stage never generates footage and never edits 剧本.md, 分镜.md, or 视频提示词.md — route those back to their owning Skill."
  ].join(" "),
  "short-drama-assets": "Keep one stable `- ID：VISUAL-*` line on every 人物/造型/地点/道具/状态 entry in 视觉设定.md, and never change an existing ID when editing its heading or text. The 生产 view identifies canvas nodes by that ID; entries without one still render, but the workbench reports their node identity as unstable."
};
const DSH_GAME_BRIDGE = [
  "<novel-to-game-dsh-integration>",
  "This Skill is a native contribution to the current DeepSeek Harness session.",
  "DSH owns the workspace, model, preset, permissions, Session Log, tools, approvals, cancellation, resume, Todo, and Chat UI.",
  "The 游戏 tab is the playable Game Studio. Never start a second Agent runtime, dashboard, session transport, or model configuration.",
  "Keep the complete upstream seven-Skill pipeline and write adaptation artifacts under game-adaptations/<project>/ exactly as the upstream contracts specify.",
  "For a web target, keep the authoritative playable entry at build/app/index.html so Game Studio can preview it. Do not silently replace a requested non-web runtime with a web build.",
  "Use only DSH-visible tools and approvals. qa/verification.json remains the sole machine QA truth and must cover launch, render, input, coreLoop, outcome, and restart with real execution evidence.",
  "The bundled Jin Ping Mei project is a read-only example, not a template to copy mechanically and not proof that another adaptation passed QA.",
  "</novel-to-game-dsh-integration>"
].join("\n");
const DSH_VIDEO_BRIDGE = [
  "<video-recap-dsh-integration>",
  "This Skill is a native contribution to the current DeepSeek Harness session.",
  "DSH owns the workspace, model, preset, permissions, Session Log, tools, approvals, cancellation, resume, Todo, Chat, and the 视频 preview Studio.",
  "Never start a second Agent runtime, dashboard, session transport, web server, polling loop, or model configuration.",
  "Keep the complete upstream six-Skill pipeline. Put each project under video-recaps/<project>/, copy or import source media under sources/, and use work/ as the upstream work_dir so the Studio can discover authoritative manifests and outputs.",
  "The Video Studio is a preview and artifact surface, not a nonlinear editor. Do not invent a second project-state format, timeline truth, or render queue; recap_run_manifest.json, recap_phase.json, timeline.json, assembly_manifest.json, and the upstream artifacts remain authoritative.",
  "MIMO_API_KEY, FISH_API_KEY, and voice credentials stay in the host environment. Never write secrets into project files, tool arguments shown to the browser, or chat output.",
  "Use only DSH-visible tools and approvals. Run Python and ffmpeg through the current DSH execution world, preserve cancellation, and do not install or upgrade system dependencies without explicit user approval.",
  "When a new edited or final video is ready, tell the user that Video Studio can load it; never interrupt playback by replacing the currently loaded video silently.",
  "</video-recap-dsh-integration>"
].join("\n");

const DSH_NATIVE_SKILLS: Readonly<Partial<Record<string, string>>> = {
  story: `# story — DSH 小说流程入口

在当前 DSH Session 内判断用户意图，并加载最匹配的 Oh Story Skill：

- 新建或修复小说工程：story-setup
- 长篇规划与写作（讨论长篇结构、规划剧情、开书、写大纲、补细纲、写正文、日更）：
  story-long-write。只要结构、大纲、卷纲或细纲时只交付所请求的规划，不写正文；
  用户明确要求写正文才进入正文流程
- 长篇选题/扫榜：story-long-scan；长篇拆文：story-long-analyze
- 灵感库、提炼灵感、跨书灵感聚合、更新灵感库：story-long-analyze 的可选灵感库管道
  （单书拆文不自动入库）
- 短篇选题/拆文/写作：story-short-scan、story-short-analyze、story-short-write
- 导入已有作品：story-import
- 审稿与去 AI 味：story-review、story-deslop
- 封面：story-cover
- 查本书的角色、伏笔、进度或设定：用 oh_story_role 调用 story-explorer；查外部资料：
  story-researcher。回答讲故事里的事，编号只跟着故事描述出现
- 管理作者习惯（记住/查看/确认/替换/忘掉写作偏好）：加载本 skill 的
  references/author-memory.md，只用本 skill 的 scripts/author_memory_commit.py 管理
  两级作者记忆：全局、题材、流程条目在工作区 .story/作者记忆/（AP 编号），本书条目在
  书级 store（BP 编号）。--workspace 必须显式传。DSH 的小说工作区通常就是书根
  （正文/、设定/ 直接在工作区根）：此时 --workspace 与 --book-root 都传工作区本身，
  书级 store 在 .story/作者记忆/书级/；书在子目录时 --book-root 传那本书的目录。
  处理某本书时每条命令都带 --book-root（书级操作缺它直接报错），query 必须带
  --kind（可重复）。只记作者明确说出的偏好，不从反复修改或成稿推断。工具未返回
  Author Memory Receipt 前不得声称已记住；告诉作者时先用一句人话说记住了什么，
  回执放最后一行。工作区画像里还有「本书：」条目（升级前写入的本书偏好，已不参与
  查询）时，提议运行一次 migrate --workspace {工作区} --book-root {书目录} 把它们搬进
  书级 store。

只说 /story、看不出意图时，不贴路由表，给四个白话选项：「开一本长篇或接着写」→
story-long-write；「写一篇短篇」→ story-short-write；「把一章改得不那么 AI」→
story-deslop；「更多（拆书、扫榜、导入旧稿、审稿、封面）」→ 再列进阶项。意图明确时
直接进入对应 Skill；只差一个会改变流程的选择时只问这一个问题。项目文件、Agent、
模型、权限、Session Log 和 UI 均由当前 DSH 会话管理。小说文件通过“小说”视图查看，
Agent 过程通过右侧动态栏或官方 Chat 查看。禁止启动独立 Dashboard。`,
  "story-setup": `# story-setup — DSH 原生小说工程初始化

只初始化或校验当前 DSH workspace 中的小说数据，不部署任何 Agent 平台文件。

1. 检查现有正文、设定、大纲和追踪文件，已有内容绝不覆盖。
2. 根据用户声明与现有结构判断长篇/短篇；无法可靠判断时请求确认。
3. 长篇按需建立 正文/、设定/、大纲/。初始化、开书、大纲和细纲阶段都不建 追踪/，
   也不写 追踪/_tracking-state.json：追踪在第一章正文动笔前，由 story-long-write
   单章流程用它的 scripts/tracking_commit.py init 初始化（事务 JSON 放书目录
   .story/work/，check 通过后删掉），之后每章由脚本提交。_tracking-state.json 与
   上下文.md 等派生 Tracking 视图只由脚本生成，绝不手改。
   第一章正文落盘前必须有对应细纲。短篇保持轻量结构，不强加长篇 Tracking。
4. 已有正文却没有 追踪/_tracking-state.json 时，不自行补建追踪文件：已有旧 追踪/
   的是旧追踪结构，建议走 story-import 的「旧追踪项目迁移」；没有 追踪/ 的既有书稿
   建议用 story-import 导入。
5. 需要架构、角色或研究工作时，通过 oh_story_role 调用已打包 Role；不要检查或
   生成 .claude、.codex、.opencode、.agents、.zcode、AGENTS.md 或 .story-deployed。
6. 给作者的报告按这个顺序写：先写「现在可以做什么」，用写书的话列真正可用的事
   （如「可以开新书、续写：说 /story-long-write」）；再写「你还需要做的事」，逐条
   可照做（含需要作者确认的长篇/短篇判断），没有就写「无需其他操作」。这两段不出现
   脚本名、字段名、状态名或文件路径；最后才简短列出创建和保留了哪些文件。
   不要配置模型、权限、Hooks 或 Session。

题材、角色、节奏、冲突、开篇和写作方法资料位于 references/agent-references/；
只加载当前任务需要的文件。`,
  "browser-cdp": `# browser-cdp — DSH 浏览器能力适配

本 Skill 不启动 Chrome、CDP 端口、独立浏览器 Host 或 setup-cdp-chrome.js。
仅使用当前 DSH Preset 已暴露的 web_search、web_fetch 或浏览器工具完成网页读取、
榜单采集和资料核验。保持以下原则：

1. 优先使用结构化搜索/抓取工具；需要登录态或交互页面时才使用可见浏览器能力。
2. 尊重站点条款、访问频率与用户授权；不绕过验证码、付费墙或访问控制。
3. 记录来源 URL、采集时间、失败项和数据质量，不把推断写成页面事实。
4. 当前 Preset 没有兼容能力时，说明缺失能力和可行的手工步骤，不另起运行时。`,
  "story-long-scan": `# story-long-scan — DSH 原生长篇扫榜

基于可核验样本识别长篇网文趋势，不运行打包脚本、不提取登录凭据，也不绕过验证码、
访问控制或站点限制。

1. 明确平台、频道和题材方向；只有答案会改变采样范围时才问一个问题。
2. 数据来源依次为：用户提供的数据或链接、当前 DSH Preset 可见的网页工具、
   references/genre-trends.md 中的历史趋势。无法获取实时数据时必须明确标为历史假设。
3. 每个样本记录来源 URL、采集日期、榜单口径、有效条目数、缺失字段和异常项；
   不把搜索摘要、推断或过期缓存写成页面事实。
4. 按题材分布、新题材信号、经典题材变化、篇幅与更新、书名模式、开头卖点和
   差异化元素分析。需要决策门禁时使用 references/topic-decision.md。
5. 输出市场概况、题材热度、证据与可信度、风险、三项可执行方向和下次复扫时间。
6. 报告写给作者：讲市场结论和能写的方向；脚本名、命令和采集状态码不进报告。
   某个榜没采到，就用一句话说明「XX 榜这次没拿到（原因），结论不含它」。

当前 Preset 没有网页能力且用户也未提供样本时，使用内置参考完成方法论分析，
并列出仍需核验的榜单；不要启动 CDP、独立浏览器或并行运行时。`,
  "story-short-scan": `# story-short-scan — DSH 原生短篇扫榜

基于可核验样本识别短篇市场的情绪、题材与传播信号，不运行打包脚本、不读取 Cookie
或 token，也不绕过验证码、登录或访问控制。

1. 明确平台与方向；只有答案会改变采样范围时才问一个问题。
2. 数据来源依次为：用户提供的数据或链接、当前 DSH Preset 可见的网页工具、
   references/real-market-data.md 中的历史资料。无法联网时必须把结论标为候选假设。
3. 记录来源 URL、采集日期、榜单口径、有效样本数、缺失字段和异常项。
4. 分析情绪类型、题材热点、篇幅、开头、结尾、标题、人设与传播触发点；
   给每个趋势标注证据强度、饱和风险和有效期。
5. 输出市场概况（扫榜时间、核心发现和可信度：样本多少篇、来自哪几个榜，并建议
   哪天前后再扫一次）、情绪热度、题材热点、关键数据、风口预警、三项可写方向。
6. 报告写给作者：讲市场结论和能写的方向；脚本名、命令和 SKIP 这类采集状态不进报告。
   某个平台没采到，就用一句话说明「XX 这次没拿到（原因），结论不含它」。

当前 Preset 没有网页能力且用户也未提供样本时，只做历史资料分析并列出验证动作；
不要启动 CDP、独立浏览器或并行运行时。`
};

interface ParsedSkill {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly userInvocable: boolean;
}

function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/u);
  const index = lines.findIndex((line) => new RegExp(`^${key}:\\s*`, "u").test(line));
  if (index < 0) return undefined;
  const raw = lines[index]?.replace(new RegExp(`^${key}:\\s*`, "u"), "").trim();
  if (raw === undefined) return undefined;
  if (raw === ">" || raw === "|" || raw === ">-" || raw === "|-") {
    const values: string[] = [];
    for (const line of lines.slice(index + 1)) {
      if (/^\S/u.test(line)) break;
      values.push(line.trim());
    }
    return (raw.startsWith(">") ? values.join(" ") : values.join("\n")).trim();
  }
  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    try { return JSON.parse(raw) as string; }
    catch { return raw.slice(1, -1); }
  }
  return raw.replace(/^['"]|['"]$/gu, "");
}

export function parseBundledSkill(source: string): ParsedSkill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(source);
  if (match?.[1] === undefined) throw new Error("Bundled skill is missing YAML frontmatter.");
  const name = frontmatterValue(match[1], "name");
  const description = frontmatterValue(match[1], "description");
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) throw new Error("Bundled skill has an invalid name.");
  if (!description) throw new Error(`Bundled skill "${name}" has no description.`);
  return {
    name,
    description,
    content: source.slice(match[0].length),
    userInvocable: frontmatterValue(match[1], "user-invocable") !== "false"
  };
}

export function dshSkillContent(name: string, content: string): string {
  const override = DSH_SKILL_OVERRIDES[name];
  const native = DSH_NATIVE_SKILLS[name];
  return `${DSH_SKILL_BRIDGE}${override === undefined ? "" : `\n<skill-specific-dsh-override>${override}</skill-specific-dsh-override>`}\n\n${native ?? content}`;
}

export function defaultBundledSkillRoot(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return basename(current) === "src"
    ? resolve(current, "../../knowledge/oh-story/skills")
    : resolve(current, "oh-story/skills");
}

export function defaultDramaSkillRoot(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return basename(current) === "src"
    ? resolve(current, "../../knowledge/drama/skills")
    : resolve(current, "drama/skills");
}

export function defaultNovelToGameSkillRoot(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return basename(current) === "src"
    ? resolve(current, "../../knowledge/novel-to-game/skills")
    : resolve(current, "novel-to-game/skills");
}

function createBundledSkillProvider(
  providerName: string,
  skillRoot: string,
  content: (name: string, source: string) => string
): SkillProvider {
  const root = resolve(skillRoot);
  return {
    name: providerName,
    async list(): Promise<readonly SkillCandidate[]> {
      const directories = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      return Promise.all(directories.map(async (directory): Promise<SkillCandidate> => {
        const path = join(root, directory, "SKILL.md");
        const parsed = parseBundledSkill(await readFile(path, "utf8"));
        if (parsed.name !== directory) throw new Error(`Bundled skill directory "${directory}" does not match name "${parsed.name}".`);
        return {
          name: parsed.name,
          description: parsed.description,
          invocation: { modelInvocable: true, userInvocable: parsed.userInvocable },
          provider: providerName,
          source: "bundled",
          resourceBase: { kind: "directory", path: join(root, directory) },
          rank: BUNDLED_SKILL_RANK,
          locator: pathToFileURL(path),
          path
        };
      }));
    },
    async get(candidate): Promise<SkillDefinition | undefined> {
      if (candidate.provider !== providerName || typeof candidate.path !== "string") return undefined;
      const path = resolve(candidate.path);
      const relativePath = relative(root, path);
      if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error("Bundled skill locator escaped the packaged skill root.");
      }
      const parsed = parseBundledSkill(await readFile(path, "utf8"));
      if (parsed.name !== candidate.name) return undefined;
      return {
        name: parsed.name,
        description: parsed.description,
        invocation: { modelInvocable: true, userInvocable: parsed.userInvocable },
        provider: providerName,
        source: "bundled",
        resourceBase: { kind: "directory", path: join(root, parsed.name) },
        path,
        content: content(parsed.name, parsed.content)
      };
    }
  };
}

export function createOhStorySkillProvider(skillRoot = defaultBundledSkillRoot()): SkillProvider {
  return createBundledSkillProvider(STORY_PROVIDER_NAME, skillRoot, dshSkillContent);
}

export function dshDramaSkillContent(name: string, content: string, skillRoot = defaultDramaSkillRoot()): string {
  const entry = DSH_DRAMA_OVERRIDES[name];
  // Resolved per read, not at import: the config path follows the environment
  // the host actually runs with, and matches what /oh-story/drama-preflight reports.
  const override = typeof entry === "function" ? entry(skillRoot) : entry;
  return `${DSH_DRAMA_BRIDGE}${override === undefined ? "" : `\n<skill-specific-dsh-override>${override}</skill-specific-dsh-override>`}\n\n${content}`;
}

export function createDramaSkillProvider(skillRoot = defaultDramaSkillRoot()): SkillProvider {
  return createBundledSkillProvider(DRAMA_PROVIDER_NAME, skillRoot, (name, content) => dshDramaSkillContent(name, content, skillRoot));
}

export function dshNovelToGameSkillContent(_name: string, content: string): string {
  return `${DSH_GAME_BRIDGE}\n\n${content}`;
}

export function createNovelToGameSkillProvider(skillRoot = defaultNovelToGameSkillRoot()): SkillProvider {
  return createBundledSkillProvider(GAME_PROVIDER_NAME, skillRoot, dshNovelToGameSkillContent);
}

export function defaultVideoRecapSkillRoot(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return basename(current) === "src"
    ? resolve(current, "../../knowledge/video-recap/skills")
    : resolve(current, "video-recap/skills");
}

export function dshVideoRecapSkillContent(_name: string, content: string): string {
  return `${DSH_VIDEO_BRIDGE}\n\n${content}`;
}

export function createVideoRecapSkillProvider(skillRoot = defaultVideoRecapSkillRoot()): SkillProvider {
  return createBundledSkillProvider(VIDEO_PROVIDER_NAME, skillRoot, dshVideoRecapSkillContent);
}
