# Changelog

本文件记录 `@oh-story/dsh` 的用户可见变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

小节名使用 Keep a Changelog 的六个英文类别（`Added` / `Changed` / `Deprecated` /
`Removed` / `Fixed` / `Security`），正文为中文。收紧到会拒绝旧输入的改动记入 `Changed`。
同步上游时写清上游版本号与提交，便于定位。

## [Unreleased]

### Added

- 短剧每集 creator-first 文档新增「生产」视图：镜头卡、人物/场景/道具素材板、跨文档定位、批量生产、任务状态、版本选择、成片顺序与缺镜检查，以及可缩放拖拽的关系画布。
- 图片、视频与音频成果可由当前 DSH Session 的 Agent FileSystem 列出和预览；图片/视频会按稳定对象 ID 与任务 ID 自动回填到镜头和素材版本。
- 单项、批量与成片合成动作通过当前 DSH Conversation 发送 `/short-drama-produce` 精确任务，继续使用当前 Preset 可见工具、权限审批、Trajectory 和停止能力。
- 新增 `oh_story_production` 原生工具：Agent 可显式打开/聚焦生产语义目标、设置镜头顺序并登记自己实际执行的任务；装饰性的画布布局仍由创作者控制。工具不读写项目、不生成媒体，也不构成付费生产确认。
- 精简生产 UI：移除卡片内重复的复制/提示词优化入口和媒体版本画布节点，合并 Session 状态栏；已派发但未回收成果的任务显示为“待核对”，避免自动重试产生重复计费。
- 新增项目媒体库；已有真实成果可跨集搜索、预览、打开，并可显式挂为镜头额外图片参考。
- 图片与视频生产改为“完整预检 → 创作者明确确认 → Agent 登记同一任务 → Provider 执行”；任务板在确认前显示“等待确认”，并标明内置 adapter 契约与 DSH 运行环境边界。
- creator-first Markdown 投影采用轻量 `short-drama/v1` 协议：视觉素材支持显式稳定 ID，重复 ID、悬空引用、畸形标题和冲突运动块会定位到源文档。

### Fixed

- Agent 自动选中新 Markdown 时不再被默认预览模式覆盖流式源码视图；生产卡片跨文档定位也会保留源码位置。
- 多集项目的任务、版本选择、成片顺序和画布布局按集隔离，EP001 与 EP002 往返时不再串状态。
- 生产任务按 DSH 当前 Turn 与 Queue 分别停止/移除；失败后的迟到成果可重新关联，批量部分成果不会触发重复 Store 更新或空白生产视图。
- 媒体成果按完整路径 token 关联对象和任务，避免相似镜头或任务 ID 发生串联。
- 媒体路由按 RFC 7233 处理字节范围：`bytes=-N` 正确返回文件末尾 N 字节而不是开头，越界范围返回 416 而不是伪装成 200 的整文件响应。此前 MP4 播放器为定位尾部 moov 原子发出的首个请求会拿到错误区段，并被缓存 60 秒。
- 镜头的图片版本与视频版本改为分别记录，选择关键帧不再改变成片使用的视频版本。
- 创作文档与生成媒体在文件树中各自计入独立配额，成果较多的剧集不会把创作文档挤出工作台。
- DSH 专属的 `oh_story_production` 登记步骤与 `VISUAL-*` 资产 ID 约定改由插件 Skill bridge 注入，不再就地修改锁定的上游 Drama Skills；`短剧` 制作说明改用工具真正接受的 `jobKind`（image/video/composition），tts 与 music 不再被要求登记。
- 本地扩展的短剧 demo fixture 在 `sources.json` 中显式标记 `localExtension`，不再以上游提交名义记录；`check-drama-parity.ts` 据此跳过该文件的上游逐字节比对，同时仍校验其本地 sha256。
- ESLint 忽略本地 `.claude/worktrees` 嵌套工作树，避免扫描用户的独立 checkout。

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
