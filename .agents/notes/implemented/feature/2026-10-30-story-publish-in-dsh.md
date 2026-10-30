# Agent Note: DSH 里接入 story-publish 与 0.1.21 联合适配

Status: implemented

## Problem

0.1.20 发布后，upstream-update 开了三个 issue：Oh Story 0.9.2（#95，`agents_version` 37 → 38）、Drama Skills 0.10.0（#96）、DSH `0.2.1-rc.5`（#97，同时成为 npm `latest` 与 `next`）。

Oh Story 0.9.2 新增第 14 个 Skill `story-publish`：从设定和大纲整理番茄小说的建书资料，存成 `发布资料-番茄小说.md`，并附带 `scripts/check-publish-format.py`；`story-cover` 增加仅提示词模式。插件里有三处写死了 13 个 Skill（Oh Story parity、打包冒烟、技能目录单测），DSH 自己的 `story` 路由页也不认识发布资料这个意图。上游 `story-publish` 要求先看当前会话实际能调用的生图工具，并且不替作者登录后台或发布；DSH 的 Preset 可能带浏览器工具，模型会不会顺手去操作作者后台，上游文案没有针对这种宿主。

Drama 0.10.0 加了打戏、群戏的写法，缺参考图时默认写 `PLAN-...` 挂图计划并照常交付视频提示词，英文台词按词估时。示例 EP001 没有改。

## Decision

- 同步 Oh Story 0.9.2 与 Drama 0.10.0，排除规则不变；`story-setup` 新增的各宿主部署说明和模板仍在原排除目录里。
- Oh Story parity、打包冒烟与技能目录单测的数量改为 14。
- DSH 原生 `story` 路由加一条：作者要整理平台建书资料（发布资料、建书表单、平台书名/简介/标签）时进 `story-publish`，只说「开书」照常进 `story-long-write`；`/story` 的「更多」菜单列出发布资料，封面一项注明只要提示词也走 `story-cover`。
- `story-publish` 加 DSH 桥：只准备资料文件，即使当前 Preset 有浏览器工具，也不登录、不填写、不提交平台作者后台。`story-cover` 的桥补一句：Preset 里没有生图能力时，先提出上游的仅提示词模式，不改用付费 API。
- 默认宿主、开发宿主与打包冒烟改为 `0.2.1-rc.5`。它同时是 npm `latest` 与 `next`，[0.1.19](../process/2026-10-27-dsh-rc4-and-upstream-skills-release.md) 里 README 默认线与 npm `latest` 不一致的问题随之消失；README 不再单列 `0.2.1-rc.2`。`0.2.0-rc.2` 与试用的 `0.2.2-alpha.2` 仍在发布门禁里。
- Drama 演示 fixture 的文件没变，只把 `sources.json` 的来源提交改为 `d229795`。

## Alternatives considered

- 不给 `story-publish` 加桥，完全依赖上游的「不替作者登录后台、填表或发布」：上游文案已经写了这条，加桥像是重复。但上游面向的宿主大多没有内置浏览器，DSH 的 Preset 可能有，平台后台又是作者自己的账号，越界的后果比多一句提示重得多。
- 在小说工作台里给 `发布资料-*.md` 做专门的表单视图：作者看起来更直观，但上游说这份文件以后会被程序读来填表，格式还在 `格式版本：1`，只适配了番茄；现在做视图容易跟着上游格式反复改。文件树和 Markdown 预览已经能看。
- 继续在 README 里写 rc.2 也验证过：rc.2 不再是任何 npm 标签，范围本身仍接受它，单独写只会让安装说明变长。

## Consequences

收益：作者在 DSH 里可以整理番茄的建书资料，平台后台的操作边界写明了；封面在没有生图能力时仍能拿到提示词；默认宿主与 npm `latest` 重新一致。

代价：`story-publish` 只有确定性测试覆盖（目录、路由和桥文案），真实模型实测走的是审稿链路，没有跑一次发布资料的完整流程；平台规则（番茄标签、书名长度）随上游手工核验日期而定，后台改了要等上游更新。

## Verification

- DSH rc.4 → rc.5：插件 20 个 DSH peer 包中 19 个逐字节一致；`dsh-client-ui-chat` 只在思考正文 Slot 增加 `rawText`，插件不使用；`@deepseek-ai/dsh` 依赖集合不变。
- 四个 parity 通过：Oh Story 0.9.2（14 Skills、`agents_version` 38）、Drama 0.10.0（6 个 selftest）。`pnpm verify` 退出 0。
- 候选源码 `84294ff` 在干净克隆中 `pnpm verify:release` 退出 0，打包 Chrome 在 `0.2.1-rc.5`、`0.2.0-rc.2` 与 `0.2.2-alpha.2` 均 `"ok": true`。
- `pnpm test:dsh:real`：DSH `0.2.1-rc.5`、`deepseek-flash` 返回 `ok: true`，2 个必需 Role 均成功，项目摘要不变；凭据只在 0600 临时文件中，跑完即删；花费约 0.15 元。
