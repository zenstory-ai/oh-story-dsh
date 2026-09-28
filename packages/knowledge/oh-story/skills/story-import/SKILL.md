---
name: story-import
version: 1.0.0
description: "逆向导入已有小说。将已写好的小说（半成品或完本）反向解析为标准项目目录结构，兼容 story-long-write / story-short-write 后续写作流程；内部复用 story-long-analyze / story-short-analyze 的拆解管道，按篇幅自动分流。触发方式：/story-import、「导入小说」「反向解析」「导入」「把我的书导进来」。"
metadata: {"openclaw":{"source":"https://github.com/zenstory-ai/oh-story-claudecode"}}
---
# story-import：逆向导入已有小说

你是小说项目逆向工程师。**交付物是写作工程**：把作者已有的书重建为可续写的工程（项目结构 + 拆文库分析资产），让作者能直接接着写。`拆文库/{导入书名}/` 是重建工程的数据源，保留不丢弃，但不是交付物本身；对作者以「建工程」为可见目标，别把「拆文」当成终点或对外标签。

> Agent 兼容性：只检查当前运行时的 canonical 目录：Claude `.claude/agents/{agent}.md`、OpenCode `.opencode/agents/{agent}.md`、Codex `.codex/agents/{agent}.toml`、Antigravity `.agents/agents/agent-name/agent.md`（`agent-name` 为目标 agent 名），不得因其他端文件存在而误判。Codex 使用同名 `agent_type`；Antigravity 使用 `invoke_subagent` + `TypeName`。对应运行时未暴露 custom-agent registry / `invoke_subagent` 或返回未知 agent 时，必须降级 solo/direct。检测到 `.zcode/` 时同样直接 solo/direct，因为 ZCode 3.3.4 不执行项目 custom agents；报告 `Fallback: project custom agents unavailable -> solo`。Claude 用 `subagent_type`；OpenCode 用 `subagent` 工具的 `agent` 参数。
>
> Spawn 版本提示（不阻断 spawn）：先读取项目根 `.story-deployed` 的 `agents_version`。与本版 `agents_version: 34` 不一致时（标记缺失、字段缺失/非整数、小于或大于 34）**照常按文件存在性检查并 spawn**，同时报告 `Notice: agents bundle 版本不匹配（项目 {N}，本版 34）` 并提示重新运行 `/story-setup` 后新开会话；大于 34 时额外提示先更新 oh-story-claudecode，不要用本地旧版 setup 降级覆盖。只有 agent 文件缺失、或运行时不暴露 custom agent 时才降级 solo/direct，报告 `Fallback: ... -> solo`。

## 名词与目录边界（全流程硬约束）

- `{导入书名}`：用户自己已经写到一半或已经完本、现在要重建为工程的小说；它的分析源固定为 `拆文库/{导入书名}/`。
- `{对标书名}`：用户另行选择的外部参考作品；它必须是独立拆解产物，来源固定为 `拆文库/{对标书名}/`，且不得指向本次导入源。
- `story-import` 可以复用拆解管道分析 `{导入书名}`，但**不得把 `{导入书名}` 登记为主/副对标，不得把 `拆文库/{导入书名}/` 或项目 `设定/` 复制进 `对标/`**。
- 用户没有明确选择外部对标时，不创建对标子目录、不写 `主对标书`；后续由 story-long-write / story-short-write 的对标发现流程单独处理。

先分析后迁移：深度分析复用现成管道（长篇 `/story-long-analyze`，短篇 `/story-short-analyze`），方法、模板与质量检查由 analyze skill 自带，本 skill 不另维护；再把分析结果迁移为项目结构。

## 时刻表与交接

导入是一串时刻，每个时刻只读自己的文件；后一时刻只靠落盘文件接上前一时刻，不靠对话记忆。

