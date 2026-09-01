# @oh-story/dsh

[GitHub](https://github.com/zenstory-ai/oh-story-dsh) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [MIT](LICENSE)

![oh-story-dsh 小说工作台](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/oh-story-dsh-demo.gif)

`oh-story-dsh` 是基于 DeepSeek Harness（DSH）构建的社区小说、短剧、互动游戏与视频解说创作插件，提供：

- 13 个 Oh Story 小说 Skills 与 7 个专业 Roles；
- 10 个 Drama Skills 0.6.1 短剧流程，每集按请求维护最多五份 creator-first Markdown；
- 7 个 NovelToGame 0.3.0 Skills、`game-adaptations/<project>` 产物协议与《金瓶梅 · 风月总账》可玩构建；
- 6 个 video-recap-skills 0.4.0 Skills、`video-recaps/<project>` 项目约定与轻量视频预览工作台；
- 小说协议 hooks 与安全的 Session workspace 文件路由；
- 小说/短剧的文件树、编辑器、Chat 三栏工作台，以及游戏/视频的“左侧工作台 + 右侧 Chat”制作面板；
- Markdown 与 JSONL 结构化预览；
- 短剧镜头/素材/任务/成片/画布生产视图、跨集项目媒体库、成果版本与参考复用；轻量 Markdown 协议会诊断重复 ID、悬空引用和畸形标题；
- `oh_story_role` 原生子 Agent，以及无媒体副作用的 `oh_story_production` 生产界面/任务意图工具视图。

本项目与 DeepSeek 官方无隶属、合作或背书关系；DeepSeek Harness 名称与品牌素材归其权利人所有。

## 安装

```bash
npx -y @deepseek-ai/dsh@0.1.1-rc.1 plugin --profile web add @oh-story/dsh@0.1.4
npx -y @deepseek-ai/dsh@0.1.1-rc.1 web
```

也可以直接安装 GitHub Release 中的预构建包：

```bash
npx -y @deepseek-ai/dsh@0.1.1-rc.1 plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.4/oh-story-dsh-0.1.4.tgz
npx -y @deepseek-ai/dsh@0.1.1-rc.1 web
```

需要 Node.js 24+。首次使用需要在 DSH 的「设置 → 模型」中添加 Provider 并填入 API Key，或在启动前设置环境变量 `DEEPSEEK_API_KEY`。

将作品目录添加为 DSH workspace，然后在普通 Agent 会话中使用 `/story`、`/short-drama`、`/novel-to-game quick` 或 `/video-recap`。四个入口始终可见；尚未创建的类型显示对应的创建引导。模型、凭据、Preset、权限、会话记录、停止/继续、Todo、审批和 Composer 均沿用当前 DeepSeek Harness 配置与界面。

## 短剧工作台

选择某集的 creator-first 文档后可切换到「生产」，查看镜头板、素材板、任务、成片顺序与关系画布；图片与视频按钮先准备完整生产预检，创作者在 Chat 明确确认同一任务后才会运行。

## 游戏工作台

![金瓶梅实时试玩](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/game-studio-jin-ping-mei.png)

游戏产物写入 `game-adaptations/<project>`；`build/app/index.html` 就绪后即可在左侧隔离预览中实时试玩，切换项目文件或窄屏对话不会卸载当前运行时，新构建也只在用户主动选择后载入。`/game-qa` 与 `qa/verification.json` 保留为 Agent/自动化质量契约，不在制作面板展示独立 QA UI。

## 视频工作台

视频项目写入 `video-recaps/<project>`：`sources/` 保存原片，`work/` 保存流水线权威产物，`outputs/` 保存交付文件。左侧工作台只负责预览原片、剪后片、最终成片和关键计划/字幕/质检文件；Agent 在右侧 Chat 中完成理解、剪辑、写稿、配音与合成，不引入多轨时间线。

```text
给 /path/to/video.mp4 做一个 3 分钟中文解说成片，保留关键原声，字幕烧进画面。
```

宿主机需要 Python 3.10+、`PATH` 上的 ffmpeg/ffprobe（默认烧录字幕，因此 ffmpeg 需带 libass 的 `subtitles` 滤镜），以及 `MIMO_API_KEY`；Fish Audio TTS 另需 `FISH_API_KEY`。安装按上游说明即可（macOS `brew install ffmpeg`、Debian/Ubuntu `sudo apt install ffmpeg`）。工作台的「运行环境」检查只报告 DSH Host 进程是否就绪，不返回 Key 内容，密钥也不会写入项目；Agent 实际的执行世界以 `video-recap --doctor` 为准。

Drama Skills 0.6.0 不支持把 v0.5 结构化项目原地升级为 creator-first 项目。旧项目应继续锁定 v0.5 并只读保留；迁移时请新建项目根，逐集人工确认当前工作实际需要的 `剧本.md`、`视觉设定.md`、`分镜.md`、`图片提示词.md` 或 `视频提示词.md`，不要预建空文档。

## 按需加载

插件装进哪个 profile，那个 profile 的每个 Session 就都会加载创作 Skills 与三栏工作台。想让原版 `web` 保持干净、只在创作时打开工作台，就装进独立 profile：

```bash
npx -y @deepseek-ai/dsh@0.1.1-rc.1 plugin --profile story add @oh-story/dsh@0.1.4
```

新 profile 默认没有界面。编辑 `~/.dsh/profiles/story/package.json`，把 `dsh.profile.bundles` 改成 `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@oh-story/dsh"]`，顺序照抄，这个包不用另外安装。

```bash
npx -y @deepseek-ai/dsh@0.1.1-rc.1 web                          # 原版 DSH
npx -y @deepseek-ai/dsh@0.1.1-rc.1 --profile story --port 3081  # 创作工作台
```

模型、凭据、workspace 与历史会话由 DSH 统一保存，切换 profile 不会丢。安装与启动请使用同一个 dsh 版本。

## License

[Changelog](https://github.com/zenstory-ai/oh-story-dsh/blob/main/CHANGELOG.md) · [MIT](LICENSE)
