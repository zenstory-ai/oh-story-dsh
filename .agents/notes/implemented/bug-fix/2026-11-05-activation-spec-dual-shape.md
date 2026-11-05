# Agent Note: oh_story_role 激活参数同时携带新旧两版契约形状

Status: implemented

## Problem

宿主 `startActivation` 的入参契约在官方仓库发生了拍平重构（`refactor(subagent): flatten activation task options`，2026-10-22）：`spec.request.{parent,prompt,maxDepth}` 移到顶层 `spec.*`。已发布 npm 的 `dsh-subagent@0.2.x` 仍读 `spec.request.*`，而跑在新契约宿主（如 Mino fork 的 subagent 0.2.6）上的 `oh_story_role` 会因 `spec.parent` 为 `undefined` 抛 `Cannot read properties of undefined (reading 'id')`，子角色根本起不来。

## Decision

`startActivation` 的 spec 同时携带两份字段：顶层 `parent`/`prompt`/`maxDepth` 供新宿主读，保留 `request` 嵌套形供旧宿主读。两版宿主各自只解构自己要的字段，多余字段被忽略，不需要版本探测。`ManagedRoleSpec` 增加三个可选顶层字段，`role-tool-context.contract.test.ts` 的断言扩展为两份形状都在。

## Alternatives considered

- 只发顶层字段（跟随新契约）：在仍读 `spec.request` 的已发布宿主（0.2.0-rc.x ~ 0.2.2-rc.x）上立刻回归。
- 只保留 `request` 嵌套形：在新契约宿主上不可用，即当前线上症状。
- 按宿主版本探测选择形状：需要可靠的版本来源，目前没有公开缝可拿，双写更简单且无副作用。

## Consequences

新旧宿主上 `oh_story_role` 都能拉起受管子角色；当上游完全淘汰 `request` 形时可删去嵌套字段。工具行为、角色配置与会话标记不变。

## Verification

- `packages/dsh-plugin/tests/role-tool-context.contract.test.ts` 断言 spec 同时含顶层与 `request` 两套字段；revert 后断言失配即红。
- 在新契约宿主（cordis 4.0.6-alpha.2 / subagent 读 `spec.parent` 的运行时）实测：`oh_story_role` 真实拉起 story-explorer 子代理并回话；修复前同路径必现 `reading 'id'`。
