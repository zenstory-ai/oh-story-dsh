<p align="center">
  <img src="https://raw.githubusercontent.com/zenstory-ai/zenstory/main/apps/web/public/brand/zenstory-ai-mark.svg" alt="ZenStory AI" width="76" height="76">
</p>

<h1 align="center">Oh Story DSH</h1>

<p align="center">
  <b>为 DeepSeek Harness 打造的小说、短剧、互动游戏与视频解说创作工作台</b>
</p>

<p align="center">
  <a href="https://zenstory.ai/zh/dsh"><b>项目主页</b></a>
  &nbsp;·&nbsp;
  <a href="#安装"><b>快速安装</b></a>
  &nbsp;·&nbsp;
  <a href="#四个工作台"><b>四个工作台</b></a>
  &nbsp;·&nbsp;
  <a href="#看看它的输出"><b>看看它的输出</b></a>
  &nbsp;·&nbsp;
  <a href="README_EN.md"><b>English</b></a>
</p>

<p align="center">
  <a href="https://github.com/zenstory-ai/oh-story-dsh/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/zenstory-ai/oh-story-dsh?style=flat-square&color=22D3EE&logo=github&logoColor=white&label=Stars"></a>
  <a href="https://github.com/zenstory-ai/oh-story-dsh/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/zenstory-ai/oh-story-dsh?style=flat-square&color=081431&label=Release"></a>
  <img alt="Workbenches 4" src="https://img.shields.io/badge/Workbenches-4-081431?style=flat-square">
  <a href="./LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/License-MIT-1F6FEB?style=flat-square"></a>
</p>

## 这是什么

`oh-story-dsh` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的开源社区插件，为 DSH Web 加上**小说、短剧、互动游戏、视频解说**四个创作工作台。Agent、会话、模型配置与权限审批继续走原生 DSH，作品直接以普通文件保存在本地工作区里。

