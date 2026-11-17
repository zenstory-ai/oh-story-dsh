# Agent Note: macOS CI 使用同系统版本的 Intel 标准 runner

Status: implemented

## Problem

0.1.27 发布 PR #131 的质量、Windows、打包 DSH Web 与 CodeQL 均通过，但 macOS Job 等待约 15 分钟后被 GitHub 取消，`runner_id` 为 0，未执行任何步骤。GitHub 注明 hosted runner 无法获得，且 macOS Arm64 池存在容量限制；一次自动重试后仍未取得 runner。失败不是代码或测试失败，不能跳过这个必需检查来合并。

## Decision

仅把 Portability 矩阵的 macOS 实际 runner 固定为官方 `macos-26-intel`，继续覆盖 macOS 26，不退到 macOS 15。Windows、Node 24、完整检查命令、两个矩阵格、超时与 `fail-fast: false` 不变。

将 runner 与检查标识拆开：`matrix.os` 保留受保护规则和发布证明使用的精确检查名 `Portability (macos-latest)`，`matrix.runner` 表明实际执行镜像。CI 注释和 CONTRIBUTING 明确这个名称是兼容标识，不声称 Intel 就是 `macos-latest` 的当前映射。发布仍要求新提交真实通过四项 PR 检查，以及合入后同一 main SHA 的最新完整 CI；不添加 skip、neutral、`continue-on-error` 或管理员绕过。

## Alternatives considered

- 继续重复请求 Arm64 runner：已做过恢复尝试，GitHub 明确报告容量不足，没有代码修复能让任务获得机器。
- `macos-15-intel`：能切换架构，但会降低当前 macOS 26 的系统覆盖。
- 付费 larger runner、跳过 macOS 或管理员合并：前者引入未请求的费用，后两者破坏发布门禁。
- 改检查名称再修改分支保护：没有必要改动仓库保护策略，保留稳定的检查标识即可。

## Consequences

GitHub 不保证 Intel 池没有容量问题，必须以新提交的实际运行结果为准。CI 的 macOS 架构从 Arm64 改为 x64，不应把它表述为 Arm64 CI 已通过；本次本地 Apple Silicon 的 `pnpm verify:release` 已另外通过三条 DSH 宿主线。未来 macOS 版本变更时需重新评估显式的 26 镜像。

## Verification

- [本次容量失败](https://github.com/zenstory-ai/oh-story-dsh/actions/runs/44144683956/job/134256479347)：无 runner、无执行步骤，GitHub 给出容量注释。
- [官方标准 runner 表](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) 将 `macos-26-intel` 列为公共仓库免费标准 x64 runner，未标 Beta；[当前镜像表](https://github.com/actions/runner-images/blob/main/README.md) 明确其为 macOS 26 x64，[镜像清单](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md) 包含 Node 24 工具缓存。
- [官方 matrix 语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy) 允许分别用于名称和 `runs-on` 的字段。
- `actionlint .github/workflows/ci.yml` 与 `pnpm verify` 通过（36 个文件、270 项测试及类型、lint、资产、边界、构建）。实际 macOS Intel 环境仍须由新提交的受保护 CI 完整通过后才允许合并；main 的同提交完整 CI 仍是打 Tag 的前置条件。
