# Changelog

本文件记录 `@oh-story/dsh` 的用户可见变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

小节名使用 Keep a Changelog 的六个英文类别（`Added` / `Changed` / `Deprecated` /
`Removed` / `Fixed` / `Security`），正文为中文。收紧到会拒绝旧输入的改动记入 `Changed`。
同步上游时写清上游版本号与提交，便于定位。

## [Unreleased]

### Added

- 完整嵌入 video-recap-skills 0.4.0（`106175e`）的 6 个 Skills、固定上游资产清单与 `video-recaps/<project>` 项目约定。
- 新增第四个「视频」工作台：桌面端左侧预览、右侧 DSH 原生 Chat；支持原片/剪后片/最终成片切换、阶段提示、关键产物检查、全屏、刷新和显式载入新版本，不引入多轨编辑器。
- 新增视频运行环境检查，只向浏览器返回 Python、ffmpeg/libass、ffprobe 与凭据是否就绪，不返回任何 Key 内容。
- 本地视频预览改用 HTTP Range 文件流，可预览超过 256 MiB 的长视频而不在 Host 内整文件缓冲；远程文件系统保留有界回退读取。
- 同步 Oh Story 0.7.8（`70c294b`，v0.7.8 之后 3 个提交）：新增工作区级作者记忆 `.story/作者记忆/` 与随包脚本 `author_memory_commit.py`；新增细纲结构验收 `check-outline-contract.js`、短篇 Phase 2 与交付验收 `check-phase2-contract.js` 与 `check-delivery-contract.js`；长篇字数改用 `storyctl.py` 的 `visible_chars_v1` 口径。上游 `agents_version` 升到 28，DSH 的七个 Role 随插件打包，用户无需重新部署。
- 同步 Drama Skills 0.6.1（`3ab6b85`，v0.6.1 之后 3 个提交，含尚未发版的 0.6.2 修复）：新增 `creator_markdown_check.py`，按剧集校验 creator-first 五份 Markdown 的跨文档结构。
- 短剧每集 creator-first 文档新增「生产」视图：镜头卡、人物/场景/道具素材板、跨文档定位、批量生产、任务状态、版本选择、成片顺序与缺镜检查，以及可缩放拖拽的关系画布。
- 图片、视频与音频成果可由当前 DSH Session 的 Agent FileSystem 列出和预览；图片/视频会按稳定对象 ID 与任务 ID 自动回填到镜头和素材版本。
- 单项、批量与成片合成动作通过当前 DSH Conversation 发送 `/short-drama-produce` 精确任务，继续使用当前 Preset 可见工具、权限审批、Trajectory 和停止能力。
- 新增 `oh_story_production` 原生工具：Agent 可显式打开/聚焦生产语义目标、设置镜头顺序并登记自己实际执行的任务；装饰性的画布布局仍由创作者控制。工具不读写项目、不生成媒体，也不构成付费生产确认。
- 新增项目媒体库；已有真实成果可跨集搜索、预览、打开，并可显式挂为镜头额外图片参考。
- 图片与视频生产改为「完整预检 → 创作者明确确认 → Agent 登记同一任务 → Provider 执行」；任务板在确认前显示「等待确认」，并标明内置 adapter 契约与 DSH 运行环境边界。
- creator-first Markdown 投影采用轻量 `short-drama/v1` 协议：视觉素材支持显式稳定 ID，重复 ID、悬空引用、畸形标题和冲突运动块会定位到源文档。
- 稳定视觉资产 ID 与 `track_job` 登记说明通过 DSH short-drama 覆盖层下发，不改写固定的上游 Skill 文本，下次同步上游时不会被覆盖。
- 完整嵌入 NovelToGame 0.3.0 的 7 个 Skills、固定上游资产清单、`game-adaptations/<project>` 产物协议与《金瓶梅 · 风月总账》可试玩示例。
- 新增游戏制作面板：桌面端左侧实时试玩、右侧 DSH 原生 Chat；支持项目切换、刷新、全屏、构建版本提示与只读项目文件检查。
- 原生 DSH E2E 现在会操作生成的 workspace 游戏、进入《金瓶梅》首日场景、验证制作面板状态保活，并输出截图证据。

