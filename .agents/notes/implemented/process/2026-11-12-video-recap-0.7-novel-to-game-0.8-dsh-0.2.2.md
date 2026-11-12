# Agent Note: video-recap 0.7.0、NovelToGame 0.8.0 与 DSH 0.2.2 默认线适配

Status: implemented

## Problem

0.1.24 发布后，两个上游发了破坏性版本。

- video-recap-skills 0.7.0：六个生产技能（`video-understanding`、`video-script`、`video-cut`、`video-voiceover`、`video-assemble` 与编排 `video-recap`）合并成一个自包含的 `video-recap`，加上按需的 `video-reference`。删除了 dub、`adopted-packet-copy`、MiMo 解说评审、`--mimo-video-overview`、理解阶段的二次归纳产物，以及若干环境变量（`EDIT_MODE`、`TARGET_DURATION` 设了就报错）。多份 JSON 产物删掉了恒为空的键。`recap.py --doctor` 改为 `scripts/doctor.py`，最终质检默认必过。新增包装方案、封面、音效轨、镜头复核和只读审片台。
- NovelToGame 0.8.0：`game-concept`、`game-world-design`、`game-art-direction` 合并为 `game-design`，技能数从 7 变 5。`game-qa` 改为两轮新玩家盲玩，首轮要求在没读过源码和设计的独立会话里进行。

同时，npm `latest` 前进到 `0.2.2-rc.1`，这正是 [0.1.23](2026-11-05-novel-to-game-0.7-and-dsh-0.2.2-rc1.md) 定下的「rc.1 成为 latest 再换默认线」的条件；`next` 是 `0.2.2-rc.2`，它改了子代理启动接口。Oh Story 0.10.3、Drama 0.11.2 已由 0.1.24 同步。

## Decision

- video-recap 同步到 0.7.0。parity 改为要求恰好 `video-recap` 与 `video-reference` 两个技能，必需脚本都在 `skills/video-recap/scripts/` 下（含 `doctor.py`、`validate.py`、`library.py`）。同步排除规则不变，0.7.0 的审片台（`dashboard_server.py`、`scripts/dashboard/`、`assets/dashboard/`）仍不打包。
- 视频技能桥：改为描述单一自包含技能；去掉 dub 与 `--confirm-voice-rights` 一句；列出已删除的参数和环境变量，并要求旧 `work/` 打印的续跑命令先去掉它们再跑；要求遇到最终质检阻断时逐条报告并修因，只有作者明确要草稿时才传 `--no-require-final-qc`。原来 dub 那句承担的授权要求，改由 `--voice-ref` 承担：它会把参考录音发给 MiMo 的声音克隆模型，上游 SKILL.md 也写了先确认声音授权。环境检查改指 `scripts/doctor.py`。
- 视频运行时：Host 侧的 MiMo Key 不再把 `MIMO_VIDEO_API_KEY` 算作已配置，0.7.0 已不读取它。工作台可见文件里去掉已不再生成的 `narration_review.md`，加上 `packaging_plan.json`（包装方案）和 `shot_review.json`（镜头复核）。工作台读取的其余字段和路径在 0.7.0 里都还在（逐项核对过上游写入代码），不用改。
- NovelToGame 同步到 0.8.0。游戏技能桥改为五个技能，并把「白盒试玩用没读过设计的新代理」的映射扩展到 `game-qa` 首轮盲玩：都用当前 Preset 可见的 DSH 子代理，只给可玩入口、`game-qa` 允许读的运行说明和正常输入。`qa/verification.json` 仍是六项检查，Game Studio 读的三份阶段文稿位置也没变。
- DSH 默认线与开发宿主改为 `0.2.2-rc.1`，配套 Cordis `4.1.0`、Schemastery `3.19.0`、Cordis 插件 `1.1.0`、cosmokit `1.9.0`。`test:dsh:rc` 仍测 `0.2.0-rc.2`，`test:dsh:next` 改测 `0.2.2-rc.2`。rc.2 的子代理接口变化见 [oh_story_role 同时发送新旧两种子代理启动参数](../architecture/2026-11-12-role-activation-spec-both-shapes.md)。
- 版本号为 0.1.25：main 上已有 0.1.24（#116，同步 Oh Story、Drama 与 NovelToGame 0.7.1）。

## Alternatives considered

- 视频停在 0.6.2，等上游稳定再跟：不用改桥和工作台。但 0.6.2 之后的修复和质检门禁都只在 0.7.0 上；改动面主要是桥文案和 parity，工作台读的字段没变，跟进的代价不大。
- 把 0.7.0 的审片台随包分发：上游 SKILL.md 现在会让 Agent 启动它。但它是另一个本地 Web 服务，和「视频」标签重复，违反「不起第二个看板或服务」的边界；桥里写明不要启动它。
- 视频预览工作台展示 0.7.0 的 `cover.jpg`：作者能直接看到封面。但工作台的预览只认视频格式，要加图片类型和新的预览角色，留给后续单独做。
- 默认线继续停在 `0.2.1-rc.5`：老用户不用升 Node。但 npm `latest` 已是 0.2.2，新用户 `npx @deepseek-ai/dsh` 装到的就是它；0.2.1 线仍在支持范围内。

## Consequences

收益：视频作者拿到 0.7.0 的包装、混音和质检门禁，游戏作者拿到 0.8.0 的盲玩与文字精修；默认安装与 npm `latest` 一致；Role 在 rc.2 上也能用。

代价：dub 和「声音已定稿」路线在插件里不再可用，需要的作者要另装 0.6.2；旧视频项目的续跑命令可能要手动删参数。默认线要求 Node.js 24.9+。`cover.jpg` 暂时看不到。真实模型实测只覆盖审稿链路，不覆盖视频和游戏流程。

## Verification

- 四个 parity 通过：Oh Story 0.10.3、Drama 0.11.2、NovelToGame 0.8.0（5 Skills）、video-recap 0.7.0（video-recap + video-reference）。typecheck、lint 与 251 个单元测试通过。
- 打包 Chrome 与真实 provider 结果见本次发布 PR。
