<p align="center">
  <img src="https://zenstory.ai/brand/zenstory-ai-mark.svg" alt="" width="76" height="76">
</p>

<h1 align="center">Oh Story DSH</h1>

<p align="center">
  <b>小说、短剧、互动游戏与视频解说创作工作台，装进 DeepSeek Harness。</b>
</p>

<p align="center">
  <a href="https://zenstory.ai/zh/dsh"><b>项目主页</b></a>
  &nbsp;·&nbsp;
  <a href="#安装"><b>安装</b></a>
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

<p align="center">
  <a href="https://github.com/zenstory-ai/oh-story-dsh/issues"><img alt="GitHub Issues" src="https://img.shields.io/badge/GitHub%20Issues-181717?style=for-the-badge&logo=github&logoColor=white"></a>
</p>

## 这是什么

`oh-story-dsh` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的社区插件，与 DeepSeek 无隶属关系。装上它，DSH Web 里多出四个创作工作台：小说、短剧、游戏、视频解说。Agent、会话、模型、权限审批和 Chat 仍然全是 DSH 原生的，插件只添加创作 Skills、专业 Roles、项目文件协议和工作台界面，不带第二套 Agent 运行时或项目数据库。

| 工作台 | 上游能力（固定版本，随插件打包） | 主要入口 |
| --- | --- | --- |
| 小说 | [Oh Story 0.8.0](https://github.com/zenstory-ai/oh-story-claudecode/releases/tag/v0.8.0) · 13 Skills · 7 Roles | `/story`、`/story-long-write`、`/story-review` |
| 短剧 | [Drama Skills 0.7.1](https://github.com/zenstory-ai/drama-skills/releases/tag/v0.7.1) · 11 Skills | `/short-drama`、`/short-drama-write`、`/short-drama-storyboard`、`/short-drama-edit` |
| 游戏 | [NovelToGame 0.4.0](https://github.com/zenstory-ai/novel-to-game) · 7 Skills · 《金瓶梅》可玩示例 | `/novel-to-game quick`、`/game-build`、`/game-qa` |
| 视频 | [video-recap-skills 0.5.0](https://github.com/zenstory-ai/video-recap-skills) · 6 Skills | `/video-recap`、`/video-script` |

> 最新版本 **v0.1.10**（2026-09-25），需要 DeepSeek Harness `0.1.7-rc.2`。变更见 [CHANGELOG.md](CHANGELOG.md) 与 [Releases](https://github.com/zenstory-ai/oh-story-dsh/releases)；升级步骤见常见问题[「升级到新版本后要做什么」](#升级到新版本后要做什么)。

## 四个工作台

下面四段动图都是打包后的插件装进官方 DSH Web 的真实画面，取自原生集成测试的录制；右侧 Chat、模型、用量和耗时都是 DSH 自己的。

### 小说

![小说工作台](docs/images/story-workbench-demo.gif)

文件树、编辑器、Chat 三栏。Agent 写文件时编辑器跟着它走，点 Chat 里的文件名就能在编辑器打开。覆盖长篇、短篇、选题、扫榜、拆文、导入、审稿、去 AI 味与封面。

### 短剧

![短剧工作台](docs/images/drama-workbench-demo.gif)

每集最多五份 Markdown：`剧本.md`、`视觉设定.md`、`分镜.md`、`图片提示词.md`、`视频提示词.md`。「生产」视图把它们投影成镜头板、素材板、任务/版本、成片顺序和关系画布，并就地指出重复 ID、悬空引用与格式错误。生图、生视频、配音、生音乐的任务先预览、你确认后才调用供应商 API；成片由 `/short-drama-edit` 按《剪辑单.md》渲染到 `剧集/<EP>/制作成果/成片/`。

### 游戏

![游戏工作台](docs/images/game-workbench-demo.gif)

左侧实时试玩、右侧 Chat。`/novel-to-game quick` 的产物写进 `game-adaptations/<project>/`，`build/app/index.html` 就绪后自动进入项目列表，可刷新、全屏、切换项目。游戏在独立 origin 与 iframe sandbox 里运行。

### 视频解说

![视频工作台](docs/images/video-workbench-demo.gif)

左侧预览、右侧 Chat。项目放在 `video-recaps/<project>/`：原片在 `sources/`，工作产物在 `work/`，交付在 `outputs/`。可在原片、剪后片、成片之间切换，查看阶段提示、运行清单与质检产物；视频经 HTTP Range 流式预览。

### 四个工作台共同的规矩

- **文件就是创作事实**：工作台只投影项目里的文件，不写并行数据库；改哪份文件就是改哪一层决定。人工未保存的内容不会被并发的 Agent 写入覆盖。
- **花钱的事先确认**：任何调用供应商 API 的任务都先在界面上看到准确内容，明确确认后才执行；Key 只放在宿主机环境变量里，插件只报告有没有配。
- **不占别的场景**：只有当前 workspace 里真的有创作项目时才接管布局，随时可收起，收起后会话回到 DSH 原生形态，选择按 workspace 记住。

各工作台的边界与协议见[架构说明](docs/ARCHITECTURE.md)。

## 安装

需要 Node.js 24+。安装命令会临时提供 pnpm，只装了 Node.js 的机器也能执行：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.7-rc.2 dsh plugin --profile web add @oh-story/dsh@0.1.10 &&
npx -y @deepseek-ai/dsh@0.1.7-rc.2 web
```

保持终端运行，浏览器默认自动打开；没有自动打开就复制终端打印的完整 `http://127.0.0.1:3080/?token=...` 链接访问，首次认证需要链接里的 token。关闭终端会停止服务。安装与启动请使用同一个 dsh 版本：插件声明只兼容 DSH `0.1.7` 这一条补丁线。DSH 0.1.7 起会在安装与加载时检查，版本不符时给出不兼容提示而不是加载（`dsh plugin allow-version` 可自担风险放行）；更早的 DSH 不做这项检查，照样加载。不带版本号的 `npx @deepseek-ai/dsh` 目前解析到 npm `latest`（`0.1.5-rc.3`），与本版不兼容，两条命令都要写明 `@deepseek-ai/dsh@0.1.7-rc.2`。

开始 AI 创作前，在 DSH 的「设置 → 模型」中添加 Provider 并填入 API Key，或在启动前设置环境变量 `DEEPSEEK_API_KEY`。只查看已有作品可在首次引导中选择「稍后配置 / Configure later」。

<details>
<summary>从 GitHub Release 安装预构建包</summary>

GitHub Release 中的预构建包经过同一套测试：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.7-rc.2 dsh plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.10/oh-story-dsh-0.1.10.tgz &&
npx -y @deepseek-ai/dsh@0.1.7-rc.2 web
```

</details>

<details>
<summary>视频工作台的宿主机依赖</summary>

视频流水线还需要宿主机安装 Python 3.10+ 与带 libass `subtitles` 滤镜的 ffmpeg/ffprobe（macOS `brew install ffmpeg`，Debian/Ubuntu `sudo apt install ffmpeg`）。视频解说另用 `MIMO_API_KEY`（Fish Audio TTS 另需 `FISH_API_KEY`）。

</details>

<details>
<summary>配置媒体生成 API（短剧生产需要）</summary>

DeepSeek 负责写剧本、分镜和提示词；生图、生视频、配音、生音乐由短剧「生产」交给 `short-drama-produce` Skill，再调用下面的供应商 API 完成。Key 在启动 DSH 之前写入宿主机环境变量：

| 能力 | 供应商 | 必需环境变量 | 可选 |
| --- | --- | --- | --- |
| 图片 | GPT Image 2 | `OPENAI_API_KEY` | `OPENAI_BASE_URL` |
| 视频 | Seedance（火山方舟） | `ARK_API_KEY`、`SEEDANCE_MODEL` | `SEEDANCE_BASE_URL`、`SEEDANCE_ALLOWED_RATIOS`、`SEEDANCE_MIN_DURATION`/`SEEDANCE_MAX_DURATION` |
| 视频 | MiniMax H3 | `MINIMAX_API_KEY`、`MINIMAX_VIDEO_MODEL`、`MINIMAX_VIDEO_RESOLUTIONS`、`MINIMAX_VIDEO_MIN_DURATION`/`MINIMAX_VIDEO_MAX_DURATION` | `MINIMAX_VIDEO_BASE_URL`、`MINIMAX_VIDEO_RATIOS` |
| 语音 | MiniMax Speech | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` |
| 音乐 | MiniMax Music | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` |

```bash
export OPENAI_API_KEY=...            # 图片
export ARK_API_KEY=... SEEDANCE_MODEL=...   # 视频，模型/Endpoint ID 以账号开通的为准
npx -y @deepseek-ai/dsh@0.1.7-rc.2 web
```

只配置用得到的那几个即可：没有视频 Key 仍然可以写分镜、生成关键帧图片。「生产」视图顶部会显示每个供应商是否已配置、缺哪个变量。插件启动时会把这五个内置 adapter 登记到一份不含凭据的配置文件（默认在系统临时目录下仅当前用户可读写的 `oh-story-dsh-<uid>/` 里，「生成环境」条会显示完整路径），Agent 运行 `production_tool.py run` 时直接引用它；自己写 adapter 或改超时，就把文件路径写进 `OH_STORY_DRAMA_ADAPTER_CONFIG`。每个供应商的参数、分辨率与时长约束见随包的 `short-drama-produce/references/providers/`。小说封面使用当前 Preset 里可见的图片生成工具。

</details>

<details>
<summary>装进独立 profile，按需启动</summary>

插件装进哪个 profile，那个 profile 的每个 Session 就都会加载创作 Skills。想让原版 `web` 保持干净，就把插件装进独立 profile：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.1.7-rc.2 dsh plugin --profile story add @oh-story/dsh@0.1.10
```

新 profile 默认没有界面。编辑 `~/.dsh/profiles/story/package.json`，把 `dsh.profile.bundles` 改成：

```jsonc
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@oh-story/dsh"
]
```

`@deepseek-ai/dsh-web-app` 是 DSH 自带的 Web 界面包，需要在创作插件之前加载。之后两个 profile 用不同端口可以同时运行，模型、凭据、workspace 与历史会话由 DSH 统一保存：

```bash
npx -y @deepseek-ai/dsh@0.1.7-rc.2 web                          # 原版 DSH
npx -y @deepseek-ai/dsh@0.1.7-rc.2 --profile story --port 3081  # 创作工作台
```

</details>

## 开始创作

首次启动时，DSH 会在「文稿」目录下自动建一个 **默认工作区 / Default workspace**（`deepseek-harness/default-workspace`），并直接打开其中的空白会话，Oh Story 的使用引导显示在会话首页。要在自己的作品目录里创作，点击左侧 Workspaces 旁的 **添加工作区 / Add workspace**，选择存放作品的文件夹，再在下方 **选择工作区 / Choose workspace** 中选中该目录；创作文件会写进当前会话所属的工作区。目录里已有创作项目时，会显示「小说 / 短剧 / 游戏 / 视频」四个工作台标签；空目录保留 DSH 原生 Chat，输入 `/story`、`/short-drama`、`/novel-to-game quick` 或 `/video-recap` 开始，Agent 写出第一个创作文件后工作台自动出现。

下面的请求复制改一改就能用，替换方括号内容后发送。

**开一本新书**：

> 我想开一部 [类型/题材] 新书。先从我提供的材料中分开已确定事实与待决问题；只规划一个有边界的开篇，交付核心冲突、视角限制、前三章变化和待决项。不要自动写正文；题材取舍、角色动机和长期方向留给我确认。

**已有稿件，第一轮只讨论续写方案**：

> 我想规划这部自有或已获授权小说的下一场戏。只阅读当前 workspace 中我点名的 [章节文件] 和 [设定文件]；[末尾片段] 尚未写完，不要把它算成完整章节。先列出与下一场戏有关的已知事实、视角人物目前知道的事，以及尚缺或冲突的信息。再给两个续写方向，分别说明人物要什么、阻力是什么、行动造成什么可见变化；不要提前揭示 [秘密]，停在 [场景边界]。本轮只在 Chat 回复，不创建、移动或改写任何文件。

**短剧、游戏、视频解说**，直接说目标：

```text
用 /short-drama 初始化一个都市打脸题材的短剧项目，竖屏 9:16，只写第 1 集，先不生成任何媒体。
用 /novel-to-game quick 把 [小说文件] 改编成可玩游戏，平台、类型和引擎由你推荐，首个构建控制在 15 分钟以内。
给 /path/to/video.mp4 做一个 3 分钟中文解说成片，保留关键原声，字幕烧进画面。
```

## 看看它的输出

节选自随包示例工程（同步自 [oh-story-claudecode 的 demo](https://github.com/zenstory-ai/oh-story-claudecode/tree/abe96630d115afbd528f2329e2d8d604d5d5673c/demo/%E9%95%BF%E7%AF%87) 与 [drama-skills 的公开样例](https://github.com/zenstory-ai/drama-skills/tree/bc96c5eb9c91cccd1c613c2b34645c35f1989a28/examples/creator-first/EP001)），省略处以「……」标出。

### 续写靠状态卡，不靠对话记忆

写第 21 章之前，[`追踪/上下文.md`](scripts/demo-fixtures/story/让你管账号，你高燃混剪炸全网/追踪/上下文.md) 长这样，下一章只读它：

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

最后一行是硬门禁。没有细纲就写正文，写入会被 DSH 的 `tools/pre-execute` 钩子拒绝：

```text
Oh Story 阻止写入第 21 章：未找到对应的 大纲/细纲_第021章*.md。先按 story-long-write 单章流程补建细纲再写正文。
```

### 一个镜头在短剧五份文档里各管一层

`视觉设定.md` 给跨镜不变的造型上锁，锁面能原样贴进提示词；`分镜.md` 只写起点、终点和依据；`视频提示词.md` 只写两点之间的动作：

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

原文：[`剧本.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/剧本.md) · [`视觉设定.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视觉设定.md) · [`分镜.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/分镜.md) · [`图片提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/图片提示词.md) · [`视频提示词.md`](scripts/demo-fixtures/drama/让你管账号/剧集/EP001/视频提示词.md)。

### 写错了会被指出来

把这集样例故意改坏三处（来源指向不存在的场景、视频提示词指向不存在的镜头、图片提示词 ID 重复），「生产」视图报的是原因和行号：

```text
SHOT-EP001-002 的来源 EP001-SC009 在剧本中不存在。            分镜.md:21
MOTION-EP001-003 指向不存在的 SHOT-EP001-030。                 视频提示词.md:29
IMG-JIANGCHEN-SHEET 在当前集内重复，后出现的条目会遮蔽前一条。   图片提示词.md:3
```

### 随包游戏的 QA 记录

《金瓶梅 · 风月总账》的 [`qa/verification.json`](packages/knowledge/novel-to-game/examples/jin-ping-mei/qa/verification.json)，六项检查之外还写了它没证明什么：

```json
"checks": { "launch": "PASS", "render": "PASS", "input": "PASS", "coreLoop": "PASS", "outcome": "PASS", "restart": "PASS" },
"limitations": [ ……
  { "scope": "体验判断", "reason": "自动化只证明当前候选可启动、渲染、输入、走到结果并重开，不判断主观吸引力、长期平衡或其他浏览器。" }
]
```

## 常见问题

### 用 DeepSeek 写小说，一定要装插件吗？

只讨论一个梗概或修改一段自带文本，用普通模型聊天就够，自己把结果放回稿件即可；要围绕本地作品目录持续创作、在工作台里看文件，再装 DSH 加本插件。想用账户化的网页项目，可选 [ZenStory 托管工作台](https://app.zenstory.ai)，具体区别见[写作环境对比](https://zenstory.ai/zh/compare/writing-workflows)。

### 我在用 Claude Code 或 Codex，也该装这个吗？

不用。四条流水线各自是独立的 skill 仓库，直接装进你在用的编程 Agent：[oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode)、[drama-skills](https://github.com/zenstory-ai/drama-skills)、[novel-to-game](https://github.com/zenstory-ai/novel-to-game)、[video-recap-skills](https://github.com/zenstory-ai/video-recap-skills)。本插件是这四套 Skills 在 DeepSeek Harness 里的打包版，外加只有 DSH Web 才有的四个工作台。

### 查看已有作品需要 API Key 吗？

不需要。首次引导选择「稍后配置」，打开作品目录就能浏览文件；开始 AI 创作时再配置模型。

### Token 消耗如何？

插件自己不调用模型，用量以 DSH 每条答复下方显示的数字为准，本仓库没有公开统计。两点会明显增加用量：Skills 文本随 profile 的每个 Session 加载，写代码的会话也会带上，装进独立 profile 可以避免；`/story-long-write` 一类流程会启动专业 Roles，每个 Role 是一次独立的子 Agent 调用。

### DeepSeek 会自己生图、生视频吗？没有视频 Key 能做什么？

不会。DeepSeek 只写剧本、分镜和提示词，媒体由 `short-drama-produce` 调用 GPT Image 2、Seedance、MiniMax H3、MiniMax Speech 或 MiniMax Music 生成，Key 写在启动 DSH 之前的宿主机环境变量里，只配用得到的那几个。没有视频 Key 仍然可以写完五份文档、生成关键帧图片。

### 分镜或游戏设计写好了，成片和可玩构建从哪来？

短剧成片由 `/short-drama-edit` 按《剪辑单.md》渲染，需要先配置媒体生成 API 并生产出逐镜素材；游戏构建由 `/game-build` 生成，`build/app/index.html` 就绪后自动进入游戏工作台的项目列表。

### 装了插件之后，写代码的普通会话也变成三栏了？

0.1.7 之前是这样（[#29](https://github.com/zenstory-ai/oh-story-dsh/issues/29)）。现在只有当前 workspace 真的有创作项目时才接管布局，没有时插件在界面上完全不出现；工作台标题栏的「收起创作工作台」随时可以收起，选择按 workspace 记住。

### 右侧 Chat 里的长答复被下面的输入框遮住了？

[#3](https://github.com/zenstory-ai/oh-story-dsh/issues/3) 与 [#26](https://github.com/zenstory-ai/oh-story-dsh/issues/26) 报过，0.1.6 起窗口尺寸变化后正文会重新贴底，0.1.8 修掉最后一处触发条件。升级到 0.1.10 后仍能复现时，请带版本号和窗口宽度开 Issue。

### 装好后工作台一片空白，面板和「创作工作台」按钮都不出现？

这是 [#50](https://github.com/zenstory-ai/oh-story-dsh/issues/50)：0.1.9 及更早的插件装在 DSH 0.1.7 上，会读已被 DSH 删除的 Queue 字段而崩溃，整个工作台被错误边界收走；换成 DSH `0.1.7-rc.2` 也一样。升级到 0.1.10，并按上面的安装命令使用 DSH `0.1.7-rc.2`。0.1.10 起插件只声明兼容 DSH 0.1.7 这一条补丁线，DSH 0.1.7 及以后的版本遇到不匹配会直接给出不兼容提示。

### 我另外给 Codex 或 OpenCode 装过 Oh Story，DSH 里用的是哪一份？

DSH 也会读取 `~/.agents/skills`，同名时优先用那里的副本，而不是本插件随包、为 DSH 适配过的版本；两份版本不同时，行为以 `~/.agents` 里的为准。想让 DSH 只用插件自带的 Skills，启动前把 `DSH_AGENTS_HOME` 指向另一个目录（例如 `DSH_AGENTS_HOME=~/.dsh-agents npx -y @deepseek-ai/dsh@0.1.7-rc.2 web`），或移走 `~/.agents/skills` 里的同名目录。

### 安装报 `pnpm not found on PATH`？

DSH 的 `plugin add` 内部需要 pnpm，单独运行 `npx @deepseek-ai/dsh ... plugin add` 不会自动补上它。重新执行上面带 `--package pnpm@11.7.0` 的完整安装命令，确认安装成功后再启动。

### 浏览器没打开，或者打开后要求认证？

打开终端打印的完整带 `?token=...` 链接，首次认证需要链接里的 token；端口被占用时用 `web --port 3081`，并访问新打印的链接。

### 没有看到「小说 / 短剧 / 游戏 / 视频」四个标签？

先添加作品目录并打开会话。空目录需要先在 Chat 中运行创作命令，Agent 生成第一个创作文件后工作台才会出现；已收起的工作台可用会话区的「创作工作台」按钮恢复。已有作品仍不显示时，检查安装与启动是否使用同一个 profile，重启 DSH 并刷新页面。装进独立 `story` profile 却没有网页界面，是因为新 profile 需要补上 `@deepseek-ai/dsh-web-app`，见安装一节的折叠说明。

### Windows 能用吗？

能。类型、资产、单测与构建这道门在 CI 里每次都在 macOS 和 Windows 上跑；打包后装进官方 DSH Web 的集成测试在 Linux 上跑。视频流水线在任何平台都需要 Python 3.10+ 与带 libass 的 ffmpeg；长篇拆文、导入与长篇追踪同样需要宿主机上的 Python 3，短剧成片需要 ffmpeg/ffprobe，默认的烧录字幕还要求 ffmpeg 带 libass。

### 升级到新版本后要做什么？

重新执行安装命令，把 `@oh-story/dsh@` 后的版本号换成新版本，再重启 DSH；安装与启动用同一个 dsh 版本。Skills 与 Roles 随插件打包，不需要在项目里重新部署。既有短剧项目要注意两次收紧：0.1.5 起《分镜.md》每镜必写「视觉依据」、`REF-*` 槽位必须声明 `用途`；0.1.7 起每镜「来源」必须以《剧本.md》真实存在的场景 ID 开头。

0.1.10 另有三点：DSH 要一起升到 `0.1.7-rc.2`，它会把会话记录升级到新格式，之后不能再用同一个 DSH 目录退回 0.1.5；Oh Story 0.8.0 把作者记忆分成工作区与书两级，升级前写在工作区的「本书：」条目要对每本书运行一次 `author_memory_commit.py migrate --workspace {工作区} --book-root {书目录}` 才会重新参与查询（本插件的单书布局下两个参数都是工作区本身；也可以直接对 Agent 说「整理作者记忆」）；Drama Skills 0.7.1 起《剪辑单.md》要在第一个 `## CUT-` 之前用一行 `- 未采用镜头：` 交代没有用上的 `MOTION-*`，否则成片检查会拦下。逐版变更见 [CHANGELOG.md](CHANGELOG.md)。

## 延伸阅读

- [DeepSeek 写小说指南](https://zenstory.ai/zh/dsh/deepseek-novel-writing)：选择作品目录、配置宿主模型，再给出题材、视角与本轮停靠点。
- [导入与续写](https://zenstory.ai/zh/oh-story/import-and-continue)：分清已完成章节、未完成片段、必须保留的设定和下一段范围。
- [短剧角色一致性](https://zenstory.ai/zh/drama-skills/character-consistency)：分清身份、造型与逐镜状态。
- [有后果的游戏选择](https://zenstory.ai/zh/novel-to-game/meaningful-choices)：明确行动代价、可见变化和后续承接。
- [原声与旁白分工](https://zenstory.ai/zh/video-recap/original-audio-and-narration)：先列出关键台词、画面依据和需要解说的空隙。
- [写作环境对比](https://zenstory.ai/zh/compare/writing-workflows)：普通聊天、DSH 插件与托管工作台各适合什么。
- [架构说明](docs/ARCHITECTURE.md)：DSH 与插件各自拥有什么，四个工作台的协议边界。
- [验证说明](docs/VALIDATION.md)：每一层测试覆盖什么，哪些证据不进 Pull Request CI。

## 贡献与交流

- **GitHub Issues**：[Bug、输出质量 Case、功能请求](https://github.com/zenstory-ai/oh-story-dsh/issues/new/choose)，请带上插件版本、DSH 版本和复现步骤。
- 改代码前先读 [CONTRIBUTING.md](CONTRIBUTING.md)：`pnpm verify` 是每个 Pull Request 的质量门，`pnpm test:dsh` 会打包并装进隔离的官方 DSH Web 跑一遍。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：提供原生插件运行时、Agent、会话、权限审批与 Web 工作台基础。
- [LINUX DO](https://linux.do/)：感谢社区的交流、反馈与开源支持。

[更新日志](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [架构说明](docs/ARCHITECTURE.md) · [安全策略](SECURITY.md)

## ZenStory AI 项目

Oh Story DSH 是 [ZenStory AI](https://zenstory.ai/zh) 的一部分——一组开源、面向 agent 的故事创作、改编与生产工具（GitHub 组织：[zenstory-ai](https://github.com/zenstory-ai)）。同组织项目：

| 项目 | 用途 |
| --- | --- |
| [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode) | 网文写作 skill 包：扫榜、拆文、写作、去AI味、封面图 |
| [drama-skills](https://github.com/zenstory-ai/drama-skills) | AI 短剧 / 漫剧创作 skill 合集：剧本、资产、分镜、图片/视频提示词、独立审查 |
| [novel-to-game](https://github.com/zenstory-ai/novel-to-game) | 面向原著改编、指定运行环境构建与运行证据 QA 的 agent skills |
| [video-recap-skills](https://github.com/zenstory-ai/video-recap-skills) | 将支持的视频文件制作成中文解说，可选导出可编辑的剪映/CapCut 草稿 |
| [oh-story-dsh](https://github.com/zenstory-ai/oh-story-dsh) | DeepSeek Harness 社区插件，提供小说、短剧、游戏和视频解说工作台（本仓库） |
| [zenstory](https://github.com/zenstory-ai/zenstory) | 对话即创作的 AI 小说写作工作台（[app.zenstory.ai](https://app.zenstory.ai)） |
