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
  <a href="#start-creating"><b>Start creating</b></a>
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

`oh-story-dsh` is a community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), independent of DeepSeek. It brings four creation pipelines — novels, short drama, interactive games and video recaps — into DSH: DSH manages agents, sessions, models, permissions and Chat; the plugin provides the creation Skills, professional Roles, project contracts and a workbench for each pipeline.

- **Novel**: file tree, editor and Chat in three panes; 13 Oh Story Skills and 7 professional Roles ship with the plugin.
- **Short drama**: per-episode screenplay, visual bible, storyboard, image and video prompts; the Production view projects them into shot and asset boards, and `/short-drama-edit` assembles the final cut.
- **Game**: `/novel-to-game quick` produces a playable build, with live playtest on the left and Chat on the right.
- **Video recap**: turn a local video into a Chinese narrated recap or a dubbed translation, previewing source, rough cut and final in place.

## Installation

Requires Node.js 24+. The install command provides pnpm temporarily, so a machine with only Node.js can run it:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile web add @oh-story/dsh@0.1.9 &&
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

Keep the terminal running; the browser opens automatically by default. If it does not, copy the full `http://127.0.0.1:3080/?token=...` link printed in the terminal — first-time authentication needs the token in the link. Closing the terminal stops the service.

Before creating with AI, add a Provider and API key under DSH's Settings → Models, or set the `DEEPSEEK_API_KEY` environment variable before starting. To only browse existing work, choose "Configure later" in the first-run guide.

<details>
<summary>Install the prebuilt package from the GitHub Release</summary>

The prebuilt package in the GitHub Release passes the same test suite:

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.5-rc.1 dsh plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.9/oh-story-dsh-0.1.9.tgz &&
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

DSH's `plugin add` needs pnpm internally; the `--package pnpm@11.7.0` in the command is there to supply it.

</details>

<details>
<summary>Host dependencies for the video workbench</summary>

The video workbench pipeline additionally needs Python 3.10+ and ffmpeg/ffprobe built with the libass `subtitles` filter on the host (macOS `brew install ffmpeg`, Debian/Ubuntu `sudo apt install ffmpeg`). Video recaps use `MIMO_API_KEY` (and `FISH_API_KEY` for Fish Audio TTS).

</details>

<details>
<summary>Configure media-generation APIs (needed for short-drama production)</summary>

DeepSeek writes the screenplay, storyboard and prompts; images, video and music are generated when short-drama Production hands those prompts to the `short-drama-produce` Skill, which calls the vendor APIs below. Set the keys as host environment variables before starting DSH:

| Capability | Vendor | Required variables | Optional |
| --- | --- | --- | --- |
| Images | GPT Image 2 | `OPENAI_API_KEY` | `OPENAI_BASE_URL` |
| Video | Seedance (Volcengine Ark) | `ARK_API_KEY`, `SEEDANCE_MODEL` | `SEEDANCE_BASE_URL`, `SEEDANCE_ALLOWED_RATIOS`, `SEEDANCE_MIN_DURATION`/`SEEDANCE_MAX_DURATION` |
| Video | MiniMax H3 | `MINIMAX_API_KEY`, `MINIMAX_VIDEO_MODEL`, `MINIMAX_VIDEO_RESOLUTIONS` | `MINIMAX_VIDEO_BASE_URL`, `MINIMAX_VIDEO_RATIOS`, `MINIMAX_VIDEO_MIN_DURATION`/`MINIMAX_VIDEO_MAX_DURATION` |
| Music | MiniMax Music | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` |

```bash
export OPENAI_API_KEY=...            # images
export ARK_API_KEY=... SEEDANCE_MODEL=...   # video; use the model / Endpoint ID enabled on your account
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

Configure only what you use: without a video key you can still write storyboards and generate keyframe images. The top of the short-drama Production view shows whether each vendor is configured and which variable is missing; the plugin only checks whether a variable exists. On startup the plugin registers the four built-in adapters in a credential-free config file (by default under a user-only `oh-story-dsh-<uid>/` directory in the system temp folder; the "generation environment" bar shows the full path), which the agent references directly when it runs `production_tool.py run`. To use your own adapter or change timeouts, point `OH_STORY_DRAMA_ADAPTER_CONFIG` at your file. Per-vendor parameters, resolution and duration constraints are documented in the bundled `short-drama-produce/references/providers/`. Novel covers use whichever image-generation tool is visible in the current Preset.

</details>

## Start creating

