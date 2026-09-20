<!-- Last synced with README.md: 2026-09-20 -->

<p align="center">
  <img src="https://zenstory.ai/brand/zenstory-ai-mark.svg" alt="" width="76" height="76">
</p>

<h1 align="center">Oh Story DSH</h1>

<p align="center">
  <b>A novel, short-drama, interactive-game and video-recap creation workbench for DeepSeek Harness.</b>
</p>

<p align="center">
  <a href="https://zenstory.ai/dsh"><b>Project page</b></a>
  &nbsp;·&nbsp;
  <a href="#installation"><b>Install</b></a>
  &nbsp;·&nbsp;
  <a href="#see-what-it-produces"><b>See what it produces</b></a>
  &nbsp;·&nbsp;
  <a href="README.md"><b>中文</b></a>
</p>

<p align="center">
  <a href="https://github.com/zenstory-ai/oh-story-dsh/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/zenstory-ai/oh-story-dsh?style=flat-square&color=22D3EE&logo=github&logoColor=white&label=Stars"></a>
  <a href="https://github.com/zenstory-ai/oh-story-dsh/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/zenstory-ai/oh-story-dsh?style=flat-square&color=081431&label=Release"></a>
  <img alt="Workbenches 4" src="https://img.shields.io/badge/Workbenches-4-081431?style=flat-square">
  <a href="./LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/License-MIT-1F6FEB?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://github.com/zenstory-ai/oh-story-dsh/issues"><img alt="GitHub Issues" src="https://img.shields.io/badge/GitHub%20Issues-181717?style=for-the-badge&logo=github&logoColor=white"></a>
</p>

## What it is

`oh-story-dsh` is a community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), independent of DeepSeek. Install it and DSH Web gains four creation workbenches: novel, short drama, game and video recap. Agents, sessions, models, permission approvals and Chat stay entirely native DSH; the plugin adds only creation Skills, professional Roles, project file contracts and the workbench UI, with no second agent runtime or project database.

