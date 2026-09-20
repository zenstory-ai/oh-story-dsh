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

![Novel workbench](docs/images/story-workbench-demo.gif)

Above is the packaged plugin running inside the official DSH Web, captured during a native integration-test run: the file tree of the bundled sample novel 《让你管账号，你高燃混剪炸全网》 (chapters 1–20) on the left, the chapter editor in the middle, and DSH's native Chat on the right. Model, token usage and timing are displayed by DSH itself.

## What it is

`oh-story-dsh` is a community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), independent of DeepSeek. It brings four creation pipelines — novels, short drama, interactive games and video recaps — into the DSH you already run:

- **DSH runs the agent, the plugin runs the craft** — agents, sessions, models, permission approvals and Chat are all native DSH. The plugin only adds creation Skills, professional Roles, project file contracts and four workbenches; there is no second agent runtime, render queue or project database.
- **Four pipelines from four open-source repositories at pinned versions** — the 13 Skills and 7 Roles of Oh Story 0.7.10, the 11 Skills of Drama Skills 0.7.0, the 7 Skills of NovelToGame 0.3.1 and the 6 Skills of video-recap-skills 0.5.0 ship inside the plugin, with every file's hash recorded in a manifest.
- **Files are the creative truth** — a novel keeps settings, outlines, prose and tracking in separate folders; a short-drama episode keeps at most five Markdown files; games and videos each have their own project directory. The workbench only projects those files into shot boards, a playtest window or a preview. Editing a file is editing that layer of the decision.
- **Anything that costs money is confirmed first** — image, video and music jobs appear in the Production view with their exact content before any vendor API is called; vendor keys live only in host environment variables, and the plugin reports only whether they are set.
- **It stays out of your other sessions** — the workbench takes over the session layout only when the current workspace actually contains a novel, short-drama, game or video project, and it can be collapsed at any time to return the session to native DSH.

