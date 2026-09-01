# Contributing to oh-story-dsh

## 环境

- Node.js 24+
- pnpm 11.7+
- Python 3（上游 Drama Skills 自测需要；可用 `DRAMA_PYTHON` 指定解释器）
- Chrome（仅原生 DSH Web 集成测试需要）

```bash
pnpm install --frozen-lockfile
```

## 本地验证

测试按成本和外部依赖分为三层：

```bash
pnpm verify          # 静态检查、类型、资产完整性、边界、单测与构建
pnpm test:contract   # 使用真实 Cordis Context/Fiber 验证跨作用域服务契约
pnpm test:dsh        # 打包并安装到隔离的官方 DSH Web，验证 Session、Skills、Role 与 UI
pnpm verify:release  # 发布门禁：verify + 原生 DSH Web 集成测试
```

确定性的 packaged DSH 测试包含 Role 调用，是代码正确性的发布门禁。真实模型链路不会进入普通 Pull Request CI；它受模型、服务端和网络波动影响，只作为 provider 兼容性观察。需要发布前观察时，通过一次性环境变量或仅包含 Key 的临时文件运行：

```bash
DEEPSEEK_API_KEY_FILE=/path/to/key pnpm test:dsh:real
# 或：DEEPSEEK_API_KEY=... pnpm test:dsh:real
```

测试脚本会使用独立的临时 DSH home 和作品目录，错误与日志会脱敏；不要把凭据写入仓库文件。

## 上游知识资产

- Oh Story：`packages/knowledge/oh-story`
- Drama Skills：`packages/knowledge/drama`
- video-recap-skills：`packages/knowledge/video-recap`

本地同步相邻 checkout：

```bash
OH_STORY_UPSTREAM_DIR=/path/to/oh-story-claudecode pnpm assets:sync:story
DRAMA_SKILLS_UPSTREAM_DIR=/path/to/drama-skills pnpm assets:sync:drama
VIDEO_RECAP_UPSTREAM_DIR=/path/to/video-recap-skills pnpm assets:sync:video
pnpm assets:check
```

同步提交必须连同 manifest 更新一起评审。不要手工修改固定资产后绕过哈希校验。
若上游是破坏性版本，PR 还必须说明旧项目迁移边界，并更新 DSH bridge、演示 fixture、原生浏览器测试与真实 provider fixture；不能只看 skill 目录数量或因旧脚本仍存在就沿用旧工作流。

## CI 分层

- `CI / Quality gate`：Ubuntu 上执行完整确定性门禁 `pnpm verify`。
- `CI / Portability`：macOS 与 Windows 执行类型、资产、单测与构建，锁定跨平台路径行为。
- `CI / Packaged DSH Web integration`：构建 tarball、安装到官方 DSH Web，并用 Chrome 验证能力目录、工作区安全与三栏 UI。
- `Real Provider`：手动兼容性观察；凭据预检与真实测试是独立 Job。配置 `DEEPSEEK_API_KEY` 时真实测试显示 executed，未配置时真实测试 Job 显示 skipped，汇总区分 `EXECUTED_AND_PASSED`、`EXECUTED_AND_FAILED`、`SKIPPED_NO_CREDENTIAL`、`PREFLIGHT_FAILED` 与 `PROVIDER_JOB_NOT_COMPLETED`。只有 `EXECUTED_AND_PASSED` 会让工作流成功；其余状态都不会产生绿色兼容性结论。
- `Release`：Tag 或手动触发发布门禁；`v*` Tag 会把同一份 `.tgz` 发布到 GitHub Release 与 npm。

## 发布检查

1. 更新版本、安装示例与 `CHANGELOG.md`。
2. 运行 `pnpm verify:release`。
3. 需要观察官方 provider 兼容性时，运行 `pnpm test:dsh:real`，并确认结果是 executed and passed、项目摘要未改变、凭据未出现在日志中；缺少凭据导致的 skipped 不能记作 passed，也不替代第 2 步的确定性 correctness gate。
4. 运行 `DEEPSEEK_API_KEY=... pnpm demo`，通过真实 DeepSeek 会话一次性重新生成并检查两张 README 演示图。
5. 运行 `pnpm pack:release` 并检查 tarball。
6. 按 [`docs/RELEASING.md`](docs/RELEASING.md) 创建与包版本一致的 Tag，由工作流执行正式发布。

架构约束见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，验证覆盖见 [`docs/VALIDATION.md`](docs/VALIDATION.md)。