### Changed

- 游戏试玩运行时在切换项目文件与 500px 窄屏对话时保持挂载；窄屏改为可触控的“制作 / 对话”单区切换。
- 新构建不再因用户转去 Chat 导致 iframe 失焦而静默替换；状态文案区分文件更新、预览载入与载入失败。
- QA 保留为 Skill、项目产物和自动化质量门，不在游戏制作面板展示独立 Tab、卡片、徽标或营销截图。
- Oh Story 参考资料按消费者拆分改名为 `long-*`、`short-*`、`analysis-*` 三套，story-architect 按 `agent-reference-profiles.md` 选 profile。`oh_story_bundled_reference` 只接受精确路径，自定义流程中引用 `genre-catalog.md`、`reversal-toolkit.md`、`hooks-suspense.md`、`quality-checklist.md` 等旧文件名的地方需要改成新名字。
- 长篇写正文与短篇构思前新增会阻断的 Reference Gate：当前阶段要求的 reference 必须读到 EOF，缺失或不可读时停止并报出路径，不允许先写正文再补读。
- 长篇章节缺少合法「字数目标」时停止，不再静默回退到 3000；欠字不自动补写，超字最多一次净删压缩。短篇总字数以用户给定范围为准，未给范围时才用 8000-20000 默认值。
- 细纲情节点改为四列表格（`#` / 情节点 / 功能标签 / 执行边界），不再要求逐点字数预算与「目标字数合计」行。
- 短剧已确认的生产 job 必须用 `source_entry` 点名 `图片提示词.md` 或 `视频提示词.md` 中的 `IMG-*` / `MOTION-*` 条目，并逐张填写 `reference_bindings`；与 canonical 文档漂移即 fail closed。
- DSH bridge 补齐 Google Antigravity：`.agents/agents` 与 `invoke_subagent` 进入平台探测禁令，story-setup 的禁止部署清单加入 Antigravity。上游 0.7.8 给每个 Skill 增加了第四条 canonical agent 路径，未补齐时 Skill 会误判 Role 不可用并降级 solo。
- 上游资产同步排除 Antigravity 平台部署产物（`story-setup/references/antigravity/` 与三个 `*antigravity*` 脚本），与 Claude/Codex/OpenCode/ZCode/OpenClaw/Reasonix 的口径一致。

### Fixed

