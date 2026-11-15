# Agent Note: 同步四套上游技能（Oh Story 0.10.5、Drama 0.12.0、NovelToGame 0.9.0、video-recap 0.7.1）与 DSH 0.2.2-rc.3 试用线

Status: implemented

## Problem

`0.1.25` 发布后，四套上游技能与 DSH `next` 均发布了新版本：

- **Drama Skills 0.12.0**（破坏性版本）：统一五份创作者文档的直白字段名（`时代背景`、`室内照明`、`外观特征`、`提示词名称`、`连戏锁`/`锁定词`、`### 首帧提示词`、`动作`、`出场设定`、`开场画面`、`动作过程`），参考图十种用途改成直白命名（`外貌`、`空间布局`、`主体`、`造型状态` 等）；5 份供应商参考合并为单文件 `short-drama-produce/references/builtin-providers.md`；`minimax-h3` 不再要求预设分辨率与时长范围环境变量；内置 `seedance` 与 `minimax-h3` 默认放行 `reference_audio`；`short-drama-edit` 支持 `GROUP-*` 计入剪辑单并对同画幅不同分辨率/帧率片段自动缩放转帧率；`short-drama/SKILL.md` 新增独立 `dashboard_server.py` 启动章节。
- **NovelToGame 0.9.0**：`game-build` 改为灰盒先行（先交付可玩灰盒切片并通过冷启动试玩再上正式美术），`targetFinish: graybox` 项目跳过 `design/ART_DIRECTION.md`。
- **Oh Story 0.10.5**：`agents_version` 42 → 44，精简规划、审稿与去 AI 味参考说明，`story-short-scan` 改按故事处境与转折归纳读后感受。
- **video-recap-skills 0.7.1**：默认多模态理解模型切换为 `mimo-v2.6-flash`；宣发文案从 `packaging_plan.json` 拆分为独立的 `promo_copy.json`。
- **DeepSeek Harness**：npm `latest` 仍为 `0.2.2-rc.1`，npm `next` 推进到 `0.2.2-rc.3`。

## Decision

- 同步四套上游知识资产与短剧 `EP001` 公开样例：
  - Oh Story `0.10.5`（`41a9b6c855d7d29a2bf214b4eefda2b10a0e8afb`，14 Skills、7 Roles、`agents_version` 44）；
  - Drama Skills `0.12.0`（`047ae8625021f038ee7581d6222064f0c169ce59`，12 Skills，含 `scripts/demo-fixtures/drama/让你管账号/剧集/EP001/` 五份文档同步）；
  - NovelToGame `0.9.0`（`48328cd756cd400e617e97dc3bd5c4b42cda3f72`，5 Skills）；
  - video-recap-skills `0.7.1`（`36df69fe9e702dc2f15ccd05fac878ad623cf346`，2 Skills）。
- 适配短剧 0.12.0 的生产、解析与剪辑契约：
  - `drama-adapters.ts`：五个内置 adapter 的 `referenceDoc` 改指 `short-drama-produce/references/builtin-providers.md` 并附 `referenceHeading`；`minimax-h3` 的 `requiredEnv` 收敛为 `MINIMAX_API_KEY` 与 `MINIMAX_VIDEO_MODEL`，分辨率、画幅、时长与轮询参数移入 `optionalEnv`；`seedance` 补齐轮询与超时可选变量。
  - `drama-production.ts`：`parseStoryboard` 优先读取 `### 首帧提示词` 并保留 `### 冻结关键帧提示词` 回退，使工作台不中断已有剧集预览；`parseVideoPrompts` 兼容 `开场画面` / `动作过程`；资产分类识别 `0.12.0` 用途词并用 `造型(?!状态)` 避免把「造型状态」误归为独立造型卡；协议校验识别 `视频提示词.md` 中的 `GROUP-*` 二级标题。
  - `skill-provider.ts` 与 `production-prompts.ts`：`short-drama` 覆盖说明明确禁止运行未随包分发的 `dashboard_server.py`；`short-drama-produce` 区分内置 `seedance`/`minimax-h3` 默认放行 `reference_audio` 与自定义外部配置显式声明 `reference_roles`；`short-drama-edit` 与成片提示词同步 `GROUP-*` 未采用镜头记账、同画幅自动缩放转帧率与异画幅写入 `成片/规格统一/`、静帧两帧下限、`- 重放：` 与真峰值上限默认 `-1.5`。
- 适配小说、游戏与视频桥接及可见产物：
  - `story-short-scan` 桥接文案改为从故事处境与转折找读后感受；
  - `DSH_GAME_BRIDGE` 将灰盒阶段冷启动试玩与 `game-qa` 首轮盲玩统一映射到当前 Preset 可见、未读设计与源码的 DSH 子代理；
  - `video-project.ts` 与 `DSH_VIDEO_BRIDGE` 纳入 `promo_copy.json`（宣发文案）及 `sfx_plan.json`、`original_subtitles.json`、`narration_lint.json`。
- DSH 默认宿主保持 `0.2.2-rc.1`（npm `latest`），`pnpm test:dsh:next` 切到 `0.2.2-rc.3`（npm `next`）：核对过插件依赖的全部 `@deepseek-ai/dsh-*` 包声明文件，`dsh-client-*` 与 `dsh-skill` 零变更，`dsh-subagent` 与 `dsh-tools` 与现有双写激活及钩子完全兼容。

## Alternatives considered

- 短剧工作台只认 `### 首帧提示词`，直接丢弃 `### 冻结关键帧提示词`：虽然上游检查脚本对旧字段报错，但创作者升级插件后打开旧项目时若分镜卡片首帧提示词直接消失，会误以为文稿损坏；保留只读回退零副作用且更友好。
- 把 `minimax-h3` 的分辨率和时长变量继续标为必需：与上游 `provider_adapters.py` 0.12.0 已内置默认值不一致，会让只配了 Key 和模型名的创作者在工作台环境条看到虚假的「未就绪」提示。

## Consequences

收益：四个工作台紧跟最新上游能力与质量门禁；短剧 `MiniMax H3` 与内置角色参考音频开箱配置更简单；视频工作台直接查看独立拆出的宣发文案。

代价：0.12.0 之前的短剧项目若继续跑 `creator_markdown_check.py` 或续写下游阶段，需要先按新字段名更新现有 Markdown 文档。

## Verification

- 四个 parity 检查通过：Oh Story 0.10.5（14 Skills、7 Roles、`agents_version` 44）、Drama 0.12.0（12 Skills 与 7 个 Python selftests）、NovelToGame 0.9.0（5 Skills）、video-recap 0.7.1（2 Skills）。
- `pnpm verify` 全量通过（lint、typecheck、assets:check、dsh:boundary、release.test.mjs、upstream-updates.test.mjs、251 项单测与 build）。
- 打包后原生 DSH Web 集成测试在 `0.2.2-rc.1`（`pnpm test:dsh`）、`0.2.0-rc.2`（`pnpm test:dsh:rc`）与 `0.2.2-rc.3`（`pnpm test:dsh:next`）上实跑验证，且 `pnpm upstream:updates` 确认无未跟进上游版本。
