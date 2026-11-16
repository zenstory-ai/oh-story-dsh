# @oh-story/dsh

[GitHub](https://github.com/zenstory-ai/oh-story-dsh) · [项目主页](https://zenstory.ai/zh/dsh) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [CHANGELOG](https://github.com/zenstory-ai/oh-story-dsh/blob/main/CHANGELOG.md) · [MIT](LICENSE)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）打造的开源小说、短剧、互动游戏与视频解说创作工作台插件。Agent、会话、模型、权限审批与原生对话全部由 DSH 驱动，所有创作产物直接以普通文件保存在本地工作区中。

| 工作台 | 内置技能包（随包固定版本） | 常用命令 |
| --- | --- | --- |
| **小说** | Oh Story `0.10.5`（14 Skills · 7 Roles） | `/story`、`/story-long-write`、`/story-review`、`/story-publish` |
| **短剧** | Drama Skills `0.12.0`（12 Skills） | `/short-drama`、`/short-drama-write`、`/short-drama-storyboard`、`/short-drama-edit` |
| **互动游戏** | NovelToGame `0.9.0`（5 Skills） | `/novel-to-game quick`、`/game-build`、`/game-qa` |
| **视频解说** | video-recap-skills `0.7.1`（2 Skills） | `/video-recap`、`/video-reference` |

## 安装与启动

环境要求 **Node.js 24.9+**（安装命令已内置临时 `pnpm`，无需提前全局安装）：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.2-rc.1 dsh plugin --profile web add @oh-story/dsh@0.1.26 &&
npx -y @deepseek-ai/dsh@0.2.2-rc.1 web
```

也可直接安装 GitHub Release 预构建包：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.2-rc.1 dsh plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.26/oh-story-dsh-0.1.26.tgz &&
npx -y @deepseek-ai/dsh@0.2.2-rc.1 web
```

保持终端运行，若浏览器未自动打开，复制终端打印的完整 `http://127.0.0.1:3080/?token=...` 链接完成首次认证。在 DSH「设置 → 模型」中配置 Provider 与 API Key（或启动前设置环境变量 `DEEPSEEK_API_KEY`）；仅浏览本地已有项目可选择「稍后配置」。

安装与启动请使用同一个 DSH 版本。默认配套 `0.2.2-rc.1`，同时兼容 `>=0.2.0-rc.2 <0.2.1-0`、`>=0.2.1-alpha.1 <0.2.2-0` 与 `>=0.2.2-alpha.2 <0.2.3-0`（含 `0.2.1-rc.5`、`0.2.0-rc.2` 与 `0.2.2-rc.3`）。

## 四个创作工作台

### 小说工作台

![小说工作台](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/story-workbench-demo.gif)

文件树、Markdown 编辑器与原生 Chat 三栏联动。Agent 写入设定、大纲或章节时编辑器实时跟进，未保存的人工草稿受并发保护，完整覆盖选题、扫榜、拆文、长短篇写作、审稿、去 AI 味、建书资料与封面提示词。

### 短剧工作台

![短剧工作台](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/drama-canvas-workbench.png)

每集按需维护 `剧本.md`、`视觉设定.md`、`分镜.md`、`图片提示词.md`、`视频提示词.md` 五份文档。默认进入无限画布串联剧本场次、角色与场景参考板、分镜关键帧与视频素材；支持版本切换、行号级断链诊断，并在调用付费媒体 API 前经你明确确认，成片由 `/short-drama-edit` 按《剪辑单.md》渲染至 `剧集/<EP>/制作成果/成片/`。

### 互动游戏工作台

![游戏工作台](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/game-creative-workbench.png)

围绕 `game-adaptations/<project>` 提供「试玩 / 创作画布 / 文稿」视图。左侧独立沙箱实时试玩 `build/app/index.html`，画布串联原著依据、玩法设计、人物世界与当前构建；切换视图保留试玩进度，新构建由你主动载入。

### 视频解说工作台

![视频工作台](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/video-narrative-workbench.png)

围绕 `video-recaps/<project>` 提供「预览 / 创作画布 / 文稿」视图。对照查看成片、剪后片与原片，按剪辑映射回看原片片段，逐段改写解说词并保留时间轴。

## 媒体 API 与宿主机依赖

- **短剧媒体生成（可选）**：需宿主机安装 Python 3.9+（成片合成另需 `ffmpeg`/`ffprobe`）。在启动 DSH 前按需设置环境变量：图片 `OPENAI_API_KEY`（GPT Image 2）；视频 `ARK_API_KEY` + `SEEDANCE_MODEL`（Seedance）或 `MINIMAX_API_KEY` + `MINIMAX_VIDEO_MODEL`（MiniMax H3）；语音 / 音乐 `MINIMAX_API_KEY`。内置 `seedance` 与 `minimax-h3` 默认支持角色参考音频 `reference_audio`，自定义外部 adapter 可通过 `OH_STORY_DRAMA_ADAPTER_CONFIG` 配置并声明 `reference_roles`。
- **视频解说依赖（按需）**：需宿主机安装 Python 3.10+、`PATH` 上的 `ffmpeg`/`ffprobe`，以及 `MIMO_API_KEY`（Fish Audio 配音另配 `FISH_API_KEY`）。带 `libass` 滤镜时自动烧录硬字幕，否则输出外挂 SRT。

## 独立 Profile 按需加载

若希望默认 `web` profile 保持纯净，可将插件装入独立 `story` profile：

```bash
npx -y --package pnpm@11.7.0 --package @deepseek-ai/dsh@0.2.2-rc.1 dsh plugin --profile story add @oh-story/dsh@0.1.26
```

将 `~/.dsh/profiles/story/package.json` 中的 `dsh.profile.bundles` 设为 `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@oh-story/dsh"]`，随后即可用 `npx -y @deepseek-ai/dsh@0.2.2-rc.1 --profile story --port 3081` 独立启动创作工作台。

## 常见问题与升级说明

- **安装报 `pnpm not found on PATH`**：执行上方带 `--package pnpm@11.7.0` 的完整安装命令。
- **未看到工作台标签或技能未生效**：添加并打开已有作品目录即可自动展开工作台；空目录新建作品需当前会话模式支持技能加载（如 `Standard`、`PTC`，`Minimal` 模式不加载插件技能），在 Chat 中运行 `/story`、`/short-drama`、`/novel-to-game quick` 或 `/video-recap` 生成首个创作文件；已收起的工作台可点会话区的「创作工作台」恢复。空白会话欢迎引导可点右上角「关闭欢迎引导」，或在「插件 → `@oh-story/dsh`」随时开关。
- **旧项目升级提示**：Drama Skills `0.12.0` 前的短剧文档只浏览无需改动，续写或跑 `creator_markdown_check.py` 前需将旧字段名改为现行直白名称；video-recap `0.7+` 续跑旧 `work/` 时需去掉 `--edit-mode dub`、`--review-narration` 等已移除参数。完整说明见仓库 [README](https://github.com/zenstory-ai/oh-story-dsh#升级到新版本后要做什么) 与 [CHANGELOG](https://github.com/zenstory-ai/oh-story-dsh/blob/main/CHANGELOG.md)。

---

本项目与 DeepSeek 官方无隶属、合作或背书关系；DeepSeek Harness 名称与品牌标识归其权利人所有。 · [MIT License](LICENSE)
