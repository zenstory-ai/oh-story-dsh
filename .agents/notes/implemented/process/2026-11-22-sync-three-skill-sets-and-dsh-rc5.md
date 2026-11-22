# Agent Note: 同步三套创作技能（Oh Story 0.11.0 / Drama 0.13.0 / video-recap 0.8.0）并升默认宿主至 DSH 0.2.2-rc.5

Status: implemented

## Problem

三套上游技能均在 2026-11-22 发布大版本更新，同时 npm 上 `@deepseek-ai/dsh` 的 `latest` 与 `next` 均推进到 `0.2.2-rc.5`（`alpha` 推进到 `0.2.3-alpha.1`）：

- **Oh Story 0.11.0**（`e5a8b98657c0`，`agents_version` 44 → 45）：全部核心脚本迁至零依赖 Node.js 18+（`.py` → `.js`），写作门禁分层重构为确定性硬底线 + 软提醒，退役三层灵感库。
- **Drama Skills 0.13.0**（`7fed9dfcd33c`）：确立软门禁并移除技能目录内的 7 份 `selftest.py` 与 `fixture_adapter.py`；`provider_adapters.py` 移除 `gpt-image-2` / `music-3.0` 硬编码默认模型，以 `openai-image` 为主命令（保留 `gpt-image-2` 兼容别名），`production_tool.py` 的 `_load_adapter` 返回 4 元组增加 `audio_capable`；`edit_tool.py` 新增 `--screen-text-mode auto|remotion|ffmpeg|off`（无 Node/Remotion 时普通 `字卡` 自动回退 `ffmpeg` ASS）与 `--overlay-renderer`；打通 `MUSIC-*` 成片配乐全链路。
- **video-recap-skills 0.8.0**（`4ae6380a6a5a`）：架构级瘦身为 6 支无状态原子 CLI（`probe.py` / `frames.py` / `transcribe.py` / `tts.py` / `render.py` / `check.py`）+ 4 支单向叶工具（`packaging.py` / `export_jianying.py` / `dashboard.py` / `library.py`）+ `video-reference/scripts/analyze_reference.py`，移除 `recap.py` / `doctor.py` 等单体编排，转向纯 Markdown 工作区（`BRIEF.md` / `MEDIA_NOTES.md` / `EDIT_PLAN.md` / `PROMO.md`）+ `timeline.json` v3 + `check.json` v1（`review_hints`）。
- **DeepSeek Harness**：npm `latest` / `next` 为 `0.2.2-rc.5`（在现有 `>=0.2.2-alpha.2 <0.2.3-0` 兼容范围内）；npm `alpha` 为 `0.2.3-alpha.1`（跨出 `<0.2.3-0` 范围，暂未纳入默认线）。

## Decision

- 同步三套上游知识资产并更新同步/校验脚本与契约桥接：
  - **Oh Story 0.11.0**（`e5a8b98657c05ddb3d53b77d5afe696a63d79985`，14 Skills、7 Roles、`agents_version` 45）：`knowledge-assets.ts` 与 `check-upstream-parity.ts` 同步排除 `.js` 版 `story-setup` 宿主部署脚本；`native-hooks.ts` 与 `skill-provider.ts` 将脚本引用切换为 `.js`（Node.js 18+）并从 `story` 路由移除已退役的灵感库入口。
  - **Drama Skills 0.13.0**（`7fed9dfcd33c5a3134ff1b51709dd826488b5aab`，12 Skills）：`check-drama-parity.ts` 改用 `py_compile` 校验随包脚本并禁止旧 `selftest.py` / `fixture_adapter.py` 回流，同步校验 `format-spec.md`、`MUSIC-*` 与 `reference_roles`；`drama-adapters.ts` 与 `production-prompts.ts` 以 `openai-image` 为主适配器并在生成配置中保留 `gpt-image-2` 兼容别名，将 `OPENAI_IMAGE_MODEL` 与 `MINIMAX_MUSIC_MODEL` 记为可选环境变量（与 `parameters.model` 二选一）；`skill-provider.ts` 同步 `short-drama-edit` 的 `--screen-text-mode` 无 Remotion 降级路径。
  - **video-recap-skills 0.8.0**（`4ae6380a6a5a24199f2ecaf203ac4e38a3471eb5`，2 Skills）：`video-recap-assets.ts` 排除独立 `dashboard.py` 与 `assets/dashboard.html` 并同步上游 `README_EN.md`；`check-video-recap-parity.ts` 与 `native-dsh-smoke.ts` 校验 0.8.0 原子 CLI 与 `timeline.json` v3 / `check.json` v1 契约；`skill-provider.ts` 更新 `DSH_VIDEO_BRIDGE` 为 0.8.0 本地优先契约；`video-project.ts`、`video-workspace-model.ts`、`file-activity.ts` 新增 0.8.0 纯 Markdown 工作区与 `out/preview.mp4`、`out/final.mp4` 识别，同时保留既有 0.7.x 工程的只读兼容。
- 默认宿主推进至 **DeepSeek Harness `0.2.2-rc.5`**（更新 `packages/dsh-plugin/package.json` 的 devDependencies、`pnpm-workspace.yaml` 的 overrides 与 `minimumReleaseAgeExclude`、`scripts/native-dsh-smoke.ts` 与 `scripts/native-dsh-real.ts` 的 `dshVersion`，以及 README / ARCHITECTURE）。`0.2.3-alpha.1`（#150）保留在 `<0.2.3-0` 兼容边界外，待单独确认后再决定是否扩展 `engines.dsh` 与 `peerDependencies`。

## Alternatives considered

- **一步把默认宿主切到 `0.2.3-alpha.1`**：虽然 `0.2.3-alpha.1` 共享 `cordis ~4.1.0` 与 `schemastery ~3.19.0`，但它属于 `alpha` 通道且跨出 `<0.2.3-0` 兼容声明；先稳步升到 npm `latest`/`next` 的 `0.2.2-rc.5` 风险最低，不引入 alpha 波动。
- **在视频工作台直接删除 0.7.x 文件识别**：虽然 0.8.0 移除了旧单体流水线，但创作者磁盘上可能已有 0.7.x 工程；保留只读兼容的同时优先识别 0.8.0 新工作区（`BRIEF.md` / `MEDIA_NOTES.md` / `EDIT_PLAN.md` / `PROMO.md` / `timeline.json` / `check.json` / `out/final.mp4`），不会破坏旧工程浏览。

## Consequences

收益：四套技能全部对齐最新稳定发布版本，默认 DSH 宿主对齐 npm `latest` (`0.2.2-rc.5`)，小说/短剧/视频工作台与上游软门禁、Node.js 运行时和本地优先架构保持一致。

代价：仍依赖 `video-recap-skills` 0.7.1 单体流水线脚本（`recap.py`）的旧视频工作流需停留在插件 `0.1.27`；短剧生图与配乐任务调用方须显式提供 `parameters.model` 或 `OPENAI_IMAGE_MODEL` / `MINIMAX_MUSIC_MODEL`。

## Verification

- `pnpm verify` 全绿（lint、typecheck、四套上游 parity 检查、DSH 边界、release.test.mjs、upstream-updates.test.mjs、271 项单测与 build）。
- `pnpm test:dsh` 在打包后的原生 DSH Web `0.2.2-rc.5` + Chrome 上实跑验证。