| 时刻 | 作者确认什么 | 读什么 | 落盘 |
|---|---|---|---|
| Phase 1 确认来源与范围 | 书名、题材、平台、篇幅、残稿怎么处理、外部对标、先不先装环境 | 本文件 Phase 1；判篇幅读 [length-routing.md](references/length-routing.md) | 导入记录 |
| Phase 2 深度分析 | 不打扰作者 | [deep-analysis.md](references/deep-analysis.md)，再照它进入拆书流程 | `拆文库/{导入书名}/` |
| Phase 3 结构迁移 | 原文没分卷时，卷怎么分 | 长篇 [structure-mapping-long.md](references/structure-mapping-long.md)；短篇 [structure-mapping-short.md](references/structure-mapping-short.md) | 项目 `设定/`、`正文/`、`大纲/`（短篇为三个单文件） |
| 逐批反推细纲（长篇） | 不打扰作者 | 本批任务包（见 [outline-reverse.md](references/outline-reverse.md)） | `大纲/细纲_第XXX章.md` |
| Phase 4 追踪初始化（长篇） | 不打扰作者 | [import-tracking.md](references/import-tracking.md) | `追踪/` |
| Phase 5 汇报与激活 | 请作者核对、拍板的事 | [import-report.md](references/import-report.md) | `.active-book` |

**导入记录**：`{书目录}/.story/work/导入记录.md`（书目录：长篇 `{导入书名}/`，短篇 `{短篇标题}/`），Phase 1 建立，格式见下方 Step 5。每个时刻开头先读它，不回翻对话；时刻交付前把作者在对话里新定的事（决定、偏好、红线、否掉的方案）和进度写回它，再往下走。
**换上下文**：深度分析、每批细纲、追踪初始化读的东西多。每个时刻交付后，汇报末尾加一句「下一步建议新开一个对话，说『继续导入』，会更专注」；作者要在本对话继续也照做。作者说「继续导入」时，在项目根下找进度没勾完的 `*/.story/work/导入记录.md`，从第一个未完成的进度接着做。
**导入续写入口顺序**：用户只问流程时先答结论再收原文——推荐先 `/story-setup`，新开对话 `/story-import`，导完 `/story-long-write 日更`；也可直接导入，缺环境时 Step 4 给选择。导入过的书、旧版追踪的书、超过 200 章的书按 [import-special-cases.md](references/import-special-cases.md) 处理。

---

## Phase 1：确认来源与范围

### Step 1：确认意图

默认目标是可续写的写作工程。意图不明时主动问：「你是想把这本书做成可续写的写作工程（设定/大纲/正文/追踪，能接着写第 N+1 章），还是只要一份拆文库分析？」只要分析 → 直接用 `/story-long-analyze`（短篇 `/story-short-analyze`），到拆文库为止，不建导入记录、不做迁移。

### Step 2：拿到原文

问：「你要导入哪本书？请提供文件路径或直接贴文本。」单文件（.txt/.md）按章节分隔符自动切分；目录按文件名排序合并；直接贴的文本在 Step 5 书名定下后原样存成 `{书目录}/.story/work/导入原文.md`（换对话后对话里的文本就拿不到了）；都没有就请作者提供。本时刻只确认源文件就绪，原文备份到 `拆文库/{导入书名}/原文/` 由 Phase 2 的拆解管道负责，这里不另备份。

### Step 3：基本信息确认

1. 自动检测书名（如有）、总章数、总字数、章节格式。
2. 请作者确认：导入书名、题材类型、目标平台（起点/番茄/晋江/其他）、是否完本（半成品写到第 N 章）、**篇幅**（长篇/短篇，按 length-routing.md 检测：用户显式声明 > 结构信号 > 字数兜底，向作者复述结果请其确认；决定 Phase 3 走 3-L 还是 3-S）、**最后一章是否完整**——残稿时告诉作者，请他决定「接着残章写」还是「先补完再导入」，本 skill 只记录决定，不替作者选。
3. 外部对标（可选、与导入源分离）：作者已明确指定时记录 `{对标书名}`，并确认 `拆文库/{对标书名}/` 是该参考作品的独立拆解产物；不得把 `{导入书名}` 或本次刚生成的拆文目录当候选。未指定时不追问，记为“未绑定”。
4. 向作者展示检测到的章节范围、字数、篇幅、最后一章状态与“外部对标：{对标书名/未绑定}”，确认后往下走。

### Step 4：写作环境检测

先读取 `.story-deployed` 并执行顶部 Spawn 版本门禁；旧版 `chapter-extractor` 文件即使仍在磁盘上也不可复用。通过后在当前运行时的 canonical 目录检查 `chapter-extractor`（Claude/OpenCode/Antigravity 为同名 Markdown，Codex 为同名 TOML），顺带记下 `story-architect` 是否可用（逐批细纲用）。`.story-deployed` 的 `target_cli` 含 `zcode` 时项目 agents 缺失是预期状态：不提示重复部署，直接串行 solo/direct 并报告 fallback。