| 工作台 | 内置技能包（随插件固定版本打包） | 常用入口 |
| --- | --- | --- |
| **小说** | [Oh Story 0.10.5](https://github.com/zenstory-ai/oh-story-claudecode/releases/tag/v0.10.5) · 14 Skills · 7 Roles | `/story`、`/story-long-write`、`/story-review`、`/story-publish` |
| **短剧** | [Drama Skills 0.12.1](https://github.com/zenstory-ai/drama-skills/releases/tag/v0.12.1) · 12 Skills | `/short-drama`、`/short-drama-write`、`/short-drama-storyboard`、`/short-drama-edit` |
| **互动游戏** | [NovelToGame 0.9.0](https://github.com/zenstory-ai/novel-to-game/releases/tag/v0.9.0) · 5 Skills | `/novel-to-game quick`、`/game-build`、`/game-qa` |
| **视频解说** | [video-recap-skills 0.7.1](https://github.com/zenstory-ai/video-recap-skills/releases/tag/v0.7.1) · 2 Skills | `/video-recap`、`/video-reference` |

> 当前版本 **v0.1.27**，默认配套 DeepSeek Harness `0.2.2-rc.1`（需 Node.js 24.9+），同时兼容 `0.2.1-rc.5`、`0.2.0-rc.2` 与 `0.2.2-rc.3`。版本记录与迁移说明见 [CHANGELOG.md](CHANGELOG.md)、[Releases](https://github.com/zenstory-ai/oh-story-dsh/releases) 与[升级问答](#升级到新版本后要做什么)。

## 安装

默认配套 DSH `0.2.2-rc.1`，需要 **Node.js 24.9+**（命令已自带临时 `pnpm`，无需提前安装）：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.2-rc.1 dsh plugin --profile web add @oh-story/dsh@0.1.27 &&
npx -y @deepseek-ai/dsh@0.2.2-rc.1 web
```

保持终端开启；浏览器若未自动弹出，复制终端打印的完整 `http://127.0.0.1:3080/?token=...` 链接打开（首次登录靠链接里的 `token` 认证）。进入后在「设置 → 模型」填入 Provider 与 API Key，或在启动前设置环境变量 `DEEPSEEK_API_KEY`；只看本地已有工程可在首次引导点「稍后配置 / Configure later」。

安装和启动请保持同一个 DSH 版本（支持 `>=0.2.0-rc.2 <0.2.1-0`、`>=0.2.1-alpha.1 <0.2.2-0` 与 `>=0.2.2-alpha.2 <0.2.3-0`；改用 `0.2.1-rc.5`、`0.2.0-rc.2` 或 `0.2.2-rc.3` 时把两条命令里的版本号一起替换）。

<details>
<summary>从 GitHub Release 安装预构建包</summary>

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.2-rc.1 dsh plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.27/oh-story-dsh-0.1.27.tgz &&
npx -y @deepseek-ai/dsh@0.2.2-rc.1 web
```

</details>

<details>
<summary>配置短剧媒体生成 API（生图 / 生视频 / 配音 / 配乐）</summary>

DeepSeek 负责写剧本、分镜和提示词；生成图片、视频、配音与配乐时，`short-drama-produce` 调用对应供应商接口（本机需安装 Python 3.9+，合成成片另需 `ffmpeg`/`ffprobe`）。启动 DSH 前按需导出用到的环境变量即可，不配视频 Key 也能写完五份文档并出关键帧图片：

| 能力 | 供应商 | 必需环境变量 | 可选配置 |
| --- | --- | --- | --- |
| 图片 | GPT Image 2 | `OPENAI_API_KEY` | `OPENAI_BASE_URL` |
| 视频 | Seedance（火山方舟） | `ARK_API_KEY`、`SEEDANCE_MODEL` | `SEEDANCE_BASE_URL`、`SEEDANCE_POLL_INTERVAL`、`SEEDANCE_TIMEOUT_SECONDS`、`SEEDANCE_ALLOWED_RATIOS`、`SEEDANCE_MIN_DURATION` / `SEEDANCE_MAX_DURATION` |
| 视频 | MiniMax H3 | `MINIMAX_API_KEY`、`MINIMAX_VIDEO_MODEL` | `MINIMAX_VIDEO_BASE_URL`、`MINIMAX_VIDEO_POLL_INTERVAL`、`MINIMAX_VIDEO_TIMEOUT_SECONDS`、`MINIMAX_VIDEO_ALLOWED_RESOLUTIONS`、`MINIMAX_VIDEO_ALLOWED_RATIOS`、`MINIMAX_VIDEO_MIN_DURATION` / `MINIMAX_VIDEO_MAX_DURATION` |
| 语音 | MiniMax Speech | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` |
| 音乐 | MiniMax Music | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` |

```bash
export OPENAI_API_KEY=...
export ARK_API_KEY=... SEEDANCE_MODEL=...
npx -y @deepseek-ai/dsh@0.2.2-rc.1 web
```

短剧「制作详情」会列出各供应商是否就绪、缺哪个环境变量（只检查变量是否存在，不读取或回传密钥值）。内置 `seedance` 与 `minimax-h3` 默认支持角色参考音频 `reference_audio`（仍请确认所选模型本身支持音频输入）；要自定义适配器、超时或外部 `reference_roles`，把 `OH_STORY_DRAMA_ADAPTER_CONFIG` 指向自定义配置文件即可。参数范围见内置的 `short-drama-produce/references/builtin-providers.md`。

</details>

<details>
<summary>配置视频解说本地依赖（Python / ffmpeg）</summary>

视频解说需要本机安装 **Python 3.10+** 与可在 `PATH` 中调用的 **ffmpeg / ffprobe**（Ubuntu 可执行 `sudo apt install ffmpeg`），并在启动终端设置 `MIMO_API_KEY`；若用 Fish Audio 配音，再补配 `FISH_API_KEY`。`ffmpeg` 带 `libass` 滤镜时默认烧录硬字幕，否则输出外挂 SRT。

</details>

<details>
<summary>装进独立 profile，与日常编程环境分开</summary>

在装有本插件的 profile 下，只要会话模式启用了技能工具（如 `Standard`、`PTC`；`Minimal` 不加载技能），就能调用内置创作技能。想让默认 `web` 环境保持原样，可装进独立的 `story` profile：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.2-rc.1 dsh plugin --profile story add @oh-story/dsh@0.1.27
```

再编辑 `~/.dsh/profiles/story/package.json`，把 Web 界面包排在插件前面：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@oh-story/dsh"
]
```

之后两个环境可用不同端口同时运行，模型配置、工作区与会话记录由 DSH 共享：

```bash
npx -y @deepseek-ai/dsh@0.2.2-rc.1 web                          # 原版 DSH
npx -y @deepseek-ai/dsh@0.2.2-rc.1 --profile story --port 3081  # 创作工作台
```

</details>

## 四个工作台

四个工作台都跑在官方 DSH Web 会话里，右侧对话、模型切换、Token 统计与权限审批均为原生 DSH 界面。只用其中一部分时，可在页卡旁的「工作台设置」隐藏其余页卡，随时点「显示全部」恢复；设置按当前工作区保存，隐藏页卡不会删文件或停用技能。

### 小说工作台

![小说工作台](docs/images/story-workbench-demo.gif)

文件树、Markdown 编辑器与右侧对话同屏联动：Agent 写设定、大纲或正文时编辑器实时跟进，点对话里的文件路径就能打开对应文稿，你正在手动改写的未保存草稿也不会被 Agent 覆盖。覆盖选题、扫榜、拆文、长短篇连载、审稿、去 AI 味、番茄建书资料与封面提示词。

### 短剧工作台

![短剧无限画布工作台](docs/images/drama-canvas-workbench.png)

每集按需维护最多五份文档：`剧本.md`、`视觉设定.md`、`分镜.md`、`图片提示词.md`、`视频提示词.md`。无限画布把剧本场次、角色与场景参考板、分镜关键帧和视频片段串在同一视图里，可自由缩放、切换采用版本，或点选镜头送进右侧对话接着改。「制作详情」会标出重复 ID 与跨文件断链的具体行号；生图、生视频、配音与配乐一律先在对话里预览参数并经你确认才调付费接口，成片由 `/short-drama-edit` 按 `剪辑单.md` 渲染到 `剧集/<EP>/制作成果/成片/`。

### 互动游戏工作台

![游戏创作工作台](docs/images/game-creative-workbench.png)

![游戏创作画布](docs/images/game-creative-canvas.png)

围绕 `game-adaptations/<project>/` 提供「试玩 / 创作画布 / 文稿」三种视图。左侧独立沙箱直接运行 `build/app/index.html` 可玩版本，画布对照展示原著依据、核心玩法、人物世界与当前构建；切视图或收起对话不会打断试玩进度，新构建生成后也由你决定何时载入。

### 视频解说工作台

![视频工作台](docs/images/video-narrative-workbench.png)

![视频创作画布](docs/images/video-narrative-canvas.png)

围绕 `video-recaps/<project>/` 提供「预览 / 创作画布 / 文稿」三种视图。边看成片边核对分段旁白与原声留白，有剪辑映射时可一键跳回原片对应区间；解说词可逐段改写保存，保留原有时间轴且不会擅自重做已有配音。原片放在 `sources/`，中间文件在 `work/`，成片输出到 `outputs/`。

### 共同原则

- **作品全在本地文件里**：界面内容直接读取工作区里的 Markdown、JSON 与媒体文件，不另建封闭数据库，改文件就是改作品。
- **付费生成先确认**：短剧媒体任务先在对话里列出预检结果与参数，你点确认后才调用外部付费接口。
- **代码仓库零打扰**：只有目录里存在创作文件时才展开工作台，随时可一键收起回原版 DSH；职责边界见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 开始创作

点击左侧 **Workspaces** 旁的 **添加工作区 / Add workspace**，选定作品目录并新建会话：

- **已有工程目录**：自动识别并展示「小说 / 短剧 / 游戏 / 视频」页卡，不挑会话模式。
- **全新空目录**：选用支持技能的会话模式（默认的 `Standard` 或 `PTC`），在对话里发 `/story`、`/short-drama`、`/novel-to-game quick` 或 `/video-recap`，写出第一份项目文件后工作台自动展开。空白会话的入门引导可当场关闭，也可在「插件 → `@oh-story/dsh`」随时开关（或通过 `cordis.patch.yml` 的 `welcomeGuide: false` 控制）。

可直接复制下面的开局提示词（替换方括号内容）：

**开一本新书**

> 我想写一部 [都市脑洞 / 历史古代] 长篇，主角开局处境是 [一句话核心设定]。先帮我梳理核心冲突、叙事视角限制和前三章的局面变化，列出还需要我拍板的问题；这一轮先定方向，暂不写正文。

**已有稿件讨论续写**

> 先读《追踪/上下文.md》、[正文/第020章.md] 和相关角色设定，帮我规划下一章的剧情推进。给两个不同的冲突切入方案，分别说明人物动机、阻力以及这场戏打完后的局面变化；先在对话里敲定细纲方向，暂不改文件。

**短剧、游戏改编与视频解说**

```text
用 /short-drama 初始化一部复仇打脸题材短剧，竖屏 9:16，先写第 1 集剧本和视觉设定，暂不生成媒体。
用 /novel-to-game quick 把当前工作区的小说改编成可玩的互动试玩版，首个版本控制在 15 分钟流程内。
用 /video-recap 给 /path/to/video.mp4 制作一条 3 分钟中文解说成片，关键台词保留原声，烧录硬字幕。
```

## 看看它的输出

以下片段节选自仓库内置的演示工程（同步自 [oh-story-claudecode 示例](https://github.com/zenstory-ai/oh-story-claudecode/tree/abe96630d115afbd528f2329e2d8d604d5d5673c/demo/%E9%95%BF%E7%AF%87) 与 [drama-skills 样例](https://github.com/zenstory-ai/drama-skills/tree/37232f6d22e174c36e321d2e3a1a3ae871e7d602/examples/creator-first/EP001)）。

### 1. 小说：剧情追踪与细纲拦截

动笔写第 21 章前，[`追踪/上下文.md`](scripts/demo-fixtures/story/让你管账号，你高燃混剪炸全网/追踪/上下文.md) 记录了当前剧情位置、未回收伏笔与连贯性风险：

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

若 Agent 跳过细纲直接写正文，插件会在写入前当场拦截：

```text
Oh Story 阻止写入第 21 章：未找到对应的 大纲/细纲_第021章*.md。先按 story-long-write 单章流程补建细纲再写正文。
```

### 2. 短剧：五份文档锁定同一镜头

`视觉设定.md` 用连戏锁固定跨镜服装细节，`分镜.md` 规定画面起止与调度，`视频提示词.md` 把动作转写成视频模型可执行的英文提示词：

```markdown
- 连戏锁：LOCK-JIANGCHEN-DRESS《江晨松枝绿常服》（镜头：SHOT-EP001-002、SHOT-EP001-003、SHOT-EP001-007……；图片提示词项：IMG-JIANGCHEN-SHEET）· 锁定词：pine-green lapel service jacket
```

```markdown
## SHOT-EP001-002 · 四个号，四个粉
- 来源：EP001-SC001
- 时长：4s
- 起点：周薄森面对笔记本坐得笔直，右手搭在茶杯旁；江晨双手掌心朝下撑在玻璃桌沿，眼神涣散。
- 动作：哄笑声滚过来，周薄森下颌收紧、腰背又挺直一分；江晨眨了一下眼，眼神猛地聚拢。
- 终点：画面停在周薄森绷紧的脸与屏幕冷光；江晨仍撑着桌沿，留在画右边缘。
```

```markdown
## MOTION-EP001-002 · 四个号，四个粉
> …… The seated officer's jaw tightens and his back straightens a little more.
> The young man blinks once and his eyes snap into focus. ……
```

完整样例：[`剧本.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/剧本.md) · [`视觉设定.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视觉设定.md) · [`分镜.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/分镜.md) · [`图片提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/图片提示词.md) · [`视频提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视频提示词.md)。

### 3. 跨文件断链定位到行号

分镜引用了不存在的剧本场次、视频提示词绑错镜头号或图片 ID 重复时，短剧「制作详情」会直接报出文件名与行号：

```text
SHOT-EP001-002 的来源 EP001-SC009 在剧本中不存在。            分镜.md:36
MOTION-EP001-003 指向不存在的 SHOT-EP001-030。                 视频提示词.md:31
IMG-JIANGCHEN-SHEET 在当前集内重复，后出现的条目会遮蔽前一条。   图片提示词.md:3
```

## 常见问题

### 我已经在用 Claude Code 或 Codex，还需要装这个插件吗？

不需要，四套技能本身都是独立的开源仓库（[oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode)、[drama-skills](https://github.com/zenstory-ai/drama-skills)、[novel-to-game](https://github.com/zenstory-ai/novel-to-game)、[video-recap-skills](https://github.com/zenstory-ai/video-recap-skills)），可直接装进常用编程 Agent；偏好免配置的在线小说与短剧工作台也可用 [ZenStory](https://app.zenstory.ai)。本插件把这四套技能打包进 DeepSeek Harness，并加上 DSH Web 的四个图形工作台。若本机 `~/.agents/skills` 装过同名 Skill，启动前设 `DSH_AGENTS_HOME=~/.dsh-agents` 即可强制使用插件内置版本。

### 装上插件后，平时用 DSH 写代码会被影响吗？

不会，工作台只在包含创作文件的目录里出现，普通代码仓库保持原版界面。你也可以随时在顶栏收起工作台，或按[安装](#安装)中的折叠说明装进独立的 `story` profile。

### DeepSeek 会直接生成图片和视频吗？Token 怎么计费？

插件自身不发起隐藏的模型请求，对话与子角色（Role）消耗的 Token 全部由 DSH 原生统计并显示在每条回复下方。DeepSeek 只负责写文稿和提示词，图片、视频、配音与配乐由 `short-drama-produce` 调用你配置的第三方媒体 API。不配视频 Key 也能写完五份短剧文档并出关键帧图片。

### 安装报错、要求认证，或进入后看不到四个工作台标签？

报 `pnpm not found on PATH` 时，使用[安装](#安装)中带 `--package pnpm@11.7.0` 的完整命令即可。提示需要认证或 `3080` 端口被占用时，打开终端打印的完整 `?token=...` 链接，或改用 `web --port 3081` 重新启动。看不到工作台标签时，确认 `plugin add` 与 `web` 用了同一 DSH 版本和同一 profile（自定义 profile 的 `bundles` 需含 `@deepseek-ai/dsh-web-app`），空目录先在对话里运行 `/story` 等命令写出首个文件后工作台就会展开。

### 支持 Windows、macOS 和 Linux 吗？

支持，每次提交都会在 macOS、Windows 与 Linux CI 上跑完类型、内置技能校验、单测与构建检查。本地脚本按不同工作流依赖对应的本地工具：小说拆文与追踪需 Python 3 和 Node.js 18+，短剧生产与成片合成需 Python 3.9+ 和 `ffmpeg`/`ffprobe`（渲染画面文字另需 Node.js），视频解说需 Python 3.10+ 和 `ffmpeg`/`ffprobe`。

### 升级到新版本后要做什么？

把[安装](#安装)命令里 `@oh-story/dsh@` 后的版本号改成最新版，重新运行 `plugin add` 并重启 DSH 即可，内置 Skills 与 Roles 会随插件自动更新。旧版工程的字段与参数迁移说明见 [CHANGELOG.md](CHANGELOG.md)。

## 致谢

- <https://github.com/deepseek-ai/deepseek-harness>
- <https://linux.do>

## ZenStory AI 项目

本仓库由 [ZenStory AI](https://zenstory.ai/zh)（GitHub：[@zenstory-ai](https://github.com/zenstory-ai)）维护，同系列开源项目：

| 项目 | 用途 |
| --- | --- |
| [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode) | 网文写作技能包：扫榜、拆文、大纲细纲、长短篇写作、伏笔追踪、去 AI 味与封面生成 |
| [drama-skills](https://github.com/zenstory-ai/drama-skills) | AI 短剧与漫剧制作技能包：原著与对标拆解、剧本、视觉设定、分镜、生图/生视频提示词、确认后生产与剪辑成片 |
| [novel-to-game](https://github.com/zenstory-ai/novel-to-game) | 小说改游戏技能包：通读拆书、玩法与美术设计、代码构建与盲玩验收，支持网页、互动影游与微信/抖音/TapTap 小游戏 |
| [video-recap-skills](https://github.com/zenstory-ai/video-recap-skills) | AI 视频解说技能包：自动切镜、看画面写解说词、配音混音合成硬字幕成片，并可导出剪映 / CapCut 草稿 |
| [oh-story-dsh](https://github.com/zenstory-ai/oh-story-dsh) | DeepSeek Harness 社区插件：集成网文写作、短剧漫剧、小说改游戏与视频解说四个可视化工作台（本仓库） |
| [zenstory](https://github.com/zenstory-ai/zenstory) | 对话即创作的 AI 小说与短剧网页工作台（[app.zenstory.ai](https://app.zenstory.ai)） |

<sub>本项目为独立开源社区插件，与 DeepSeek 官方无隶属、合作或背书关系；DeepSeek Harness 名称与相关品牌标识归其权利人所有。</sub>
