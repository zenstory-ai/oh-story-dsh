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

测试按开销和外部依赖分为三层：

```bash
pnpm verify          # 静态检查、类型、资产完整性、边界、单测与构建
pnpm test:contract   # 使用真实 Cordis Context/Fiber 验证跨作用域服务契约
pnpm test:dsh        # 打包并安装到隔离的官方 DSH Web，验证 Session、Skills、Role 与 UI
pnpm verify:release  # 发布门禁：verify + 原生 DSH Web 集成测试
```

打包后的原生 DSH 集成测试采用固定桩响应（含 Role 调用），作为代码正确性的发布门禁。真实模型调用受模型、服务端与网络波动影响，不进入常规 Pull Request CI，仅在发布前用于观察官方接口兼容性，可通过一次性环境变量或只存 Key 的临时文件运行：

```bash
DEEPSEEK_API_KEY_FILE=/path/to/key pnpm test:dsh:real
# 或：DEEPSEEK_API_KEY=... pnpm test:dsh:real
```

测试脚本会使用独立的临时 DSH home 与作品目录，错误和日志均会脱敏；请勿把凭据写入仓库文件。

## 上游知识资产

- Oh Story：`packages/knowledge/oh-story`
- Drama Skills：`packages/knowledge/drama`
- NovelToGame：`packages/knowledge/novel-to-game`
- video-recap-skills：`packages/knowledge/video-recap`

从本地相邻目录同步：

```bash
OH_STORY_UPSTREAM_DIR=/path/to/oh-story-claudecode pnpm assets:sync:story
DRAMA_SKILLS_UPSTREAM_DIR=/path/to/drama-skills pnpm assets:sync:drama
NOVEL_TO_GAME_UPSTREAM_DIR=/path/to/novel-to-game pnpm assets:sync:game
VIDEO_RECAP_UPSTREAM_DIR=/path/to/video-recap-skills pnpm assets:sync:video
pnpm assets:check
```

同步提交必须连同 `manifest.json` 更新一起评审，切勿手动改动固定资产或绕过哈希校验。
若上游包含不兼容变更，PR 还须说明旧项目迁移边界，并同步更新 DSH 桥接说明、演示样例、原生浏览器测试与真实接口回归脚本；不能只核对 Skill 目录数量，也不能因为旧脚本仍在就继续沿用旧流程。

## CI 分层

- `CI / Quality gate`：在 Ubuntu 上运行完整的固定门禁 `pnpm verify`。
- `CI / Portability`：在 macOS 26 Intel 与 Windows 上运行类型检查、资产校验、单测与构建，验证跨平台路径处理。为保持分支保护规则名称不变，macOS 检查项仍叫 `Portability (macos-latest)`，实际 runner 指定为 `macos-26-intel`（并非 GitHub 的 Arm64 `macos-latest` 镜像）。
- `CI / Packaged DSH Web integration`：打出 tarball 装入官方 DSH Web，并用 Chrome 验证能力目录、工作区安全边界与工作台界面。
- `Real Provider`：手动触发的官方接口兼容性检查，凭据预检与实测分属两个独立 Job。配置 `DEEPSEEK_API_KEY` 时实测 Job 执行，未配置时跳过；汇总区分 `EXECUTED_AND_PASSED`、`EXECUTED_AND_FAILED`、`SKIPPED_NO_CREDENTIAL`、`PREFLIGHT_FAILED` 与 `PROVIDER_JOB_NOT_COMPLETED` 五种状态，只有 `EXECUTED_AND_PASSED` 会让工作流通过，其余状态一律判为失败。
- `Release`：手动触发时仅在 `main` 上执行打包演练，不对外发布；推送正式 `vX.Y.Z` Tag 时，该提交必须已合入 `main` 且最新一轮完整 CI 四个 Job 全部通过，工作流才会把单次构建出的同一份 `.tgz` 同步发往 GitHub Release 与 npm。重跑工作流时，字节一致的已有产物会自动跳过，字节不一致则报错终止，绝不覆盖已发布内容。

## 发布检查

1. 更新版本号、安装示例与 `CHANGELOG.md`。
2. 运行 `pnpm verify:release`。
3. 需要验证官方 DeepSeek 接口兼容性时，运行 `pnpm test:dsh:real`，确认实测通过（因缺凭据跳过的不能算通过）、示例项目摘要未变且日志中未泄露凭据；这项观察不替代第 2 步的发布门禁。
4. 需要重录 README 演示图时，运行 `DEEPSEEK_API_KEY=... pnpm demo`（需安装 `ffmpeg`），通过真实 DeepSeek 会话重新生成并核对四张动图。设置 `OH_STORY_DEMO_MOCK=1` 可用本地固定样例出图调试，但不能当作真实模型运行记录。
5. 运行 `pnpm pack:release` 并检查生成的 tarball。
6. 按 [`docs/RELEASING.md`](docs/RELEASING.md) 在已通过 CI 的提交上打与包版本一致的 Tag，由发布工作流完成正式发布。

架构边界见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，验证说明见 [`docs/VALIDATION.md`](docs/VALIDATION.md)。