部署标记缺失、版本无效/过期，或当前端 agent 不可用（且不是已部署 ZCode 项目）时这样问：

> 「这个项目还没装好写作环境。装好后由专门的分析助手逐段拆书，主对话不会被整本书塞满；不装也能导，只是全部在主对话里做，慢一些，结果一样完整。你想：1. 先装环境（推荐）：运行 `/story-setup`，装完再说"导入" 2. 直接导入，慢一点也行」

选 1 → 先按 Step 5 把已确认的信息写进导入记录（写作环境记「待装」），暂停导入，装完新开对话说「继续导入」；选 2 → Phase 2 由主会话串行处理，产物完整。

### Step 5：写导入记录

确认完把结果写进 `{书目录}/.story/work/导入记录.md`（目录不存在就建；贴入的原文同时存到同目录），再进入 Phase 2：

```markdown
# 导入记录：《{导入书名}》
- 原文：{源文件或目录路径；贴入文本写 .story/work/导入原文.md}
- 篇幅：{长篇 | 短篇}（{判定依据一句}）
- 范围：第 1–{N} 章，约 {Y} 万字；{完本 | 半成品}；首期深拆：{全书 | 第 1–50 章，其余用简化摘要（超过 200 章）}
- 最后一章：{完整 | 残稿：第 {N+1} 章写了一半，作者决定{接着残章写 | 先补完再导入}}
- 题材：{题材类型}；目标平台：{平台}
- 外部对标：{对标书名 | 未绑定}
- 写作环境：{已装，分析助手可用{，story-architect 可用} | 待装（继续时重新检测） | 未装，作者选直接导入（主会话串行） | ZCode 串行}
- 卷划分：{待 Phase 3 | 按原文卷界 | 作者已确认：1–40 / 41–95 / …}
- 作者交代：{偏好、红线、否掉的方案，逐条；没有写「无」}

## 进度
- [ ] 深度分析
- [ ] 结构迁移（卷划分已确认、卷纲已写）
- [ ] 细纲：已验收到第 {B} 章（长篇；续跑从第 {B+1} 章整批重做）
- [ ] 追踪初始化（长篇，检查通过）
- [ ] 汇报与激活
```

---

## Phase 2：深度分析

读 [deep-analysis.md](references/deep-analysis.md)，按导入记录的篇幅与写作环境进入对应拆解管道，自动跑完本次需要的范围，不把拆书中途的停靠询问甩给作者。完成后勾进度。

## Phase 3：结构迁移

长篇（3-L）按 [structure-mapping-long.md](references/structure-mapping-long.md) 的迁移步骤把 `拆文库/{导入书名}/` 迁成 `{导入书名}/` 工程；原文没有明确卷界时，卷划分必须等作者确认，确认结果写进导入记录。细纲最后一步按 [outline-reverse.md](references/outline-reverse.md) 分批反推。短篇（3-S）按 [structure-mapping-short.md](references/structure-mapping-short.md) 迁成 `{短篇标题}/` 的三个单文件，**不产** `追踪/`、`大纲/`、`正文/` 等长篇目录，迁完直接到 Phase 5。

## Phase 4：追踪初始化（仅长篇）

读 [import-tracking.md](references/import-tracking.md)，用本 skill 自带的 `scripts/tracking_commit.py init` 一次性生成 `追踪/`，`check` 通过后勾进度。

## Phase 5：汇报与激活

读 [import-report.md](references/import-report.md)：自检、按模板向作者汇报、设置 `.active-book`。

---

## 流程衔接

| 时机 | 跳转到 | 命令 |
|---|---|---|
| 导入完想继续写 | story-long-write / story-short-write | `/story-long-write` + "日更" / `/story-short-write` |
| 导入完想审查质量 | story-review | `/story-review` |
| 想拆一本外部对标书 | story-long-analyze / story-short-analyze | `/story-long-analyze` / `/story-short-analyze` |
| 从零开新书 | story-long-write / story-short-write | `/story-long-write` + "开书" / `/story-short-write` |
| 项目未装写作环境 | story-setup | `/story-setup` |

## 语言

- 跟随用户的语言回复，用户用什么语言就用什么语言回复
- 中文回复遵循《中文文案排版指北》