On first entry you will see the DSH home page. Click **＋ (Add workspace)** next to Workspaces on the left, choose the folder that holds your work, then select that directory under **Choose workspace** below; DSH opens an empty session. You can also open an existing session from the left. When the directory already contains creation projects, four workbench tabs appear: Novel / Short drama / Game / Video.

An empty directory keeps the native DSH Chat. Once a model is configured, type `/story`, `/short-drama`, `/novel-to-game quick` or `/video-recap` to start; the workbench appears automatically after the agent writes its first creation file. Browsing existing work does not require an API key. A collapsed workbench can be reopened with the "creation workbench" button in the session area.

The requests below are ready to copy, tweak and send — replace the bracketed details first.

**Video recap** — describe the goal directly in Chat:

```text
给 /path/to/video.mp4 做一个 3 分钟中文解说成片，保留关键原声，字幕烧进画面。
把 /path/to/english.mp4 翻译成中文配音，保留原说话人的声音。
```

(“Make a 3-minute Chinese narrated recap of /path/to/video.mp4, keep key original audio, burn subtitles into the picture.” / “Dub /path/to/english.mp4 into Chinese and keep the original speaker's voice.”)

**Existing manuscript — discuss continuation before changing files.** Agree on the creative direction first, then decide whether to turn it into project files:

> Help me plan the next scene of this novel, which I own or am authorized to use. Read only the named [chapter files] and [settings files] in the current workspace. [Final fragment] is unfinished; do not count it as a complete chapter. First list facts relevant to the next scene, what the viewpoint character currently knows, and any missing or conflicting information. Then propose two directions, each explaining the character's want, the obstacle and the visible change caused by their action. Do not reveal [secret] yet; stop at [scene boundary]. Reply only in Chat this turn. Do not create, move or edit files, draft prose or call media services. List uncertainties as questions rather than inventing settled facts.

After choosing a direction, explicitly request an import or planning pass using the bundled workflow and specify whether to write files, whether to draft prose, and the chapter boundary. Keep a backup of the original manuscript.

## If you do not see the interface

- **Install reports `pnpm not found on PATH`**: rerun the full install command above that includes `--package pnpm@11.7.0`, confirm it succeeds, then start.
- **Browser did not open or asks for authentication**: open the full link with `?token=...` printed in the terminal; if the port is taken, use `web --port 3081` and open the newly printed link.
- **No four creation tabs**: add a work directory and open a session first. In an empty directory, run a creation command in Chat; the workbench appears once creation files exist. A collapsed workbench can be restored with the "creation workbench" button in the session area. If existing work still does not show, check that install and start used the same profile, restart DSH and refresh the page.
- **A standalone `story` profile has no web service**: add `@deepseek-ai/dsh-web-app` as described under "Load on demand" below; a new profile needs the Web UI added separately.

## Novel workbench

Three panes: file tree, editor, Chat (see the demo at the top). Covers long-form and short-form writing, topic selection, chart scanning (扫榜), deconstruction (拆文), import, review, de-AI editing (去AI味) and covers. The 13 Oh Story Skills and 7 professional Roles ship with the plugin at a pinned upstream version.

## Short-drama workbench

![Short-drama workbench](docs/images/drama-workbench-demo.gif)

Each episode keeps up to five readable Markdown files on request: `剧本.md` (screenplay), `视觉设定.md` (visual bible), `分镜.md` (storyboard), `图片提示词.md` (image prompts) and `视频提示词.md` (video prompts). The Production view projects those documents into a shot board, an asset board, tasks/versions, final-cut order and a relationship canvas, and flags duplicate IDs, dangling references and format errors in place. Final assembly is handed to `/short-drama-edit`, which writes the scheduled shot order into `剪辑单.md` (the edit decision list) and renders it into `剧集/<EP>/制作成果/成片/`. Production deliveries go through DSH's native session, the current Preset's tools and permission confirmations.

## Game workbench

![Game workbench](docs/images/game-workbench-demo.gif)

Two columns: live playtest on the left, DSH Chat on the right. Output from `/novel-to-game quick` is written to `game-adaptations/<project>/`; once `build/app/index.html` is ready the project appears in the list automatically and can be refreshed, made full-screen or switched. A complete playable build of 《金瓶梅 · 风月总账》 is bundled so you can verify input, the core loop, endings and restart out of the box.

## Video workbench

![Video workbench](docs/images/video-workbench-demo.gif)

Preview on the left, Chat on the right. Projects live in `video-recaps/<project>/`: source footage in `sources/`, upstream working files in `work/`, deliverables in `outputs/`. The workbench switches between source / rough cut / final, shows stage hints, a run checklist and QC artifacts, and streams video over HTTP Range.

## Core experience

- **Live file follow**: when the agent calls the official file tools, the target file is located automatically and the editor shows the content as it is generated.
- **Chat file navigation**: click a work file name in the official Chat and the file tree locates it and opens it in the editor.
- **Creation document preview**: Markdown renders headings, tables, task lists, quotes and code blocks; JSONL is shown as structured records with line numbers, type and status.
- **Project media library**: automatically gathers the real image/video outputs from every episode and delivery directory in the current workspace, with search, type filters and cross-episode references.
- **Real generation contracts**: optional built-in GPT Image 2, Seedance and MiniMax Music adapters; accounts, models, credentials and availability are decided by the DSH runtime and configuration outside the project.
- **Safe editing**: source editing with quick save; unsaved manual edits are never overwritten by a concurrent agent.
- **Stable long conversations**: the message area scrolls independently and the official Composer stays pinned to the bottom of the Chat pane.
- **Stays out of other scenarios**: the workbench only takes over the session layout when the current workspace contains a novel, short-drama, game or video project. It can be collapsed at any time, returning the session to native DSH; the choice is remembered per workspace.

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

The two profiles can run at the same time on different ports. Models, credentials, workspaces and session history are stored centrally by DSH and survive profile switches. Use the same dsh version for install and start; mixing versions produces errors such as `unknown option '--no-open'`.

## FAQ

**Do I need a plugin to write fiction with DeepSeek?** For a synopsis discussion or a revision of supplied text, ordinary model chat is enough — copy the result back into your manuscript. Install DSH plus this plugin when the work should continue around a local writing folder and you want to see the files in a workbench. For an account-based browser project, use the [hosted ZenStory workbench](https://app.zenstory.ai); see the [writing-environment comparison](https://zenstory.ai/compare/writing-workflows).

**Do I need an API key to browse existing work?** No. Choose "Configure later" in the first-run guide and open your work folder to browse the files; configure a model when you start creating with AI.

**The storyboard or game design is written — where do the film and the playable build come from?** The short-drama final cut is rendered by `/short-drama-edit` from `剪辑单.md` and needs the media-generation APIs configured first; the game build is produced by `/game-build` and appears in the game workbench's project list once ready.

## Further reading

- [Writing fiction with DeepSeek](https://zenstory.ai/dsh/deepseek-novel-writing): choose the writing folder, configure the host's model, then specify genre, viewpoint and this turn's stopping point.
- [Import and continue](https://zenstory.ai/oh-story/import-and-continue): distinguish finished chapters from unfinished fragments, settings to preserve, and the next passage's bounds.
- [Short-drama character consistency](https://zenstory.ai/drama-skills/character-consistency): separate identity, look and per-shot state.
- [Meaningful game choices](https://zenstory.ai/novel-to-game/meaningful-choices): connect action costs, visible changes and later consequences.
- [Original sound versus narration](https://zenstory.ai/video-recap/original-audio-and-narration): identify essential dialogue, picture evidence and gaps that need explanation.
- [Writing-environment comparison](https://zenstory.ai/compare/writing-workflows): when plain chat, the DSH plugin or the hosted workbench fits.

## Acknowledgements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the native plugin runtime, agents, sessions, permission approvals and Web workbench foundation.
- [LINUX DO](https://linux.do/): thanks to the community for discussion, feedback and open-source support.

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Security policy](SECURITY.md)

## Part of ZenStory AI

oh-story-dsh is maintained by [ZenStory AI](https://zenstory.ai) — open-source, agent-native tools for creating, adapting and producing stories (GitHub org: [zenstory-ai](https://github.com/zenstory-ai)). Sibling projects:

| Project | What it does |
| --- | --- |
| [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode) | Web-fiction writing skill pack: chart scanning, deconstruction, drafting, de-AI-flavor, covers |
| [drama-skills](https://github.com/zenstory-ai/drama-skills) | AI short-drama / motion-comic suite: scripts, assets, storyboards, image & video prompts, review |
| [novel-to-game](https://github.com/zenstory-ai/novel-to-game) | Agent skills for source-grounded novel adaptation, target-runtime builds, and evidence-based QA |
| [video-recap-skills](https://github.com/zenstory-ai/video-recap-skills) | Create Chinese-narration recaps from supported video files, with optional editable JianYing/CapCut draft export |
| [oh-story-dsh](https://github.com/zenstory-ai/oh-story-dsh) | Community DeepSeek Harness plugin with novel, short-drama, game and video-recap workbenches (this repo) |
| [zenstory](https://github.com/zenstory-ai/zenstory) | Chat-to-create AI novel-writing workbench ([app.zenstory.ai](https://app.zenstory.ai)) |
