# Agent Note: 纯 DSH 插件的所有权边界：DSH 拥有运行时，插件只做投影

Status: implemented

## Problem

2026-08-19 的蓝图（`docs/blueprint`，ADR-001 到 ADR-005）把产品设计成"包着 DSH 的工作台"：独立的 `AgentRuntimePort` 协议、`apps/host` HTTP 服务、可重建的 SQLite 投影库、`contracts/*.schema.json` 一整套 Story Product Protocol。代价是多一层协议映射，DSH 每个新能力都要重新设计才能进 UI，而产品实际上重复实现了 DSH 已有的 Session、审批、Todo 与 Composer。

## Decision

- `@oh-story/dsh` 是加载进 DeepSeek Harness 的 Cordis 插件，不包装、不代理、不重建 DSH。`docs/ARCHITECTURE.md` 的 Ownership 表是权威：Workspace/Session/持久历史、Agent 循环/provider/模型/凭据、Preset/sandbox/工具/审批、Chat/Trajectory/Todo/Composer 全归 DSH；创作方法归固定上游 Skills/Roles；插件只拥有创作文件树、编辑器、生产投影、游戏/视频预览与文件跟随。
- 否定性保证 must hold：插件 never 引入第二个 Agent runtime、渲染队列、项目数据库或编辑时间线；每个工作台都是对固定上游契约的投影，never 成为第二份创作真相——短剧投影是一次性的 `short-drama/v1`，never 写平行数据库；游戏工作台不加 QA Tab；视频工作台不带多轨编辑器；`oh_story_production` 只表达界面意图，never 编辑文档、生成媒体或充当付费确认。
- Browser 只用官方扩展槽（`shell.overlay`、`tool.call.toolview`），把工作台 portal 进稳定的 `conversation.session` 布局缝，官方会话视图原样保留在自己的列里。
- 运行时收窄见 [remove-standalone-sdk-runtime](../simplification/2026-08-19-remove-standalone-sdk-runtime.md)；文件跟随的数据源见 [file-following-reads-dsh-session-data](2026-08-21-file-following-reads-dsh-session-data.md)。

来源：d2ecd03（backup/pre-clean-20260820）、a79710d、ee5bfd6、38b5be5 (#21)、9e69c0a (#23)。

## Alternatives considered

- **运行时适配层 + 独立产品协议**（蓝图 ADR-001）— 最强理由：UI 不被 Developer Preview 的 Session/Turn/Step 概念绑定，可固定、升级或替换 runtime，可用 fake runtime 测试。否：映射层与 SQLite 投影让产品重建了 DSH 已有的会话、审批与 UI；d2ecd03 整体删除 `apps/host`、`contracts` 与蓝图，改为直接依赖 DSH 内部包并由 CI 钉住版本。
- **Fork DSH Web UI**（ADR-001 列为拒绝项）— 最强理由：完全掌控界面。否：升级冲突高，通用 Agent 心智污染创作产品。
- **自研完整 Agent Runtime**（同上）— 最强理由：不受上游节奏牵制。否：重复建设，错过 DSH 的 Skill/Tool/Subagent 组合能力。

## Consequences

- **收益**：Chat、审批、取消、历史都是 DSH 实现，插件不为它们写测试；安全边界能在 SECURITY.md 用一段话说清。
- **代价与已知上限**：插件依赖 `conversation.session` Slot 与 `data-conversation-scroll`/`data-composer-seat`/`data-chat-flow` 锚点，每个 DSH rc 都要跑 `pnpm test:dsh` 确认锚点仍在（90e4ea7、88b7f7c 的升级记录）。设计新工作台前先对照 Ownership 表；需要"队列/数据库/时间线"类能力时把需求推回上游 Skill 或 DSH，而不是在插件里长出来。