- 退出全屏后焦点返回“全屏试玩”，游戏 Tab 补齐 `aria-controls` / `tabpanel` 关系，并移除未提供退出提示的 pointer-lock 权限。
- `story` Skill 现在随包携带 `scripts/author_memory_commit.py`。此前 `story/scripts/` 被整目录排除，只有 `references/author-memory.md` 进包，作者记忆流程指向一个不存在的脚本；排除范围已收窄到 `dashboard-server.mjs`。
- `story` 的 DSH 原生路由补上作者记忆入口。上游描述已宣告「记住我的写作习惯」，而替换后的路由正文没有对应分支。
- 短剧分镜开篇不再默认补空镜建立镜头；图片提示词校验不再用固定质量词表阻断交付。
- 章节大纲以 UTF-8 BOM 开头时不再漏识别「字数目标」。
- Windows 上短剧校验脚本把 stdout 重定向到文件或管道时不再抛 `UnicodeEncodeError` 把已完成的工作报成失败；生产环节按二进制读取参考图，`references` 与 `reference_bindings` 在该平台恢复可用。
- Agent 自动选中新 Markdown 时不再被默认预览模式覆盖流式源码视图；生产卡片跨文档定位也会保留源码位置。
- 多集项目的任务、版本选择、成片顺序和画布布局按集隔离，EP001 与 EP002 往返时不再串状态。
- 生产任务按 DSH 当前 Turn 与 Queue 分别停止/移除；失败后的迟到成果可重新关联，批量部分成果不会触发重复 Store 更新或空白生产视图。
- 媒体成果按完整路径 token 关联对象和任务，避免相似镜头或任务 ID 发生串联。
- 分镜引用改按上游契约字段「图片提示词项」解析。此前只认无人书写的「参考」，导致合规分镜的镜头引用恒为空：关系画布没有任何连线、「参考」就绪标记永远不亮、已声明的关键帧也不会随视频任务下发。
- 标题分隔符不带空格（如 `## SHOT-EP001-001·门外停步`）不再被误报为协议错误——解析器本就接受这种写法，校验器却按另一套正则判定，一处写法就把整份文档翻成红色错误态。
- `track_job` 不再把批次任务的 `expectedOutputs` 重置为 1、`prompt` 清空。此前 Agent 按提示只回传任务 ID 时，5 镜批次会在第一份成果落地时就报「已完成」。
- 任务进入新 Turn 并开始产出后会清除上一轮的「Turn 已结束，尚未发现关联成果」告警，不再同时显示执行中与重复计费警告。
- DSH Queue 匹配改为锚定提示词里的「任务 ID：」标签，成片任务的输出路径不会再把无关视频任务标成排队中。
- 成片顺序按行号而非镜头 ID 重排，重复 SHOT ID 时不再移动错行。
- 声明了非法 `- ID：VISUAL-*` 时给出「已回退」诊断并说明可用形式，不再谎报该行缺失。
- 镜头卡可键盘聚焦与选中，素材卡显示选中态，Agent `focus_target` 会把目标滚入视口；就绪标记与版本选择不再只靠颜色区分。
- 镜头、素材与画布在本集缺少对应文档时给出明确空状态与下一步，不再是一片空白。
- 生成游戏预览的 CSP 改为对每一种响应下发，而不只是 HTML，并加上 `sandbox` 指令。此前 `.svg` 按 `image/svg+xml` 提供、属可执行文档类型，游戏自身可把 iframe 导航到带脚本的 SVG：sandbox 标志会延续、CSP 不会，该文档即可用 URL 中的 sessionId 读写工作区文件。
- 单个游戏项目的元数据读取失败不再中断整份 `/oh-story/workspace` 响应。此前非 UTF-8、超限或读取竞态的 `qa/verification.json`，以及重建中被移除的 `build/app`，都会连同小说与短剧文件树一起 500。
- 游戏项目目录名不再要求 slug 形态。`金瓶梅 · 风月总账`、含空格或以 `_` 开头的目录此前被静默丢弃；现在只拒绝真正危险的名字，容器边界仍由 `fs.contains` 把关。
- 预览载入状态改为带外探测真实响应。iframe 对 4xx/5xx 只触发 `load` 不触发 `error`，此前 403/404 会一边显示路由返回的 JSON 错误体、一边报「预览已载入」。
- 「载入新版本」不再在 Agent 构建中途提供，「刷新」与「载入新版本」拆分为不同处理：刷新只重跑创作者已接受的构建，不再静默换成未接受的新版本。
- 游戏工作台改为首次进入后才挂载。此前每个会话（包括纯小说会话）都会在隐藏 iframe 里下载并运行内置示例，并把工作台固定在示例项目上。
- Agent 写文件不再把创作者从正在运行的游戏上拽走。Game Studio 不渲染编辑器 textarea，原有的草稿保护条件永远不成立。
- 预览地址中的非法百分号转义返回 400，不再是 500 加一条错误日志。
- 无法隔离来源的部署会在状态栏说明存档功能不可用，不再静默启动一个必然崩溃的帧。
- 窄屏状态文案改为可省略号截断并带完整 tooltip；flex 容器上的 `text-overflow` 本就不生效。
- 跟随 Agent 选中文件不再在工作区尚未载入时丢失。落盘信号带的是绝对路径，`cwd` 未知时无法解析；此前信号在解析前就被标记为已消费，等 `cwd` 到达、effect 重跑时又被去重守卫短路，Agent 写入的文件因此永远不会被选中。

### Security

- 生成游戏通过独立 loopback origin 与 iframe sandbox 隔离；预览路由执行路径收敛、大小限制、CSP 与浏览器来源检查。

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
