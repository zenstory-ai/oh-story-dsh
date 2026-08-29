# Changelog

本文件记录 `@oh-story/dsh` 的用户可见变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

小节名使用 Keep a Changelog 的六个英文类别（`Added` / `Changed` / `Deprecated` /
`Removed` / `Fixed` / `Security`），正文为中文。收紧到会拒绝旧输入的改动记入 `Changed`。
同步上游时写清上游版本号与提交，便于定位。

## [Unreleased]

### Added

- 同步 Oh Story 0.7.8（`70c294b`，v0.7.8 之后 3 个提交）：新增工作区级作者记忆 `.story/作者记忆/` 与随包脚本 `author_memory_commit.py`；新增细纲结构验收 `check-outline-contract.js`、短篇 Phase 2 与交付验收 `check-phase2-contract.js` 与 `check-delivery-contract.js`；长篇字数改用 `storyctl.py` 的 `visible_chars_v1` 口径。上游 `agents_version` 升到 28，DSH 的七个 Role 随插件打包，用户无需重新部署。
- 同步 Drama Skills 0.6.1（`3ab6b85`，v0.6.1 之后 3 个提交，含尚未发版的 0.6.2 修复）：新增 `creator_markdown_check.py`，按剧集校验 creator-first 五份 Markdown 的跨文档结构。

### Changed

- Oh Story 参考资料按消费者拆分改名为 `long-*`、`short-*`、`analysis-*` 三套，story-architect 按 `agent-reference-profiles.md` 选 profile。`oh_story_bundled_reference` 只接受精确路径，自定义流程中引用 `genre-catalog.md`、`reversal-toolkit.md`、`hooks-suspense.md`、`quality-checklist.md` 等旧文件名的地方需要改成新名字。
- 长篇写正文与短篇构思前新增会阻断的 Reference Gate：当前阶段要求的 reference 必须读到 EOF，缺失或不可读时停止并报出路径，不允许先写正文再补读。
- 长篇章节缺少合法「字数目标」时停止，不再静默回退到 3000；欠字不自动补写，超字最多一次净删压缩。短篇总字数以用户给定范围为准，未给范围时才用 8000-20000 默认值。
- 细纲情节点改为四列表格（`#` / 情节点 / 功能标签 / 执行边界），不再要求逐点字数预算与「目标字数合计」行。
- 短剧已确认的生产 job 必须用 `source_entry` 点名 `图片提示词.md` 或 `视频提示词.md` 中的 `IMG-*` / `MOTION-*` 条目，并逐张填写 `reference_bindings`；与 canonical 文档漂移即 fail closed。
- DSH bridge 补齐 Google Antigravity：`.agents/agents` 与 `invoke_subagent` 进入平台探测禁令，story-setup 的禁止部署清单加入 Antigravity。上游 0.7.8 给每个 Skill 增加了第四条 canonical agent 路径，未补齐时 Skill 会误判 Role 不可用并降级 solo。
- 上游资产同步排除 Antigravity 平台部署产物（`story-setup/references/antigravity/` 与三个 `*antigravity*` 脚本），与 Claude/Codex/OpenCode/ZCode/OpenClaw/Reasonix 的口径一致。

### Fixed

- `story` Skill 现在随包携带 `scripts/author_memory_commit.py`。此前 `story/scripts/` 被整目录排除，只有 `references/author-memory.md` 进包，作者记忆流程指向一个不存在的脚本；排除范围已收窄到 `dashboard-server.mjs`。
- `story` 的 DSH 原生路由补上作者记忆入口。上游描述已宣告「记住我的写作习惯」，而替换后的路由正文没有对应分支。
- 短剧分镜开篇不再默认补空镜建立镜头；图片提示词校验不再用固定质量词表阻断交付。
- 章节大纲以 UTF-8 BOM 开头时不再漏识别「字数目标」。
- Windows 上短剧校验脚本把 stdout 重定向到文件或管道时不再抛 `UnicodeEncodeError` 把已完成的工作报成失败；生产环节按二进制读取参考图，`references` 与 `reference_bindings` 在该平台恢复可用。

## [0.1.4] - 2026-08-23

### Changed

