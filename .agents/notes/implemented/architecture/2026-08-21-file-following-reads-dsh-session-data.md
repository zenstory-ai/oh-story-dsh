# Agent Note: Agent 文件跟随只读 DSH Session 数据，不做 Host 侧投影

Status: implemented

## Problem

编辑器要在 Agent 的 `write`/`edit`/`str_replace_editor` 调用流式生成参数时定位文件并逐字预览。DSH 有意不把仅含工具调用的 partial Assistant 放进可见 Chat 的 `partial`，直接看会话快照会漏掉正在进行的写入。42ff167 的做法是在 Host 端加 `file-activity-projection.ts`，把已提交的 `assistant/chunk` 事件折叠成"进行中调用"列表再推给浏览器——这等于插件自己维护一份 Session 投影，与 DSH 的官方数据源并存。

## Decision

- Browser 从 DSH 官方数据源读文件活动：流式块来自 Step location data（`chat.timeline`），执行中与嵌套工具来自 `runningCalls`（DSH 0.1.2 起为 `useChat` 快照的 `legacy.runningCalls`）。`packages/dsh-plugin/src/client/file-activity.ts` 只做参数解析、创作路径归类与投影到最后一次落盘版本。
- 工具落定后 `/oh-story/workspace` 路由再次成为权威；人工未保存缓冲优先于 Agent 输出并给出逐文件冲突提示。
- 工作台状态由 DSH 的 Session-scoped Slot Store 持有（overlay 声明严格 Session 子槽，DSH 提供 `sessionId`、`useSession` 与每 Session Store）。插件 never 手动订阅 Session，never 在 Host 端维护第二份进行中调用列表。
- Host 贡献清单因此不含 Session Projection；总边界见 [pure-dsh-plugin-ownership-boundary](2026-08-20-pure-dsh-plugin-ownership-boundary.md)。

来源：bd04916、42ff167、b9427d8 (#22)。

## Alternatives considered

- **Host 侧 Session Projection**（42ff167 当天实现，bd04916 当天移除）— 最强理由：不依赖浏览器端 DSH 内部快照结构，Host 能看到完整事件日志。否：与 DSH 自己的 Step location data 重复，两份"进行中"状态可能不一致；DSH 拆包时投影类型还要跟着改。
- **只监听工具落定后的磁盘变化** — 最强理由：与 DSH 快照零耦合。否：失去逐字预览，且极快完成的调用同样需要落地后定位（CHANGELOG 0.1.2 Fixed 条目）。

## Consequences

- **收益**：Host 少一个契约面，进行中状态只有 DSH 一份。
- **代价与已知上限**：耦合 DSH 客户端快照形状——b9427d8 升级时会话快照去掉 `chat`/`runningCalls`、记录去掉 `callView`/`resultView`，文件活动改为纯从工具参数推导。升级 DSH 时 `tests/file-activity.test.ts` 与 packaged smoke 的"real DSH Agent write"断言是回归面；若上游再次收窄快照，先看这两处。