| Workbench | Upstream capability (pinned, bundled with the plugin) | Main entry points |
| --- | --- | --- |
| Novel | [Oh Story 0.7.10](https://github.com/zenstory-ai/oh-story-claudecode/releases/tag/v0.7.10) · 13 Skills · 7 Roles | `/story`, `/story-long-write`, `/story-review` |
| Short drama | [Drama Skills 0.7.0](https://github.com/zenstory-ai/drama-skills/releases/tag/v0.7.0) · 11 Skills | `/short-drama`, `/short-drama-write`, `/short-drama-storyboard`, `/short-drama-edit` |
| Game | [NovelToGame 0.3.1](https://github.com/zenstory-ai/novel-to-game) · 7 Skills · playable 《金瓶梅》 sample | `/novel-to-game quick`, `/game-build`, `/game-qa` |
| Video | [video-recap-skills 0.5.0](https://github.com/zenstory-ai/video-recap-skills) · 6 Skills | `/video-recap`, `/video-script` |

> Latest release **v0.1.9** (2026-09-10). See [CHANGELOG.md](CHANGELOG.md) and [Releases](https://github.com/zenstory-ai/oh-story-dsh/releases); upgrade steps are in the FAQ entry [“What do I do after upgrading?”](#what-do-i-do-after-upgrading).

## The four workbenches

All four animations below are the packaged plugin running inside the official DSH Web, captured during a native integration-test run; the Chat on the right, the model, token usage and timing are DSH's own.

### Novel

![Novel workbench](docs/images/story-workbench-demo.gif)

File tree, editor and Chat in three panes. The editor follows the agent as it writes, and clicking a file name in Chat opens it in the editor. Covers long-form and short-form writing, topic selection, chart scanning (扫榜), deconstruction (拆文), import, review, de-AI editing (去AI味) and covers.

### Short drama

![Short-drama workbench](docs/images/drama-workbench-demo.gif)

Each episode keeps at most five Markdown files: `剧本.md` (screenplay), `视觉设定.md` (visual bible), `分镜.md` (storyboard), `图片提示词.md` (image prompts) and `视频提示词.md` (video prompts). The Production view projects them into a shot board, an asset board, jobs/versions, final-cut order and a relationship canvas, and flags duplicate IDs, dangling references and format errors in place. Image, video and music jobs are previewed and confirmed by you before any vendor API is called; the final cut is rendered by `/short-drama-edit` from `剪辑单.md` (the edit decision list) into `剧集/<EP>/制作成果/成片/`.

### Game

![Game workbench](docs/images/game-workbench-demo.gif)

Live playtest on the left, Chat on the right. Output from `/novel-to-game quick` goes to `game-adaptations/<project>/`; once `build/app/index.html` is ready the project appears in the list and can be refreshed, made full-screen or switched. Games run on a separate origin inside an iframe sandbox.

### Video recap

![Video workbench](docs/images/video-workbench-demo.gif)

Preview on the left, Chat on the right. Projects live in `video-recaps/<project>/`: source footage in `sources/`, working files in `work/`, deliverables in `outputs/`. Switch between source, rough cut and final, and inspect stage hints, the run checklist and QC artifacts; video streams over HTTP Range.

### Rules shared by all four

- **Files are the creative truth**: the workbench only projects the project's files and writes no parallel database; editing a file is editing that layer of the decision. Unsaved manual edits are never overwritten by a concurrent agent write.
- **Anything that costs money is confirmed first**: every job that calls a vendor API is shown with its exact content and runs only after you confirm; keys live only in host environment variables, and the plugin reports only whether they are set.
- **It stays out of other sessions**: the layout is taken over only when the current workspace actually contains a creative project; it can be collapsed at any time, returning the session to native DSH, and the choice is remembered per workspace.

Boundaries and protocols for each workbench are in the [architecture notes](docs/ARCHITECTURE.md).

## Installation

Requires Node.js 24+. The install command provides pnpm temporarily, so a machine with only Node.js can run it:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile web add @oh-story/dsh@0.1.9 &&
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

Keep the terminal running; the browser opens automatically by default. If it does not, copy the full `http://127.0.0.1:3080/?token=...` link printed in the terminal — first-time authentication needs the token in the link. Closing the terminal stops the service. Use the same dsh version for install and start.

Before creating with AI, add a Provider and API key under DSH's Settings → Models, or set the `DEEPSEEK_API_KEY` environment variable before starting. To only browse existing work, choose "Configure later" in the first-run guide.

<details>
<summary>Install the prebuilt package from the GitHub Release</summary>

The prebuilt package in the GitHub Release passes the same test suite:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.9/oh-story-dsh-0.1.9.tgz &&
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

</details>

<details>
<summary>Host dependencies for the video workbench</summary>

The video pipeline additionally needs Python 3.10+ and ffmpeg/ffprobe built with the libass `subtitles` filter on the host (macOS `brew install ffmpeg`, Debian/Ubuntu `sudo apt install ffmpeg`). Video recaps use `MIMO_API_KEY` (Fish Audio TTS additionally needs `FISH_API_KEY`).

</details>

<details>
<summary>Configure media-generation APIs (needed for short-drama production)</summary>

DeepSeek writes the screenplay, storyboard and prompts; image, video and music generation is handed by short-drama Production to the `short-drama-produce` Skill, which calls the vendor APIs below. Set the keys as host environment variables before starting DSH:

| Capability | Vendor | Required variables | Optional |
| --- | --- | --- | --- |
| Images | GPT Image 2 | `OPENAI_API_KEY` | `OPENAI_BASE_URL` |
| Video | Seedance (Volcengine Ark) | `ARK_API_KEY`, `SEEDANCE_MODEL` | `SEEDANCE_BASE_URL`, `SEEDANCE_ALLOWED_RATIOS`, `SEEDANCE_MIN_DURATION`/`SEEDANCE_MAX_DURATION` |
| Video | MiniMax H3 | `MINIMAX_API_KEY`, `MINIMAX_VIDEO_MODEL`, `MINIMAX_VIDEO_RESOLUTIONS` | `MINIMAX_VIDEO_BASE_URL`, `MINIMAX_VIDEO_RATIOS`, `MINIMAX_VIDEO_MIN_DURATION`/`MINIMAX_VIDEO_MAX_DURATION` |
| Music | MiniMax Music | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` |

```bash
export OPENAI_API_KEY=...            # images
export ARK_API_KEY=... SEEDANCE_MODEL=...   # video; use the model / endpoint ID enabled on your account
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

Configure only what you use: without a video key you can still write storyboards and generate keyframe images. The top of the Production view shows whether each vendor is configured and which variable is missing. At startup the plugin registers the four built-in adapters in a credential-free config file (by default under `oh-story-dsh-<uid>/` in the system temp directory, readable and writable only by the current user; the "generation environment" bar shows the full path), and the agent references it directly when running `production_tool.py run`. To use your own adapter or change timeouts, point `OH_STORY_DRAMA_ADAPTER_CONFIG` at your own file. Each vendor's parameters, resolutions and duration limits are documented in the bundled `short-drama-produce/references/providers/`. Novel covers use whichever image-generation tool is visible in the current Preset.

</details>

<details>
<summary>Install into a separate profile and start on demand</summary>

Whichever profile the plugin is installed into, every Session of that profile loads the creation Skills. To keep the stock `web` profile clean, install into a separate profile:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile story add @oh-story/dsh@0.1.9
```

A new profile has no UI by default. Edit `~/.dsh/profiles/story/package.json` and set `dsh.profile.bundles` to:

```jsonc
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@oh-story/dsh"
]
```

`@deepseek-ai/dsh-web-app` is DSH's own Web UI package and must load before the creation plugin. The two profiles can then run at the same time on different ports; models, credentials, workspaces and session history are stored centrally by DSH:

```bash
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web                          # stock DSH
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile story --port 3081  # creation workbench
```

</details>

## Start creating

On first entry you see the DSH home page. Click **＋ (Add workspace)** next to Workspaces on the left, pick the folder that holds your work, then select it under **Choose workspace**; DSH opens a blank session. If the folder already contains creative projects, the four workbench tabs "小说 / 短剧 / 游戏 / 视频" (novel / short drama / game / video) appear. An empty folder keeps DSH's native Chat: type `/story`, `/short-drama`, `/novel-to-game quick` or `/video-recap` to begin, and the workbench appears once the agent writes the first creative file.

The requests below can be copied and adapted; replace the bracketed parts before sending.

**Start a new book**:

> I want to start a new [genre] novel. First separate settled facts from open questions in the material I provide; plan only a bounded opening, delivering the core conflict, viewpoint limits, the changes across the first three chapters and the open items. Do not draft prose automatically; leave genre trade-offs, character motivation and long-term direction for me to confirm.

**Existing manuscript — discuss the continuation first**:

> I want to plan the next scene of this novel, which I own or am licensed to adapt. Read only the [chapter files] and [setting files] I name in the current workspace. [Final fragment] is unfinished; do not count it as a complete chapter. First list facts relevant to the next scene, what the viewpoint character currently knows, and any missing or conflicting information. Then propose two directions, each explaining the character's want, the obstacle and the visible change caused by their action. Do not reveal [secret] yet; stop at [scene boundary]. Reply only in Chat this turn; do not create, move or edit files.

**Short drama, game, video recap** — state the goal directly:

```text
用 /short-drama 初始化一个都市打脸题材的短剧项目，竖屏 9:16，只写第 1 集，先不生成任何媒体。
用 /novel-to-game quick 把 [小说文件] 改编成可玩游戏，平台、类型和引擎由你推荐，首个构建控制在 15 分钟以内。
给 /path/to/video.mp4 做一个 3 分钟中文解说成片，保留关键原声，字幕烧进画面。
```

(“Use /short-drama to set up a vertical 9:16 urban face-slap short-drama project; write only episode 1 and generate no media yet.” / “Use /novel-to-game quick to adapt [novel file] into a playable game; recommend platform, genre and engine, and keep the first build to about 15 minutes.” / “Make a 3-minute Chinese narrated recap of /path/to/video.mp4, keep key original audio, burn subtitles into the picture.”)

## See what it produces

Excerpts from the bundled sample projects (synchronized from the [oh-story-claudecode demo](https://github.com/zenstory-ai/oh-story-claudecode/tree/abe96630d115afbd528f2329e2d8d604d5d5673c/demo/%E9%95%BF%E7%AF%87) and the [drama-skills public sample](https://github.com/zenstory-ai/drama-skills/tree/bc96c5eb9c91cccd1c613c2b34645c35f1989a28/examples/creator-first/EP001)); omissions are marked "……".

### Continuation runs on a state card, not chat memory

Before chapter 21 is written, [`追踪/上下文.md`](scripts/demo-fixtures/story/让你管账号，你高燃混剪炸全网/追踪/上下文.md) (the tracking context) looks like this, and the next chapter reads only it:

```markdown
## 当前位置
- 当前章：第20章
- 场景：火箭军文工团，钟嘉嘉送来老兵书法礼后
……
## 活跃伏笔
- F016｜钟嘉嘉并非普通军报实习生，她的军方家庭背景仍未完全公开｜埋第7章｜回收章未定｜高
……
## 连贯性风险
- 第21章尚无细纲，不能直接写正文。
```

(Current position: chapter 20 … Active foreshadowing: F016, Zhong Jiajia is no ordinary intern … Continuity risk: chapter 21 has no outline yet; do not write prose directly.) The last line is a hard gate. Prose written without an outline is refused by DSH's `tools/pre-execute` hook:

```text
Oh Story 阻止写入第 21 章：未找到对应的 大纲/细纲_第XXX章*.md。请先完成细纲。
```

(“Oh Story blocked writing chapter 21: no matching outline file found. Finish the chapter outline first.”)

### One shot owns one layer in each of the five short-drama documents

`视觉设定.md` (visual bible) locks a look that must survive across shots, with a lock face that pastes into a prompt verbatim; `分镜.md` (storyboard) writes only start, end and basis; `视频提示词.md` (video prompt) writes only the motion between them:

```markdown
- 连续性锁：LOCK-JIANGCHEN-DRESS《江晨橄榄绿立领常服》（镜头：SHOT-EP001-002、SHOT-EP001-003、SHOT-EP001-007）· 锁面：olive-green stand-collar service dress
```

```markdown
## SHOT-EP001-002 · 把空白交到他手里
- 来源：EP001-SC001
- 时长：8s
- 起点：材料在周薄森手下，茶缸停在旧茶渍旁。
- 终点：纸角抵住江晨指尖；周薄森说出“基本还是空白”。
- 视觉依据：《视觉设定.md》·人物「江晨」……；道具「缺口搪瓷茶缸」（控制：右侧把手缺瓷、深灰铁胎）。
```

```markdown
## MOTION-EP001-002 · 把空白交到他手里
> …… The middle-aged officer pushes the paper stack about twenty centimeters across the glass desk while speaking calmly.
> The young man does not reach for it until the paper touches his fingertip. ……
```

(Storyboard: source scene EP001-SC001, 8 s; start: papers under Zhou's hand, mug by the old tea ring; end: paper corner at Jiang's fingertip as Zhou says “basically still blank”; visual basis: the two characters and the chipped enamel mug from the bible.) Sources: [`剧本.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/剧本.md) · [`视觉设定.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视觉设定.md) · [`分镜.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/分镜.md) · [`图片提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/图片提示词.md) · [`视频提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视频提示词.md).

### Mistakes are pointed out

Break the sample episode in three places (a source pointing at a scene that does not exist, a video prompt pointing at a non-existent shot, a duplicated image-prompt ID) and the Production view reports the cause and the line:

```text
SHOT-EP001-002 的来源 EP001-SC009 在剧本中不存在。            分镜.md:21
MOTION-EP001-003 指向不存在的 SHOT-EP001-030。                 视频提示词.md:29
IMG-JIANGCHEN-SHEET 在当前集内重复，后出现的条目会遮蔽前一条。   图片提示词.md:3
```

(“Source EP001-SC009 does not exist in the screenplay.” / “Points at the non-existent SHOT-EP001-030.” / “Duplicated within this episode; the later entry shadows the earlier one.”)

### The bundled game's QA record

[`qa/verification.json`](packages/knowledge/novel-to-game/examples/jin-ping-mei/qa/verification.json) for 《金瓶梅 · 风月总账》 records the six checks and, beyond them, what it does not prove:

```json
"checks": { "launch": "PASS", "render": "PASS", "input": "PASS", "coreLoop": "PASS", "outcome": "PASS", "restart": "PASS" },
"limitations": [ ……
  { "scope": "体验判断", "reason": "证据只证明可运行、可输入、可走完、可重开及布局约束，不把主观趣味或长期平衡宣称为确定结论。" }
]
```

(Scope “experience judgement”: the evidence proves only that the game launches, accepts input, can be played through and restarted, and respects layout constraints; it does not claim subjective fun or long-term balance.)

## FAQ

### Do I need a plugin to write fiction with DeepSeek?

For a synopsis discussion or a revision of supplied text, ordinary model chat is enough — copy the result back into your manuscript. Install DSH plus this plugin when the work should continue around a local writing folder and you want to see the files in a workbench. For an account-based browser project, use the [hosted ZenStory workbench](https://app.zenstory.ai); see the [writing-environment comparison](https://zenstory.ai/compare/writing-workflows).

### I use Claude Code or Codex. Should I install this?

No. The four pipelines are standalone skill repositories that install directly into the coding agent you already use: [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode), [drama-skills](https://github.com/zenstory-ai/drama-skills), [novel-to-game](https://github.com/zenstory-ai/novel-to-game) and [video-recap-skills](https://github.com/zenstory-ai/video-recap-skills). This plugin is the packaging of those four Skill sets for DeepSeek Harness, plus the four workbenches that exist only in DSH Web.

### Do I need an API key to browse existing work?

No. Choose "Configure later" in the first-run guide and open your work folder to browse the files; configure a model when you start creating with AI.

### How much does it cost in tokens?

The plugin never calls a model itself; DSH shows the usage under every reply, and this repository publishes no statistics. Two things add noticeably: the Skill text loads into every Session of the profile, including coding sessions, which a separate profile avoids; and flows such as `/story-long-write` start professional Roles, each a separate sub-agent call.

### Does DeepSeek generate images and video itself? What can I do without a video key?

No. DeepSeek only writes the screenplay, storyboard and prompts; media is generated by `short-drama-produce` through GPT Image 2, Seedance, MiniMax H3 or MiniMax Music, with keys set as host environment variables before DSH starts, and only for the vendors you use. Without a video key you can still finish all five documents and generate keyframe images.

### The storyboard or game design is written — where do the film and the playable build come from?

The short-drama final cut is rendered by `/short-drama-edit` from `剪辑单.md`; it needs the media-generation APIs configured and per-shot footage produced first. The game build is produced by `/game-build` and appears in the game workbench's project list once `build/app/index.html` is ready.

### After installing, did my ordinary coding sessions also turn into three panes?

They did before 0.1.7 ([#29](https://github.com/zenstory-ai/oh-story-dsh/issues/29)). Now the layout is taken over only when the current workspace really contains a creative project; otherwise the plugin does not appear in the UI at all. The "collapse creation workbench" control in the workbench title bar hides it at any time, and the choice is remembered per workspace.

### A long reply in the right-hand Chat is hidden behind the input box?

Reported in [#3](https://github.com/zenstory-ai/oh-story-dsh/issues/3) and [#26](https://github.com/zenstory-ai/oh-story-dsh/issues/26). Since 0.1.6 the body re-pins to the bottom after the window is resized, and 0.1.8 removed the last trigger. If it still reproduces on 0.1.9, open an issue with the version and window width.

### Install reports `pnpm not found on PATH`?

DSH's `plugin add` needs pnpm internally, and running `npx @deepseek-ai/dsh ... plugin add` on its own will not supply it. Rerun the full install command above that includes `--package pnpm@11.7.0`, confirm it succeeds, then start.

### The browser did not open, or asks for authentication?

Open the full link with `?token=...` printed in the terminal; first-time authentication needs that token. If the port is taken, use `web --port 3081` and open the newly printed link.

### I do not see the four tabs "小说 / 短剧 / 游戏 / 视频"?

Add a work directory and open a session first. In an empty directory, run a creation command in Chat; the workbench appears once the agent has written the first creative file. A collapsed workbench can be restored with the "creation workbench" button in the session area. If existing work still does not show, check that install and start used the same profile, restart DSH and refresh the page. A standalone `story` profile that has no web UI needs `@deepseek-ai/dsh-web-app` added, as described in the collapsed section under Installation.

### Does it work on Windows?

Yes. The type, asset, unit-test and build gate runs on both macOS and Windows in CI on every change; the integration test that packages the plugin into the official DSH Web runs on Linux. The video pipeline needs Python 3.10+ and ffmpeg with libass on every platform.

### What do I do after upgrading?

Rerun the install command with the new version after `@oh-story/dsh@`, then restart DSH; use the same dsh version for install and start. Skills and Roles ship inside the plugin, so nothing needs to be redeployed into your project. Existing short-drama projects should note two tightenings: since 0.1.5 every storyboard shot must state its "视觉依据" (visual basis) and every `REF-*` slot must declare a `用途` (purpose); since 0.1.7 every shot's "来源" (source) must begin with a scene ID that really exists in `剧本.md`. See [CHANGELOG.md](CHANGELOG.md) for each release.

## Further reading

- [Writing fiction with DeepSeek](https://zenstory.ai/dsh/deepseek-novel-writing): choose the writing folder, configure the host's model, then specify genre, viewpoint and this turn's stopping point.
- [Import and continue](https://zenstory.ai/oh-story/import-and-continue): distinguish finished chapters from unfinished fragments, settings to preserve, and the next passage's bounds.
- [Short-drama character consistency](https://zenstory.ai/drama-skills/character-consistency): separate identity, look and per-shot state.
- [Meaningful game choices](https://zenstory.ai/novel-to-game/meaningful-choices): connect action costs, visible changes and later consequences.
- [Original sound versus narration](https://zenstory.ai/video-recap/original-audio-and-narration): identify essential dialogue, picture evidence and gaps that need explanation.
- [Writing-environment comparison](https://zenstory.ai/compare/writing-workflows): when plain chat, the DSH plugin or the hosted workbench fits.
- [Architecture](docs/ARCHITECTURE.md): what DSH owns, what the plugin owns, and the protocol boundary of each workbench.
- [Validation](docs/VALIDATION.md): what each test layer covers and which evidence stays out of Pull Request CI.

## Contributing and support

- **GitHub Issues**: [bugs, output-quality cases, feature requests](https://github.com/zenstory-ai/oh-story-dsh/issues/new/choose); include the plugin version, DSH version and reproduction steps.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code: `pnpm verify` is the quality gate for every Pull Request, and `pnpm test:dsh` packages the plugin and runs it inside an isolated official DSH Web.

## Acknowledgements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the native plugin runtime, agents, sessions, permission approvals and Web workbench foundation.
- [LINUX DO](https://linux.do/): thanks to the community for discussion, feedback and open-source support.

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Security policy](SECURITY.md)

## Part of ZenStory AI

Oh Story DSH is maintained by [ZenStory AI](https://zenstory.ai) — open-source, agent-native tools for creating, adapting and producing stories (GitHub org: [zenstory-ai](https://github.com/zenstory-ai)). Sibling projects:

| Project | What it does |
| --- | --- |
| [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode) | Web-fiction writing skill pack: chart scanning, deconstruction, drafting, de-AI-flavor, covers |
| [drama-skills](https://github.com/zenstory-ai/drama-skills) | AI short-drama / motion-comic suite: scripts, assets, storyboards, image & video prompts, review |
| [novel-to-game](https://github.com/zenstory-ai/novel-to-game) | Agent skills for source-grounded novel adaptation, target-runtime builds, and evidence-based QA |
| [video-recap-skills](https://github.com/zenstory-ai/video-recap-skills) | Create Chinese-narration recaps from supported video files, with optional editable JianYing/CapCut draft export |
| [oh-story-dsh](https://github.com/zenstory-ai/oh-story-dsh) | Community DeepSeek Harness plugin with novel, short-drama, game and video-recap workbenches (this repo) |
| [zenstory](https://github.com/zenstory-ai/zenstory) | Chat-to-create AI novel-writing workbench ([app.zenstory.ai](https://app.zenstory.ai)) |
