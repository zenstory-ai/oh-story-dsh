<div align="center">

# oh-story-dsh

**小说、短剧、互动游戏与视频解说创作工作台**

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [Oh Story](https://github.com/zenstory-ai/oh-story-claudecode) · [Drama Skills](https://github.com/zenstory-ai/drama-skills) · [NovelToGame](https://github.com/zenstory-ai/novel-to-game) · [video-recap-skills](https://github.com/zenstory-ai/video-recap-skills) · [MIT](LICENSE)

</div>

`oh-story-dsh` 是基于 DeepSeek Harness（DSH）构建的社区插件，把小说、短剧、互动游戏与视频解说四条创作流水线带进 DSH。DSH 管理 Agent、会话、模型、权限和 Chat；插件提供创作 Skills、专业 Roles、项目协议与对应工作台。

> 本项目与 DeepSeek 官方无隶属、合作或背书关系；DeepSeek Harness 名称与品牌素材归其权利人所有。

## 小说工作台

![小说工作台](docs/images/story-workbench-demo.gif)

文件树、编辑器、Chat 三栏。覆盖长篇、短篇、选题、扫榜、拆文、导入、审稿、去 AI 味与封面流程，13 个 Oh Story Skills 与 7 个专业 Roles 按固定上游版本随插件交付。

## 短剧工作台

![短剧工作台](docs/images/drama-workbench-demo.gif)

每集按请求维护最多五份可读 Markdown：`剧本.md`、`视觉设定.md`、`分镜.md`、`图片提示词.md`、`视频提示词.md`。「生产」视图把这些文档投影为镜头板、素材板、任务/版本、成片顺序和关系画布，并就地提示重复 ID、悬空引用与格式错误。生产交付走 DSH 原生会话、当前 Preset 工具与权限确认。

## 游戏工作台

![游戏工作台](docs/images/game-workbench-demo.gif)

左侧实时试玩、右侧 DSH Chat 的两列布局。`/novel-to-game quick` 的生成物写入 `game-adaptations/<project>/`，`build/app/index.html` 就绪后自动进入项目列表，可刷新、全屏、切换项目。内置《金瓶梅 · 风月总账》完整可玩构建，开箱即可验证输入、核心循环、结局与重开。

## 视频工作台

![视频工作台](docs/images/video-workbench-demo.gif)

同样是预览左、Chat 右。项目放在 `video-recaps/<project>/`：原片在 `sources/`，上游工作产物在 `work/`，交付在 `outputs/`。工作台提供原片/剪后片/成片切换、阶段提示、运行清单与质检产物查看，视频经 HTTP Range 流式预览。在 Chat 里直接描述目标即可：

```text
给 /path/to/video.mp4 做一个 3 分钟中文解说成片，保留关键原声，字幕烧进画面。
把 /path/to/english.mp4 翻译成中文配音，保留原说话人的声音。
```

## 核心体验

- **实时文件跟随**：Agent 调用官方文件工具时，目标文件自动定位，编辑器同步呈现生成中的内容。
- **Chat 文件导航**：点击官方 Chat 中的作品文件名，文件树会定位并在编辑器打开对应文件。
- **创作文档预览**：Markdown 支持标题、表格、任务列表、引用和代码块；JSONL 以带行号、类型和状态的结构化记录呈现。
- **项目媒体库**：自动汇总当前 workspace 中各集和交付目录的真实图片/视频成果，支持搜索、类型筛选与跨集引用。
- **真实生成契约**：可选内置 GPT Image 2、Seedance 与 MiniMax Music adapter；账号、模型、凭据与可用性由 DSH 运行环境和项目外配置决定。
- **安全编辑**：支持源码编辑与快捷保存；人工未保存内容不会被并发 Agent 修改覆盖。
- **稳定长对话**：消息区独立滚动，官方 Composer 固定在 Chat 栏底部。
- **不占用其他场景**：只有当前 workspace 存在小说、短剧、游戏或视频项目时，工作台才接管会话布局；随时可收起，收起后会话回到 DSH 原生形态，选择按 workspace 记住。

各工作台的能力边界与协议约束见[架构说明](docs/ARCHITECTURE.md)。

## 能力目录

| 工作台 | 上游能力 | 主要入口 |
| --- | --- | --- |
| 小说 | [Oh Story 0.7.9](https://github.com/zenstory-ai/oh-story-claudecode/releases/tag/v0.7.9) · 13 Skills · 7 Roles | `/story`、`/story-long-write`、`/story-review` |
| 短剧 | [Drama Skills 0.6.4](https://github.com/zenstory-ai/drama-skills/releases/tag/v0.6.4) · 10 Skills | `/short-drama`、`/short-drama-write`、`/short-drama-storyboard` |
| 游戏 | [NovelToGame 0.3.0](https://github.com/zenstory-ai/novel-to-game) · 7 Skills · 《金瓶梅》可玩示例 | `/novel-to-game quick`、`/game-build`、`/game-qa` |
| 视频 | [video-recap-skills 0.4.0](https://github.com/zenstory-ai/video-recap-skills) · 6 Skills | `/video-recap`、`/video-script` |

## 安装

需要 Node.js 24+。视频工作台的流水线还需要宿主机安装 Python 3.10+ 与带 libass `subtitles` 滤镜的 ffmpeg/ffprobe（macOS `brew install ffmpeg`，Debian/Ubuntu `sudo apt install ffmpeg`）。

**1. 安装插件并启动 DSH Web**

```bash
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add @oh-story/dsh@0.1.6
npx -y @deepseek-ai/dsh@0.1.2-rc.1 web
```

也可以直接安装 GitHub Release 中经过同一套测试的预构建包：

```bash
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.6/oh-story-dsh-0.1.6.tgz
npx -y @deepseek-ai/dsh@0.1.2-rc.1 web
```

默认在 `http://127.0.0.1:3080` 打开。

**2. 配置模型**

首次使用需要在 DSH 的「设置 → 模型」中添加 Provider 并填入 API Key；也可以在启动前设置环境变量 `DEEPSEEK_API_KEY`。模型、凭据与权限均由 DSH 管理，本插件不接触。

**3. 配置媒体生成 API（短剧生产需要）**

DeepSeek 只负责写剧本、分镜和提示词，本身不会生图、生视频或生音乐。短剧的「生产」把这些提示词交给 `short-drama-produce` Skill，由它调用下面的供应商 API 生成媒体。Key 不在界面里填，而是在启动 DSH 之前写入宿主机环境变量：

| 能力 | 供应商 | 必需环境变量 | 可选 |
| --- | --- | --- | --- |
| 图片 | GPT Image 2 | `OPENAI_API_KEY` | `OPENAI_BASE_URL` |
| 视频 | Seedance（火山方舟） | `ARK_API_KEY`、`SEEDANCE_MODEL` | `SEEDANCE_BASE_URL`、`SEEDANCE_ALLOWED_RATIOS`、`SEEDANCE_MIN_DURATION`/`SEEDANCE_MAX_DURATION` |
| 视频 | MiniMax H3 | `MINIMAX_API_KEY`、`MINIMAX_VIDEO_MODEL`、`MINIMAX_VIDEO_RESOLUTIONS` | `MINIMAX_VIDEO_BASE_URL`、`MINIMAX_VIDEO_RATIOS`、`MINIMAX_VIDEO_MIN_DURATION`/`MINIMAX_VIDEO_MAX_DURATION` |
| 音乐 | MiniMax Music | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` |

```bash
export OPENAI_API_KEY=...            # 图片
export ARK_API_KEY=... SEEDANCE_MODEL=...   # 视频，模型/Endpoint ID 以账号开通的为准
npx -y @deepseek-ai/dsh@0.1.2-rc.1 web
```

只配置用得到的那几个即可：没有视频 Key 仍然可以写分镜、生成关键帧图片。短剧工作台的「生产」视图顶部会显示每个供应商是否已配置、缺哪个变量；插件只报告变量是否存在，从不读取或展示 Key 的值。插件启动时会把这四个内置 adapter 登记到一份不含凭据的配置文件（默认在系统临时目录下仅当前用户可读写的 `oh-story-dsh-<uid>/` 里，「生成环境」条会显示完整路径），Agent 运行 `production_tool.py run` 时直接引用它；自己写 adapter 或改超时，就把文件路径写进 `OH_STORY_DRAMA_ADAPTER_CONFIG`。每个供应商的参数、分辨率与时长约束见随包的 `short-drama-produce/references/providers/`。

视频解说工作台另用 `MIMO_API_KEY`（Fish Audio TTS 另需 `FISH_API_KEY`），小说封面则使用当前 Preset 里可见的图片生成工具。

**4. 开始创作**

添加作品目录为 workspace，新建或打开 Session 后使用 `/story`、`/short-drama`、`/novel-to-game quick` 或 `/video-recap`。四个工作台可随时通过顶部 Tab 切换。

## 按需加载

插件装进哪个 profile，那个 profile 的每个 Session 就都会加载创作 Skills 与工作台。想让原版 `web` 保持干净、只在创作时打开工作台，就把插件装进独立 profile。

**1. 装进独立 profile**

```bash
npx -y @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile story add @oh-story/dsh@0.1.6
```

**2. 补上界面**

新 profile 默认没有界面。编辑 `~/.dsh/profiles/story/package.json`，把 `dsh.profile.bundles` 改成：

```jsonc
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@oh-story/dsh"
]
```

顺序照抄，这个包不用另外安装。

**3. 按需启动**

```bash
npx -y @deepseek-ai/dsh@0.1.2-rc.1 web                          # 原版 DSH
npx -y @deepseek-ai/dsh@0.1.2-rc.1 --profile story --port 3081  # 创作工作台
```

两个 profile 用不同端口可以同时运行。模型、凭据、workspace 与历史会话由 DSH 统一保存，切换 profile 不会丢。安装与启动请使用同一个 dsh 版本，混用会报 `unknown option '--no-open'` 一类的错。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：提供原生插件运行时、Agent、会话、权限审批与 Web 工作台基础。
- [LINUX DO](https://linux.do/)：感谢社区的交流、反馈与开源支持。

[更新日志](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [架构说明](docs/ARCHITECTURE.md) · [安全策略](SECURITY.md)
