# Agent Note: 移除独立 SDK 兼容运行时，只保留原生 DSH 插件一条运行路径

Status: implemented

## Problem

早期仓库同时维护两条运行时：原生 Cordis 插件，以及基于 `@deepseek-ai/dsh-sdk-client` + JSON-RPC demo 子进程的独立兼容运行时（`packages/dsh-compat/src/dsh-runtime.ts`，配套 `profiles/oh-story/cordis.yml` 与 `scripts/real-host-e2e.ts`）。rc.8 的 SDK wire 没有逐 prompt 取消，兼容层只能把 Stop 映射成有界的子进程关停；每次升级 DSH 都要重新评估两套契约；独立 Host 还能以"生产形态"启动第二个 DSH 进程，安全声明因此说不清。

## Decision

- 仓库只有一个产品包 `@oh-story/dsh`。`@deepseek-ai/*` 只允许在 `packages/dsh-plugin/` 内 import；`scripts/check-dsh-boundary.ts`（`pnpm dsh:boundary`，属于 `pnpm verify`）扫描 `apps/`、`packages/` 下其余 TS 文件，命中即失败。
- `scripts/build-dsh-plugin.ts` 检查 Host bundle，出现 `dsh-sdk-jsonrpc`、`DeepSeekHarness`、`FakeRuntimeAdapter`、`NativeDshRuntimeAdapter`、`EventSource` 任一标记即拒绝产物。
- 插件 never 启动第二个 DSH 进程、never 打开自己的网络监听、never 读取凭据（SECURITY.md 信任边界）。真实 provider 验证 must 经过打包后的原生插件（`pnpm test:dsh:real`），不存在独立 Host 的 real e2e。
- 所有权划分见 [pure-dsh-plugin-ownership-boundary](../architecture/2026-08-20-pure-dsh-plugin-ownership-boundary.md)。

来源：1740de6（backup/pre-clean-20260820 分支）、a79710d、d2ecd03（同上分支，main 根提交 a79710d 承接其结果）。

## Alternatives considered

- **保留独立 Host 作为开发与兼容验证面** — 最强理由：不装 DSH 也能本地起服务，Fake runtime 让 UI 测试确定。否：1740de6 之后独立 Host 只剩显式 Fake 模式，随后 d2ecd03 把 `apps/host` 整体删除；开发验证改由打包安装到隔离 DSH Web 的 `pnpm test:dsh` 承担，见 [real-provider-outside-pr-ci](../testing/2026-08-20-real-provider-outside-pr-ci.md)。
- **保留 SDK JSON-RPC 作为次级生产路径** — 最强理由：只依赖公开 SDK，不碰 Developer Preview 的内部包 API。否：wire 没有 per-prompt cancel，Stop 只能关子进程并靠可恢复的 StoryRun 假装取消；每次 DSH 升级要同时维护两份契约与两套真实启动测试。

## Consequences

- **收益**：DSH 升级只改一处（package peer 范围、`pnpm-workspace.yaml` overrides、两条原生测试脚本）；"没有第二个运行时"可由 build 与 boundary 脚本机械核实，而不是散文承诺。
- **代价与已知上限**：插件与 DSH 内部包（`dsh-client-store`、`dsh-api-session-controller` 等）强耦合，上游拆包时插件源码必须跟着改（b9427d8 是一例）。若 DSH 公开带取消语义的稳定 SDK，可重访；在那之前 never 为"方便本地开发"重新引入 Fake 或独立运行时。

## Verification

`pnpm dsh:boundary` 输出 `DSH boundary OK`；`pnpm build:dsh-plugin` 的禁用标记检查通过；`grep -rn "dsh-sdk" packages/dsh-plugin/src` 为空。