- 同步 Oh Story `9d0bd5f`，区分对标书目录缺失与文风缺失，并采用五列表格的细纲字数合计契约。
- 同步 Drama Skills 0.6.0（`7811065`），短剧新项目按请求维护每集最多五份 creator-first Markdown；持久化审查输出为可读 Markdown，口头审查不落盘，生产源指向当前文档并继续经过精确任务确认。
- Oh Story 专业 Role 通过插件专属、只读且防 shadow 的 `oh_story_bundled_reference` 读取固定版本共享参考，不再依赖可被项目覆盖的同名 Skill 或 `.claude` 等平台部署路径。

### Fixed

- `oh_story_role` 现在稳定使用插件持有的 DSH subagent runtime；即使调用 Agent 的 Cordis Fiber 未注入该服务，也能正常启动并回收专业子 Agent。
- 明确禁止把 v0.5 结构化短剧项目原地迁移或与 v0.6 五文档混放，避免遗留脚本重新生成并行 JSON/JSONL 创作真相。
- 上游资产同步会排除 `__pycache__`、Python bytecode、`.DS_Store` 与仅用于平台部署的脚本，避免本地 checkout 污染发布包。

## [0.1.3] - 2026-08-23

### Fixed

- 展开的 Todo、流式状态与消息流末尾现在会为官方 Composer 的动态高度预留空间，不再被底部输入区遮挡。
- Chat 锚点恢复、`scrollIntoView` 与浏览器焦点滚动会停在 Composer 上方，并保持目标消息可见。

## [0.1.2] - 2026-08-21

### Changed

- 文件生成预览改用 DSH Session 的 Step location data、`runningCalls` 与已落地 Tool diff，移除重复的 Host Projection。
- 小说工作台状态改由 DSH 的 Session-scoped Slot Store 管理。
- 专业 Role 保留上游声明的结构化 `write`、`edit` 工具，并继续受当前 Agent 可见工具约束。
- 单一类型 workspace 以静态标签标识小说或短剧；仅在空项目或混合项目中显示类型切换。
- 三栏比例改由 DSH 会话容器的实际宽度驱动，并继续复用官方界面 token。

### Fixed

- 长篇写作 Guard 现在读取调用 Agent 的 DSH FileSystem，可正确支持 sandbox、remote 与自定义文件系统。
- Agent 修改其他文件时不再打断正在输入的本地草稿。
- 极快完成的 Agent 文件调用也会在落地后定位并刷新编辑器。
- 源码与预览切换会恢复长文的滚动位置、光标和选区。
- 改善紧凑三栏中的深层文件名、编辑器路径和 JSONL 记录可读性，并补全工作台 Tab 的键盘导航。

## [0.1.1] - 2026-08-21

### Added

- 空白 DSH Session 可直接打开小说与短剧三栏工作台。
- 未保存草稿、当前文件和编辑模式可在 Session 切换后恢复。
- 文件冲突支持载入磁盘版本或保留本地草稿。

### Changed

- 文件读取、保存和版本检查统一使用当前 Agent 的 DSH FileSystem 与 sandbox policy；并发保存采用原子版本前置条件。
- Agent 文件工具的生成中内容通过 DSH Session Projection 同步到编辑器，官方 Chat、Composer、Todo、审批与执行记录保持原生实现。
- 窄窗口下继续保留三栏结构，并优先保证 Chat 输入与发送控件可用。

### Fixed

- Agent 修改文件时，已折叠的目录现在会自动展开并定位目标文件。
- 修正连续编辑、嵌套工具调用、`replace_all` 与删除操作的文件预览。
- 修正并发保存、文件级冲突状态串扰，以及无效项目 JSON 阻断整个工作台的问题。

## [0.1.0] - 2026-08-21

- 首个公开版本。
- 提供 13 个 Oh Story 小说 Skills、7 个专业 Roles 与 10 个 Drama Skills。
- 提供文件树、Markdown/JSONL 编辑预览与官方 DSH Chat 同屏的三栏工作台。

[Unreleased]: https://github.com/zenstory-ai/oh-story-dsh/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/zenstory-ai/oh-story-dsh/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/zenstory-ai/oh-story-dsh/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/zenstory-ai/oh-story-dsh/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/zenstory-ai/oh-story-dsh/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/zenstory-ai/oh-story-dsh/releases/tag/v0.1.0
