# Agent Note: 确定性 packaged DSH 测试是正确性门禁，真实模型链路只做兼容性观察

Status: implemented

## Problem

插件的核心路径（Skill 目录、Role 子 Agent、工作区路由、三栏 UI）只有装进真实 DSH Web 才能验证；而真实 DeepSeek provider 受模型、服务端与网络波动影响且付费。把付费链路放进 PR CI，红绿不再反映代码正确性；"没凭据就跳过并绿"，又会把非结果当成通过。

## Decision

- 三层：`pnpm verify`（lint、typecheck、`assets:check`、`dsh:boundary`、单测含 `*.contract.test.ts`、build）；`pnpm test:contract`（真实 Cordis Context/Fiber 验证跨作用域服务契约，叶子运行时仍是确定性 fake）；`pnpm test:dsh`（打包、装进隔离 DSH Web、Chrome 驱动，含一次确定性 `oh_story_role` 子 Agent 调用）。`verify:release = verify + test:dsh`，Release 工作流重跑它并校验 Tag 与包版本一致。
- 每个 PR 跑 Quality gate（Ubuntu `verify`）、Portability（macOS/Windows `verify:portable`）、Packaged DSH Web integration 三个 Job。
- `Real Provider` 只能手动触发；凭据预检与真实测试是独立 Job，汇总 Job 只在 `EXECUTED_AND_PASSED` 时成功，`SKIPPED_NO_CREDENTIAL`、`PREFLIGHT_FAILED`、`PROVIDER_JOB_NOT_COMPLETED` 都让工作流失败。凭据只从环境变量、被忽略的 `.env.local` 或 `DEEPSEEK_API_KEY_FILE` 读取，日志脱敏。
- 时序脆弱时 never 靠加大超时掩盖：仅供 demo 的视频 Session 只在录制 demo 帧时创建，正确性运行保持与 main 相同的负载（9e69c0a）。
- 上游资产的完整性检查属于第一层，见 [pinned-upstream-assets-manifest-review](../process/2026-08-20-pinned-upstream-assets-manifest-review.md)。

来源：ee5bfd6、0f573fb (#8)、9e69c0a (#23)。

## Alternatives considered

- **只有 Secret 存在时跑真实链路，缺失则 skip 并绿**（ee5bfd6 的初版 real-provider 工作流）— 最强理由：一个工作流覆盖有无凭据两种情况。否：0f573fb 指出跳过不是通过，改为独立汇总 Job 明确区分五种结果。
- **把真实模型作为发布门禁的一部分** — 最强理由：最接近用户真实体验。否：不确定性让门禁不可重复；改为发布检查清单里的"观察"步骤，且明确不替代确定性 gate。
- **用手工维护的测试计数当覆盖证据**（VALIDATION 曾写"9 test files and 34 tests"）— 最强理由：一眼看到规模。否：数字必然过期；0f573fb 改为由 gate 自动发现 `*.test.ts`，覆盖表只描述可执行行为。

## Consequences

- **收益**：PR 红绿只反映代码；provider 兼容性有明确的五态结论，不会出现"绿色的非结果"。
- **代价与已知上限**：`test:dsh` 依赖 Chrome 与 DSH npm 包，在 CI 25 分钟预算内余量很小（9e69c0a 记录 main 刚好在预算内），新增 Session 或完整 Agent turn 前先评估负载；真实模型回归只能在发布前人工观察，模型行为漂移不会被 PR 拦下。
