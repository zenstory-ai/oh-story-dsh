# Agent Note: DSH 0.2.1-rc.4 与三套上游 Skills 联合适配发布

Status: implemented

## Problem

0.1.18 发布后，每日 upstream-update 工作流开了五个 issue：`@deepseek-ai/dsh` 的 npm `next` 先后指向 `0.2.1-rc.3`、`0.2.1-rc.4`（`latest` 仍是 `0.2.1-rc.2`）；Oh Story 发布 0.9.1（`agents_version` 36 → 37），Drama Skills 发布 0.9.1 与 0.9.2，NovelToGame 发布 0.6.1。video-recap 仍是 0.6.2，没有新版本。

Drama 0.9.1 不再分发旧 JSON/JSONL 检查器（`asset_check.py`、`storyboard_check.py`、`review_check.py`、`image_prompt_check.py`、`container_check.py`、`motion_timing_check.py`、`music_spec_check.py`、`voice_sheet_check.py`）及其示例，没有脚本的五个 Skill 一并删掉了 `selftest.py`。`check-drama-parity.ts` 原来要求「每个 Skill 一个 selftest」，同步后必然失败。上游 creator-first 示例 EP001 的五份文档里有四份改了内容，演示 fixture 的来源哈希也对不上了。

## Decision

开发宿主与默认打包浏览器验证改用 `0.2.1-rc.4`，README、包 README 与发布文档的默认安装命令改为 `0.2.1-rc.4`。这改变了 [0.1.17 的做法](2026-10-19-dsh-rc2-oh-story-090-release.md)：默认线不再固定跟随 npm `latest`。`0.2.1-rc.2`（npm `latest`）本版做一次完整打包浏览器验证并写进 README；发布门禁仍是两条线，默认 `test:dsh` 与更早的 `test:dsh:rc`（`0.2.0-rc.2`）。`engines.dsh`、DSH peer 范围与 Cordis / Schemastery 版本不变。`pnpm-workspace.yaml` 的 overrides 与 `minimumReleaseAgeExclude` 跟着换成 rc.4，因为 rc.4 发布才一天，还没过 pnpm 的最短发布时长。

Oh Story 0.9.1、Drama 0.9.2 与 NovelToGame 0.6.1 都从发布标签的干净克隆同步，没有改同步排除规则。

- Drama parity 改成「凡是带 `scripts/*.py` 的 Skill 都必须带 `selftest.py` 并通过」，现在是六个。演示 fixture 从 `fdb7b7c` 的 `examples/creator-first/EP001` 重新复制，`sources.json` 更新提交与逐文件哈希；新 fixture 能通过随包的 `creator_markdown_check.py`。
- 技能桥做两处措辞调整。Oh Story 0.9.1 为 ZCode 写了「用 `Agent` 派发注册角色」，桥把 `Agent` 工具加入禁止启动 Role 的通道列表，Role 仍只走 `oh_story_role`。短剧桥原来写着「旧维护脚本和模板仍随包」，现在改为说明 0.9.1 起旧检查器不再随包，结构检查只用 `creator_markdown_check.py`。
- 客户端短剧解析只认 `## SHOT-`、`## MOTION-`、`## IMG-` 小节，所以上游新增的 `## 场景站位`、`## GROUP-` 小节不会被当成镜头。上游保留逐镜 `MOTION-`，`GROUP-` 只是附加条目，所以生产视图不为它新增展示。

## Alternatives considered

- 默认线保持 npm `latest` 的 `0.2.1-rc.2`，只把 rc.4 当额外验证线：这样跟 `npx @deepseek-ai/dsh` 不带版本时装到的宿主一致，也延续 0.1.17 的规则。但 README 的命令本来就固定版本号，用户装到的就是我们测过的那一版；rc.4 与 rc.2 同属 0.2.1 rc 序列且更新，插件依赖的包里只有 `dsh-client-ui-conversation` 有新增接口。本版的目标就是适配新宿主，再把旧 rc 写成默认没有意义。
- 发布门禁加第三条打包浏览器线（rc.2）：最稳，但 CI 的 packaged 作业要多跑一倍时间；rc.2 与 rc.4 在插件依赖面上只差新增接口，一次性验证就够了，之后 npm `latest` 前进到 rc.4 时这条线自然合并。
- Drama parity 直接删掉 selftest 数量检查：最省事，但上游以后再删某个有脚本的 Skill 的自测时就没人发现。按「有脚本就要有自测」检查，保留了原来的意图。

## Consequences

收益：默认装到 DSH 当前最新的预发布宿主，并带上 Oh Story 0.9.1（续写状态卡最多 20 个活跃角色）、Drama 0.9.2（`--partial` 局部核对、多镜容器分组、剪辑切点不再掉音）与 NovelToGame 0.6.1；包里少了 34 个已废弃的 Drama 文件。

代价：README 默认线与 npm `latest` 暂时不一致，要在说明里同时写 `next` 与 `latest`；rc.2 这条线只有本次的一次性浏览器验证，之后的版本若不再测，就不能继续宣称它受支持。Drama 的 `GROUP-` 分组在生产视图里还看不到，创作者只能在 Markdown 里看。

## Verification

- rc.2 → rc.4：插件声明为 peer 的 20 个 `@deepseek-ai/dsh-*` 包里 18 个逐字节一致；`dsh-api-session-controller` 只改了一行注释；`dsh-client-ui-conversation` 新增 View 标签 More 菜单与 pin、`ComposerSubmission.newSession`、`whenDraftExists` 草稿选项，插件只导入 `ToolCallBlock`、`IConversation`、`PartialAssistant`、`RunningToolCall`，这几个类型没有变化。`@deepseek-ai/dsh` 的依赖集合不变。
- `pnpm verify`（带三套上游目录）退出 0：四个 parity、198 个单元/契约测试与构建全部通过。
- 打包 Chrome 与最终 `pnpm verify:release` 结果见本次 PR。
