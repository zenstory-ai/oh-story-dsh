# Changelog

本文件记录 `@oh-story/dsh` 的用户可见变更。版本遵循 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

### Added

- 完整嵌入 NovelToGame 0.3.0 的 7 个 Skills、固定上游资产清单、`game-adaptations/<project>` 产物协议与《金瓶梅 · 风月总账》可试玩示例。
- 新增游戏制作面板：桌面端左侧实时试玩、右侧 DSH 原生 Chat；支持项目切换、刷新、全屏、构建版本提示与只读项目文件检查。
- 原生 DSH E2E 现在会操作生成的 workspace 游戏、进入《金瓶梅》首日场景、验证制作面板状态保活，并输出截图证据。

### Changed

- 游戏试玩运行时在切换项目文件与 500px 窄屏对话时保持挂载；窄屏改为可触控的“制作 / 对话”单区切换。
- 新构建不再因用户转去 Chat 导致 iframe 失焦而静默替换；状态文案区分文件更新、预览载入与载入失败。
- QA 保留为 Skill、项目产物和自动化质量门，不在游戏制作面板展示独立 Tab、卡片、徽标或营销截图。

### Fixed

- 退出全屏后焦点返回“全屏试玩”，游戏 Tab 补齐 `aria-controls` / `tabpanel` 关系，并移除未提供退出提示的 pointer-lock 权限。
- DSH 不在 `localhost` / `127.0.0.1` 上提供服务时，预览无法取得独立 origin、iframe 因此缺少 `allow-same-origin`；此时读取 `localStorage` 会抛出 SecurityError 并中断整个模块图，游戏渲染为空白。预览路由现在为 HTML 注入内存版 storage 兜底，游戏在两种 sandbox 下都可运行（无独立 origin 时不持久化存档）。
- 预览载入失败现在真的可以被发现：iframe 对 HTTP 错误只触发 `load`、从不触发 `error`，因此改为由父页面直接请求预览地址来判断，不再在空白画面上显示“预览已载入”。
- 游戏预览 iframe 不再以 `previewReady` 作为 key，避免工作区轮询恰好读到缺少 `index.html` 的 `build/app` 时销毁正在运行的游戏。
- Agent 写入 `game-adaptations/` 下的非构建文件时不再把创作者从「试玩」拽到「项目文件」；只有创作者主动选择才切换。
- 游戏工作台改为首次进入「游戏」时才挂载，之后保持挂载（仅隐藏）；空白会话不再在后台静默启动内置示例。

### Security

- 生成游戏通过独立 loopback origin 与 iframe sandbox 隔离；预览路由执行路径收敛、大小限制、CSP 与浏览器来源检查。
- 预览地址加入按进程随机派生的不可猜测路径守卫。预览的信任闸门必须放行跨站、无 Origin 的文档导航（隔离用的 loopback 别名切换与远端站点内嵌在报文上完全一致），因此实际阻止其他站点载入预览的是该守卫，而不是来源判断。
- 非 HTML 预览资源改为一律下发 `default-src 'none'; sandbox`。此前 CSP 只附加在 `.html` 上，而预览路由不限制扩展名，导致 `build/app` 下的 SVG 被直接导航时可在真实 loopback origin 上无策略执行脚本，而 `/oh-story/file` 对该 origin 属于同源。

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
