<div align="center">

# oh-story-dsh

**小说、短剧与互动游戏创作工作台**

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [Oh Story](https://github.com/zenstory-ai/oh-story-claudecode) · [Drama Skills](https://github.com/zenstory-ai/drama-skills) · [NovelToGame](https://github.com/zenstory-ai/novel-to-game) · [MIT](LICENSE)

</div>

`oh-story-dsh` 是基于 DeepSeek Harness（DSH）构建的社区插件，将 Oh Story 的小说方法库、Drama Skills 的短剧流程与 NovelToGame 的互动游戏生产线带入 DSH。DSH 管理 Agent、会话、模型、权限和 Chat；插件提供创作 Skills、专业 Roles、项目协议与对应工作台。

> 本项目与 DeepSeek 官方无隶属、合作或背书关系；DeepSeek Harness 名称与品牌素材归其权利人所有。

## 小说工作台

![oh-story-dsh 小说工作台](docs/images/oh-story-dsh-demo.gif)

覆盖长篇、短篇、选题、扫榜、拆文、导入、审稿、去 AI 味与封面流程。13 个 Oh Story Skills 与 7 个专业 Roles 按固定上游版本随插件交付。

## 短剧工作台

![oh-story-dsh 短剧工作台](docs/images/short-drama-dsh-demo.gif)

内置 Drama Skills 0.6.0 的 creator-first 工作流。每集按请求维护最多五份可读 Markdown：`剧本.md`、`视觉设定.md`、`分镜.md`、`图片提示词.md`、`视频提示词.md`；不预建空文档，也不倒补用户未点名的阶段。审查与生产交付继续使用 DSH 原生工具、权限和确认界面。

> Drama Skills 0.6.0 是破坏性升级：v0.5 结构化项目应继续锁定 v0.5 并只读保留；迁移时新建项目根，逐集人工确认当前工作所需文档，不要在同一目录混用旧 JSON/JSONL 与新文档。

## 游戏制作面板

![oh-story-dsh 金瓶梅实时试玩](docs/images/game-studio-jin-ping-mei.png)

游戏模式采用聚焦的两列布局：左侧是隔离运行、可直接操作的实时游戏预览，右侧保留完整 DSH Chat。使用 `/novel-to-game quick` 后，生成物写入 `game-adaptations/<project>/`；当 `build/app/index.html` 就绪时会自动进入项目列表，可在不离开对话的情况下刷新、全屏和试玩。

内置完整的《金瓶梅 · 风月总账》上游示例，方便开箱验证输入、核心循环、结局与重开流程。试玩 iframe 在切换项目文件或窄屏对话时保持挂载，不会丢失当前进度；新构建就绪后由创作者主动载入，不会因为转去 Chat 而静默覆盖正在玩的版本。正式 QA 继续由 `/game-qa`、原生 Agent 工具结果与 `qa/verification.json` 承担，不在制作面板增加独立 QA 页。

## 核心体验

- **按任务优化的布局**：小说/短剧保留文件树、编辑器、Chat 三栏；游戏使用“左侧实时试玩 + 右侧 Chat”两列，主流程不被辅助面板挤占。
- **实时游戏预览**：Agent 生成 `build/app/` 后自动发现可试玩版本；预览隔离运行，支持刷新、全屏、项目切换与构建期间保留上一版。
- **实时文件跟随**：Agent 调用官方文件工具时，目标文件自动定位，编辑器同步呈现生成中的内容。
- **Chat 文件导航**：点击官方 Chat 中的作品文件名，文件树会定位并在编辑器打开对应文件。
- **创作文档预览**：Markdown 支持标题、表格、任务列表、引用和代码块；JSONL 以带行号、类型和状态的结构化记录呈现。
- **安全编辑**：支持源码编辑与快捷保存；人工未保存内容不会被并发 Agent 修改覆盖。
- **稳定长对话**：消息区独立滚动，官方 Composer 固定在 Chat 栏底部。

## 能力目录

| 工作台 | 上游能力 | 主要入口 |
| --- | --- | --- |
| 小说 | [Oh Story 0.7.6](https://github.com/zenstory-ai/oh-story-claudecode) · 13 Skills · 7 Roles | `/story`、`/story-long-write`、`/story-review` |
| 短剧 | [Drama Skills 0.6.0](https://github.com/zenstory-ai/drama-skills/releases/tag/v0.6.0) · 10 Skills | `/short-drama`、`/short-drama-write`、`/short-drama-storyboard` |
| 游戏 | [NovelToGame 0.3.0](https://github.com/zenstory-ai/novel-to-game) · 7 Skills · 完整《金瓶梅》示例 | `/novel-to-game quick`、`/game-build`、`/game-qa` |

## 安装

需要 Node.js 24+。

**1. 安装插件并启动 DSH Web**

```bash
npx -y @deepseek-ai/dsh@0.1.1-rc.1 plugin --profile web add @oh-story/dsh@0.1.4
npx -y @deepseek-ai/dsh@0.1.1-rc.1 web
```

也可以直接安装 GitHub Release 中经过同一套测试的预构建包：

```bash
npx -y @deepseek-ai/dsh@0.1.1-rc.1 plugin --profile web add https://github.com/zenstory-ai/oh-story-dsh/releases/download/v0.1.4/oh-story-dsh-0.1.4.tgz
npx -y @deepseek-ai/dsh@0.1.1-rc.1 web
```

默认在 `http://127.0.0.1:3080` 打开。

**2. 配置模型**

首次使用需要在 DSH 的「设置 → 模型」中添加 Provider 并填入 API Key；也可以在启动前设置环境变量 `DEEPSEEK_API_KEY`。模型、凭据与权限均由 DSH 管理，本插件不接触。

**3. 开始创作**

添加作品目录为 workspace，新建或打开 Session 后使用 `/story`、`/short-drama` 或 `/novel-to-game quick`。小说、短剧与游戏工作台可随时通过顶部 Tab 切换。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：提供原生插件运行时、Agent、会话、权限审批与 Web 工作台基础。
- [LINUX DO](https://linux.do/)：感谢社区的交流、反馈与开源支持。

[更新日志](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [架构说明](docs/ARCHITECTURE.md) · [安全策略](SECURITY.md)
