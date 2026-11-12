# Agent Note: oh_story_role 同时发送新旧两种子代理启动参数

Status: implemented

## Problem

`oh_story_role` 通过 DSH 的 `subagents.startActivation` 启动 Oh Story 的 7 个专业 Role。到 `0.2.2-rc.1` 为止，启动参数把任务放在 `request` 里：`{ provider, label, childId, request: { parent, prompt, maxDepth }, signal, delivery }`。DSH `0.2.2-rc.2`（npm `next`）的 `SubagentActivationSpec` 改为直接继承 `SubagentStartRequest`，`parent`、`prompt`、`maxDepth` 平铺在参数本身，运行时读 `spec.parent`、`spec.prompt`、`spec.maxDepth`，不再读 `request`。

插件对 rc.2 做类型检查时，`role-tool.ts` 与 Role 契约测试都报错；运行时 rc.2 会因为 `spec.parent` 为空拒绝启动，写作、审稿、拆文等所有派 Role 的流程都会失败。单元测试用的是模拟的子代理服务，所以测不出这个问题。插件同时声明支持 `0.2.0-rc.2` 到 `0.2.2` 的多条宿主线，它们读的是旧写法。

## Decision

`ManagedRoleSpec` 同时带两种写法：`parent`、`prompt`、`maxDepth` 平铺在顶层，另在 `request` 里放同一份。核对过两边的运行时代码：rc.2 的 `startActivation` 只按字段名读取，不展开或持久化整个参数，`assertCapabilities` 只检查 provider 能力相关的字段；更早的宿主只读 `request`，忽略顶层多出的字段。所以同一份参数在所有支持的宿主上都能用。

契约测试改成逐项断言：顶层和 `request` 里的 `parent` 都是调用方 Agent，`prompt` 和 `maxDepth` 也都对。父 Agent 是 Cordis 代理对象，vitest 的 `objectContaining` 比较它时会在打印差异时崩溃，所以用 `toBe` 按引用比较。

## Alternatives considered

- 运行时探测宿主版本（读 `@deepseek-ai/dsh-subagent` 的版本号或检查 `startActivation.length`），按版本选一种写法：参数里没有多余字段，看起来最干净。但版本号拿不到时要猜，函数签名的形参个数在两个版本里相同；猜错就是 Role 全部失败，而带两份字段没有已知的副作用。
- 只按 rc.2 的新写法发送，放弃 rc.1 及更早的宿主：代码最简单。但默认宿主就是 rc.1，`0.2.1-rc.5`、`0.2.0-rc.2` 也还在支持范围里，这样会让当前大多数用户的 Role 失效。
- 开发宿主直接切到 rc.2，让类型检查逼着改：日常类型检查能覆盖新接口。但 rc.2 只是 npm `next`，默认安装的是 rc.1；开发宿主跟默认线保持一致，rc.2 用临时副本做类型检查和测试。

## Consequences

收益：插件在 `0.2.0-rc.2`、`0.2.1-rc.5`、`0.2.2-rc.1` 与 `0.2.2-rc.2` 上都能派 Role，不用等 rc.2 成为 `latest` 再补发版本。

代价：参数里多一份重复字段。等支持范围不再包含读 `request` 的宿主时，要删掉 `request` 那一份，否则会一直带着。DSH 将来若开始严格校验参数里的未知字段，这种写法会失效，要靠 `test:dsh:next` 的打包冒烟（含 Role 调用）发现。

## Verification

- 开发宿主 `0.2.2-rc.1`：typecheck 与 7 个真实 Cordis 契约测试通过。
- 临时副本切到 `0.2.2-rc.2`：修复前 typecheck 在 `role-tool.ts` 报 2 处错误、契约测试报 1 处；修复后 typecheck、7 个契约测试、251 个单元测试与构建全部通过。
- 打包 Chrome 在 `0.2.2-rc.2`、`0.2.2-rc.1`、`0.2.1-rc.5` 与 `0.2.0-rc.2` 上均 `"ok": true`（含 Role 调用）；真实 DeepSeek 在 rc.2 上派出的 2 个 Role 都成功。
