# @oh-story/dsh

[GitHub](https://github.com/zenstory-ai/oh-story-dsh) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [MIT](LICENSE)

![oh-story-dsh 小说工作台](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/oh-story-dsh-demo.gif)

`oh-story-dsh` 是基于 DeepSeek Harness（DSH）构建的社区小说、短剧与互动游戏创作插件，提供：

- 13 个 Oh Story 小说 Skills 与 7 个专业 Roles；
- 10 个 Drama Skills 0.6.0 短剧流程，每集按请求维护最多五份 creator-first Markdown；
- 7 个 NovelToGame 0.3.0 Skills、`game-adaptations/<project>` 产物协议与完整《金瓶梅 · 风月总账》示例；
- 小说协议 hooks 与安全的 Session workspace 文件路由；
- 小说/短剧的文件树、编辑器、Chat 三栏工作台，以及“左侧实时试玩 + 右侧 Chat”的游戏制作面板；
- Markdown 与 JSONL 结构化预览；
- `oh_story_role` 原生子 Agent 工具视图。

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

将作品目录添加为 DSH workspace，然后在普通 Agent 会话中使用 `/story`、`/short-drama` 或 `/novel-to-game quick`。游戏产物写入 `game-adaptations/<project>`；`build/app/index.html` 就绪后即可在左侧隔离预览中实时试玩，切换项目文件或窄屏对话不会卸载当前运行时，新构建也只在用户主动选择后载入。`/game-qa` 与 `qa/verification.json` 保留为 Agent/自动化质量契约，不在制作面板展示独立 QA UI。模型、凭据、Preset、权限、会话记录、停止/继续、Todo、审批和 Composer 均使用当前 DeepSeek Harness 配置与界面。

![金瓶梅实时试玩](https://raw.githubusercontent.com/zenstory-ai/oh-story-dsh/main/docs/images/game-studio-jin-ping-mei.png)

Drama Skills 0.6.0 不支持把 v0.5 结构化项目原地升级为 creator-first 项目。旧项目应继续锁定 v0.5 并只读保留；迁移时请新建项目根，逐集人工确认当前工作实际需要的 `剧本.md`、`视觉设定.md`、`分镜.md`、`图片提示词.md` 或 `视频提示词.md`，不要预建空文档。

## License

[Changelog](https://github.com/zenstory-ai/oh-story-dsh/blob/main/CHANGELOG.md) · [MIT](LICENSE)