> Latest release **v0.1.9** (2026-09-10). See [CHANGELOG.md](CHANGELOG.md) and [Releases](https://github.com/zenstory-ai/oh-story-dsh/releases) for every change, and the FAQ entry [“What do I do after upgrading?”](#what-do-i-do-after-upgrading) for the upgrade steps.

## Installation

Requires Node.js 24+. The install command provides pnpm temporarily, so a machine with only Node.js can run it:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile web add @oh-story/dsh@0.1.9 &&
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

Keep the terminal running; the browser opens automatically by default. If it does not, copy the full `http://127.0.0.1:3080/?token=...` link printed in the terminal — first-time authentication needs the token in the link. Closing the terminal stops the service. Use the same dsh version for install and start; mixing versions produces errors such as `unknown option '--no-open'`.

Before creating with AI, add a Provider and API key under DSH's Settings → Models, or set the `DEEPSEEK_API_KEY` environment variable before starting. To only browse existing work, choose "Configure later" in the first-run guide.

<details>
<summary>Install the prebuilt package from the GitHub Release</summary>

The prebuilt package in the GitHub Release passes the same test suite:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.9/oh-story-dsh-0.1.9.tgz &&
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

DSH's `plugin add` needs pnpm internally; the `--package pnpm@11.7.0` in the command supplies it.

</details>

<details>
<summary>Host dependencies for the video workbench</summary>

The video workbench pipeline additionally needs Python 3.10+ and ffmpeg/ffprobe built with the libass `subtitles` filter on the host (macOS `brew install ffmpeg`, Debian/Ubuntu `sudo apt install ffmpeg`). Video recaps use `MIMO_API_KEY` (Fish Audio TTS additionally needs `FISH_API_KEY`).

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

Configure only what you use: without a video key you can still write storyboards and generate keyframe images. The top of the short-drama Production view shows whether each vendor is configured and which variable is missing; the plugin only checks that variables exist. At startup the plugin registers the four built-in adapters in a credential-free config file (by default under `oh-story-dsh-<uid>/` in the system temp directory, readable and writable only by the current user; the "generation environment" bar shows the full path), and the agent references it directly when running `production_tool.py run`. To use your own adapter or change timeouts, point `OH_STORY_DRAMA_ADAPTER_CONFIG` at your own file. Each vendor's parameters, resolutions and duration limits are documented in the bundled `short-drama-produce/references/providers/`. Novel covers use whichever image-generation tool is visible in the current Preset.

</details>

## Start creating

On first entry you see the DSH home page. Click **＋ (Add workspace)** next to Workspaces on the left, pick the folder that holds your work, then select it under **Choose workspace**; DSH opens a blank session. You can also open an existing session from the left. If the folder already contains creative projects, the four workbench tabs "小说 / 短剧 / 游戏 / 视频" (novel / short drama / game / video) appear.

An empty folder keeps DSH's native Chat. Once a model is configured, type `/story`, `/short-drama`, `/novel-to-game quick` or `/video-recap` to begin; the workbench appears automatically once the agent writes the first creative file. Browsing existing work needs no API key. A collapsed workbench can be reopened with the "creation workbench" button in the session area.

The requests below can be copied and adapted; replace the bracketed parts before sending.

**Video recap** — describe the goal directly in Chat:

```text
给 /path/to/video.mp4 做一个 3 分钟中文解说成片，保留关键原声，字幕烧进画面。
把 /path/to/english.mp4 翻译成中文配音，保留原说话人的声音。
```

("Make a 3-minute Chinese narrated recap of /path/to/video.mp4, keep key original audio, burn subtitles into the picture." / "Dub /path/to/english.mp4 into Chinese and keep the original speaker's voice.")

**Existing manuscript — discuss the continuation first**, then decide whether to touch project files:

> I want to plan the next scene of this novel, which I own or am licensed to adapt. Read only the [chapter files] and [setting files] I name in the current workspace. [Final fragment] is unfinished; do not count it as a complete chapter. First list facts relevant to the next scene, what the viewpoint character currently knows, and any missing or conflicting information. Then propose two directions, each explaining the character's want, the obstacle and the visible change caused by their action. Do not reveal [secret] yet; stop at [scene boundary]. Reply only in Chat this turn. Do not create, move or edit files, draft prose or call media services. List uncertainties as questions rather than inventing settled facts.

After choosing a direction, explicitly request an import or planning pass using the bundled workflow and specify whether to write files, whether to draft prose, and the chapter boundary. Keep a backup of the original manuscript.

## See what it produces

Every excerpt below comes from a file in this repository or from a real check run against those files; omissions are marked with "……". The novel and short-drama samples are the bundled example projects, synchronized from the [oh-story-claudecode demo](https://github.com/zenstory-ai/oh-story-claudecode/tree/abe96630d115afbd528f2329e2d8d604d5d5673c/demo/%E9%95%BF%E7%AF%87) (the project author's own serial, rebuilt from its 20 published chapters with `/story-import`) and the [drama-skills public sample](https://github.com/zenstory-ai/drama-skills/tree/bc96c5eb9c91cccd1c613c2b34645c35f1989a28/examples/creator-first/EP001).

### Continuation runs on this state card, not on chat memory

Open `追踪/上下文.md` (the tracking context) in the novel workbench and this is what you see for the sample novel before chapter 21 is written. `/story-long-write` does not rely on conversation memory: continuity lives in this single seven-section file, and the next chapter reads only it:

```markdown
## 当前位置
- 当前章：第20章
- 卷：第一卷·军宣整顿（候选）（始于第1章）
- 故事时间：《如愿》点击破亿后的第二天
- 场景：火箭军文工团，钟嘉嘉送来老兵书法礼后

## 长期约束
- 军宣爽点必须通过作品效果、传播数据和围观反应链兑现，不能只靠系统播报。
……
- 钟嘉嘉未公开的军方培养安排属于作者真相，正文揭示前不能当成读者已知。

## 活跃伏笔
- F016｜钟嘉嘉并非普通军报实习生，她的军方家庭背景仍未完全公开｜埋第7章｜回收章未定｜高
……
- F055｜《离别开出花》伴奏已经到手，下一首作品尚未启动｜埋第20章｜回收章未定｜高

## 下一章承诺
- 先补第21章细纲，再承接老兵邀请、新歌伴奏和钢琴能力。

## 连贯性风险
- 第一卷卷界仍是候选方案，未确认前不要擅自开新卷。
- 第21章尚无细纲，不能直接写正文。
```

The sections shown are current position, long-term constraints, active foreshadowing, the promise for the next chapter, and continuity risks. The last line, "chapter 21 has no chapter outline yet; do not write prose directly", is more than a reminder: the plugin hooks the long-form outline gate into DSH's `tools/pre-execute`, so when the agent tries to create prose without an outline the write is denied and Chat shows this:

```text
Oh Story 阻止写入第 21 章：未找到对应的 大纲/细纲_第XXX章*.md。请先完成细纲。
```

(“Oh Story blocked writing chapter 21: no matching 大纲/细纲_第XXX章*.md found. Finish the chapter outline first.”) Sources: [`追踪/上下文.md`](scripts/demo-fixtures/story/让你管账号，你高燃混剪炸全网/追踪/上下文.md) · [`追踪/伏笔.md`](scripts/demo-fixtures/story/让你管账号，你高燃混剪炸全网/追踪/伏笔.md).

### How one shot travels through the five short-drama documents

A short-drama episode keeps only `剧本.md` (screenplay), `视觉设定.md` (visual bible), `分镜.md` (storyboard), `图片提示词.md` (image prompts) and `视频提示词.md` (video prompts). The same shot owns one layer in each. The screenplay only says what happens:

```markdown
桌对面，周薄森把一摞材料推过厚玻璃桌面。纸角碰到江晨指尖。
……
周薄森端起缺口搪瓷茶缸，抿一口冷茶，眉头皱得更深。
```

(Across the desk, Zhou Bosen pushes a stack of papers over the thick glass top; a corner touches Jiang Chen's fingertip. … Zhou lifts the chipped enamel mug, sips cold tea, frowns harder.) The visual bible puts a "continuity lock" on any look that must survive across shots; the lock face is a phrase that can be pasted into a prompt verbatim:

```markdown
- 连续性锁：LOCK-JIANGCHEN-DRESS《江晨橄榄绿立领常服》（镜头：SHOT-EP001-002、SHOT-EP001-003、SHOT-EP001-007；
  图片提示词项：IMG-JIANGCHEN-SHEET）· 锁面：olive-green stand-collar service dress
```

The storyboard writes the shot's start, end and the entries it relies on; the frozen keyframe draws only the starting frame:

```markdown
## SHOT-EP001-002 · 把空白交到他手里

- 来源：EP001-SC001
- 时长：8s
- 起点：材料在周薄森手下，茶缸停在旧茶渍旁。
- 终点：纸角抵住江晨指尖；周薄森说出“基本还是空白”。
- 视觉依据：《视觉设定.md》·人物「江晨」（控制：身份、体态、本集造型）；人物「周薄森」……；道具「缺口搪瓷茶缸」（控制：右侧把手缺瓷、深灰铁胎）。

### 冻结关键帧提示词
> 9:16 vertical two-person medium shot inside an old regiment office, Zhoubosen, a broad square-faced middle-aged officer on frame right
> rests one hand on a stack of papers ……, Jiangchen, a lean young man in olive-green stand-collar service dress, seen three-quarter
> from behind on frame left ……; chipped white enamel mug beside an old tea ring, …… no text, no logo.
```

The video prompt writes only the motion the model must perform between start and end:

```markdown
## MOTION-EP001-002 · 把空白交到他手里
### 可复制提示词
> …… The middle-aged officer pushes the paper stack about twenty centimeters across the glass desk while speaking calmly.
> The young man does not reach for it until the paper touches his fingertip. The officer then lifts the chipped white enamel
> mug for one small sip, frowns at the cold tea, and returns it exactly to the old tea ring. ……
```

The short-drama workbench's Production view projects these five documents into a shot board, an asset board, jobs/versions, final-cut order and a relationship canvas. Clicking the image or video button on a shot card sends a prepare-only `/short-drama-produce` request to the current session; the job stays at "awaiting confirmation" until you confirm, and only then does the agent execute it. The five sources: [`剧本.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/剧本.md) · [`视觉设定.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视觉设定.md) · [`分镜.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/分镜.md) · [`图片提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/图片提示词.md) · [`视频提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视频提示词.md).

### When a document is wrong, the Production view says so

Break the sample episode above in three places on purpose — point SHOT-EP001-002's source at `EP001-SC009`, a scene the screenplay does not have; point MOTION-EP001-003 at the non-existent `SHOT-EP001-030`; reuse Jiang Chen's `IMG-JIANGCHEN-SHEET` ID for Zhou Bosen's character sheet — and hand it to the workbench's document parser. It reports the cause and the location, down to the line in the source document:

```text
SHOT-EP001-002 的来源 EP001-SC009 在剧本中不存在。            分镜.md:21
MOTION-EP001-003 指向不存在的 SHOT-EP001-030。                 视频提示词.md:29
IMG-JIANGCHEN-SHEET 在当前集内重复，后出现的条目会遮蔽前一条。   图片提示词.md:3 · :11
```

(“SHOT-EP001-002's source EP001-SC009 does not exist in the screenplay.” / “MOTION-EP001-003 points at the non-existent SHOT-EP001-030.” / “IMG-JIANGCHEN-SHEET is duplicated within this episode; the later entry shadows the earlier one.”) The broken copy lived only in a temporary directory and is not committed. The untouched sample yields only six warnings, saying the characters, locations and props in `视觉设定.md` have not declared a stable `- ID：VISUAL-*`, so renaming a heading would change the canvas node's identity. Paid jobs are never silently resubmitted either: when a confirmed production turn ends without a matching result appearing in the workspace, the job card reads “DSH Turn 已结束，尚未发现关联成果。任务可能已派发，请先刷新成果，避免重复计费。” (“The DSH turn has ended and no related result was found. The job may have been dispatched; refresh results first to avoid double billing.”) instead of retrying.

### What the bundled game's QA record says, and what it does not

The game workbench ships a complete playable build of 《金瓶梅 · 风月总账》 (Jin Ping Mei · Ledger of Desire). Its bundled [`qa/verification.json`](packages/knowledge/novel-to-game/examples/jin-ping-mei/qa/verification.json) is NovelToGame's record of the six checks:

```json
  "status": "PASS",
  ……
  "completeRun": {
    "id": "jin-ping-mei-release-candidate-2026-08-22",
    "cleanContext": true,
    "terminal": "day-20-unstable-ending",
    "restart": "day-1-opening",
    ……
  },
  "checks": {
    "launch": "PASS",
    "render": "PASS",
    "input": "PASS",
    "coreLoop": "PASS",
    "outcome": "PASS",
    "restart": "PASS"
  },
  "limitations": [
    ……
    {
      "scope": "浏览器与路径",
      "reason": "当前候选在本机 Chromium 完成正常速度键盘主路径和六个目标视口；未穷举其他浏览器与所有结局。"
    },
    {
      "scope": "体验判断",
      "reason": "证据只证明可运行、可输入、可走完、可重开及布局约束，不把主观趣味或长期平衡宣称为确定结论。"
    },
    ……
  ]
```

The record lists four limitations; the second and third are excerpted here. They say: the candidate completed the normal-speed keyboard main path and six target viewports in local Chromium, without exhausting other browsers or every ending; and the evidence proves only that the game launches, accepts input, can be played through, can be restarted and respects layout constraints, without claiming subjective fun or long-term balance as settled. A project you adapt yourself with `/novel-to-game quick` produces a record of the same shape, and appears in the game workbench's project list once `build/app/index.html` is ready.

## Novel workbench

File tree, editor and Chat in three panes (see the animation at the top). Covers long-form and short-form writing, topic selection, chart scanning (扫榜), deconstruction (拆文), import, review, de-AI editing (去AI味) and covers. The 13 Oh Story Skills and 7 professional Roles ship with the plugin at a pinned upstream version; Roles start through DSH's sub-agent mechanism and can only use the tools visible to the caller.

## Short-drama workbench

![Short-drama workbench](docs/images/drama-workbench-demo.gif)

Each episode keeps up to five readable Markdown files on request. The Production view projects those documents into a shot board, an asset board, jobs/versions, final-cut order and a relationship canvas, and flags duplicate IDs, dangling references and format errors in place. Final assembly is handed to `/short-drama-edit`, which writes the scheduled shot order into `剪辑单.md` (the edit decision list) and renders it into `剧集/<EP>/制作成果/成片/`. Production deliveries go through DSH's native session, the current Preset's tools and permission confirmations.

## Game workbench

![Game workbench](docs/images/game-workbench-demo.gif)

Two columns: live playtest on the left, DSH Chat on the right. Output from `/novel-to-game quick` is written to `game-adaptations/<project>/`; once `build/app/index.html` is ready the project appears in the list automatically and can be refreshed, made full-screen or switched. Generated games run on a separate origin inside an iframe sandbox.

## Video workbench

![Video workbench](docs/images/video-workbench-demo.gif)

Preview on the left, Chat on the right. Projects live in `video-recaps/<project>/`: source footage in `sources/`, upstream working files in `work/`, deliverables in `outputs/`. The workbench switches between source / rough cut / final, shows stage hints, a run checklist and QC artifacts, and streams video over HTTP Range.

## Core experience

- **Live file follow**: when the agent calls the official file tools, the target file is located automatically and the editor shows the content as it is generated.
- **Chat file navigation**: click a work file name in the official Chat and the file tree locates it and opens it in the editor.
- **Creation document preview**: Markdown renders headings, tables, task lists, quotes and code blocks; JSONL is shown as structured records with line numbers, type and status.
- **Project media library**: automatically gathers the real image/video outputs from every episode and delivery directory in the current workspace, with search, type filters and cross-episode references.
- **Real generation contracts**: optional built-in GPT Image 2, Seedance and MiniMax Music adapters; accounts, models, credentials and availability are decided by the DSH runtime and configuration outside the project.
- **Safe editing**: source editing with quick save; saves carry a file-version precondition, so unsaved manual edits are never overwritten by a concurrent agent.
- **Stable long conversations**: the message area scrolls independently and the official Composer stays pinned to the bottom of the Chat pane.
- **Stays out of other scenarios**: the workbench only takes over the session layout when the current workspace contains a novel, short-drama, game or video project. It can be collapsed at any time, and the choice is remembered per workspace.

The capability boundaries and protocol constraints of each workbench are described in the [architecture notes](docs/ARCHITECTURE.md).

## Capability catalogue

| Workbench | Upstream capability | Main entry points |
| --- | --- | --- |
| Novel | [Oh Story 0.7.10](https://github.com/zenstory-ai/oh-story-claudecode/releases/tag/v0.7.10) · 13 Skills · 7 Roles | `/story`, `/story-long-write`, `/story-review` |
| Short drama | [Drama Skills 0.7.0](https://github.com/zenstory-ai/drama-skills/releases/tag/v0.7.0) · 11 Skills | `/short-drama`, `/short-drama-write`, `/short-drama-storyboard`, `/short-drama-edit` |
| Game | [NovelToGame 0.3.1](https://github.com/zenstory-ai/novel-to-game) · 7 Skills · playable 《金瓶梅》 sample | `/novel-to-game quick`, `/game-build`, `/game-qa` |
| Video | [video-recap-skills 0.5.0](https://github.com/zenstory-ai/video-recap-skills) · 6 Skills | `/video-recap`, `/video-script` |

## Load on demand

Whichever profile the plugin is installed into, every Session of that profile loads the creation Skills; the workbench itself only shows when a creation project exists. To keep the stock `web` profile clean and open the workbench only when creating, install the plugin into a separate profile.

**1. Install into a separate profile**

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile story add @oh-story/dsh@0.1.9
```

**2. Add the interface**

A new profile has no UI by default. Edit `~/.dsh/profiles/story/package.json` and set `dsh.profile.bundles` to:

```jsonc
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@oh-story/dsh"
]
```

`@deepseek-ai/dsh-web-app` is DSH's own Web UI package and must load before the creation plugin.

**3. Start on demand**

```bash
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web                          # stock DSH
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile story --port 3081  # creation workbench
```

The two profiles can run at the same time on different ports. Models, credentials, workspaces and session history are stored centrally by DSH and survive profile switches.

## FAQ

### Do I need a plugin to write fiction with DeepSeek?

For a synopsis discussion or a revision of supplied text, ordinary model chat is enough — copy the result back into your manuscript. Install DSH plus this plugin when the work should continue around a local writing folder and you want to see the files in a workbench. For an account-based browser project, use the [hosted ZenStory workbench](https://app.zenstory.ai); see the [writing-environment comparison](https://zenstory.ai/compare/writing-workflows).

### I use Claude Code or Codex. Should I install this?

No. The four pipelines are standalone skill repositories that install directly into the coding agent you already use: [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode), [drama-skills](https://github.com/zenstory-ai/drama-skills), [novel-to-game](https://github.com/zenstory-ai/novel-to-game) and [video-recap-skills](https://github.com/zenstory-ai/video-recap-skills). This plugin is the packaging of those four Skill sets for DeepSeek Harness, plus the four workbenches that exist only in DSH Web.

### How much does it cost in tokens?

The plugin never calls a model itself; all usage happens in DSH's agent, and DSH shows the usage and timing of every reply right under it, so treat that as the source of truth. Three things affect usage: the Skill text loads into every Session of the profile, including coding sessions, which the "Load on demand" section above avoids by installing into a separate profile; flows such as `/story-long-write` start professional Roles through `oh_story_role`, each of which is a separate sub-agent call; and the Reference Gate before drafting requires the current stage's reference material to be read to the end. This repository publishes no usage statistics.

### After installing, did my ordinary coding sessions also turn into three panes?

They did before 0.1.7 ([#29](https://github.com/zenstory-ai/oh-story-dsh/issues/29)). Now the layout is taken over only when the current workspace really contains a novel, short-drama, game or video project; the bundled 《金瓶梅》 sample does not count. Without a creative project the plugin does not appear in the UI at all, and neither `Ctrl/Cmd+S` nor file-name clicks in Chat are intercepted. Every workbench's title bar has a "collapse creation workbench" control; collapsing returns the session to native DSH immediately, and the choice is remembered per workspace in browser storage.

### A long reply in the right-hand Chat is hidden behind the input box?

Reported in [#3](https://github.com/zenstory-ai/oh-story-dsh/issues/3) and [#26](https://github.com/zenstory-ai/oh-story-dsh/issues/26). Since 0.1.6 the body re-pins to the bottom after the window is resized, and 0.1.8 removed the last trigger. If it still reproduces on 0.1.9, open an issue with the version and window width.

### Install reports `pnpm not found on PATH`?

DSH's `plugin add` needs pnpm internally, and running `npx @deepseek-ai/dsh ... plugin add` on its own will not supply it. Rerun the full install command above that includes `--package pnpm@11.7.0`, confirm it succeeds, then start.

### The browser did not open, or asks for authentication?

Open the full link with `?token=...` printed in the terminal; first-time authentication needs that token. If the port is taken, use `web --port 3081` and open the newly printed link.

### I do not see the four tabs "小说 / 短剧 / 游戏 / 视频"?

Add a work directory and open a session first. In an empty directory, run a creation command in Chat; the workbench appears once the agent has written the first creative file. A collapsed workbench can be restored with the "creation workbench" button in the session area. If existing work still does not show, check that install and start used the same profile, restart DSH and refresh the page. A standalone `story` profile that has no web UI needs `@deepseek-ai/dsh-web-app` added as described under "Load on demand".

### Does DeepSeek generate images and video itself? What can I do without a video key?

No. DeepSeek only writes the screenplay, storyboard and prompts; media is generated by `short-drama-produce` through GPT Image 2, Seedance, MiniMax H3 or MiniMax Music, with keys set as host environment variables before DSH starts, and only for the vendors you use. Without a video key you can still finish all five documents and generate keyframe images. The "generation environment" bar at the top of the Production view shows, vendor by vendor, whether it is configured and which variable is missing; the plugin checks only that variables exist.

### Do I need an API key to browse existing work?

No. Choose "Configure later" in the first-run guide and open your work folder to browse the files; configure a model when you start creating with AI.

### The storyboard or game design is written — where do the film and the playable build come from?

The short-drama final cut is rendered by `/short-drama-edit` from `剪辑单.md` into `剧集/<EP>/制作成果/成片/`; it needs the media-generation APIs configured and per-shot footage produced first. The game build is produced by `/game-build` and appears in the game workbench's project list once `build/app/index.html` is ready.

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
