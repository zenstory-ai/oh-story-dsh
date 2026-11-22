# Agent Note: 配置 Dependabot 冷却期以对齐 pnpm minimumReleaseAge 并收敛 CI 并发策略

Status: implemented

## Problem

仓库使用 `pnpm@11.7.0`，pnpm 11 默认启用 1440 分钟（24 小时）的 `minimumReleaseAge` 供应链防线，但仓库缺少 `.github/dependabot.yml` 冷却期配置。此前多次 Dependabot 更新在锁文件解析出刚发布不久的传递依赖时直接撞上 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，造成持续 CI 红灯噪音。此外，`.github/workflows/ci.yml` 的 `concurrency.cancel-in-progress: true` 也会在短时间连续合入 `main` 时取消前一次 `main` CI，影响 `release.yml` 依赖的 `main` CI 证明；`real-provider.yml` 有两个辅助 Job 缺少 `timeout-minutes`。

## Decision

- 新增 `.github/dependabot.yml`：
  - 为 `npm`（pnpm 生态）配置每周更新与 `cooldown.default-days: 3`（高于 pnpm 11 默认的 1 天 `minimumReleaseAge`，留出传递依赖与时区缓冲），并忽略由 `upstream-updates.yml` 与 `pnpm-workspace.yaml` 统一协同管理的 `@deepseek-ai/*` 包。
  - 为 `github-actions` 配置每周更新与 `cooldown.default-days: 7`。
- 将 `.github/workflows/ci.yml` 的 `concurrency` 收紧为仅 `pull_request` 事件启用 `cancel-in-progress`，保护 `main` 分支推送不被互相取消，同时保持四个受保护检查项名称完全不变。
- 为 `.github/workflows/real-provider.yml` 的 `credential-preflight` 与 `summary` 补齐 `timeout-minutes: 5`。

## Alternatives considered

- **在 `pnpm-workspace.yaml` 中关闭或下调 `minimumReleaseAge`**：可以立即消除冲突，但会削弱 pnpm 11 默认的 24 小时投毒包防护，不符合仓库安全基线。
- **仅在 `dependabot.yml` 设置 `default-days: 1`**：与 pnpm 默认 1440 分钟边界贴得太紧，容易因为注册表同步或传递依赖发布时间差再次误触发失败，因此采用 3 天冷却期。

## Consequences

- **收益**：Dependabot 常规版本更新会等待 3 天（Actions 为 7 天）后再发起，避免与 pnpm 11 的 24 小时发布年龄门槛冲突；`main` 分支 CI 不再因连续合入被误取消。
- **代价**：非安全类依赖版本更新会晚 3 天出现 PR；注意 GitHub Dependabot 安全更新按平台设计会绕过 `cooldown`，若安全更新拉入刚发布不足 24 小时的传递依赖，仍需待满 24 小时后重跑 CI。

## Verification

- 本地运行 YAML 解析校验与 `git diff` 核对全部第三方 Action 保持 40 位 SHA 钉死。
- 通过 PR CI 验证 `Quality gate`、`Portability (macos-latest)`、`Portability (windows-latest)`、`Packaged DSH Web integration` 全部通过。
