# Agent Note: README 用真实产出说话，并回答读者问过的问题

Status: implemented

## Problem

#46 把 README 排成给人看的顺序，#47 统一了 masthead，但正文仍然全是**说明文字**：读者看到的是「每集维护五份 Markdown」「就地提示重复 ID、悬空引用」「六项检查」这类描述，看不到任何一份文件长什么样、工作台到底会报什么、随包游戏的 QA 记录写了什么。同组织的 oh-story-claudecode（#434）、drama-skills（#173）与 novel-to-game（#60）在 2026-09-18 都做了这一步，本仓库没有。另一方面，Issues 里读者问过的问题——token 消耗（#1）、任务区域与长答复被输入框遮挡（#3、#26）、装了插件后普通会话也被改成三栏（#29）——答案散在 CHANGELOG 和 issue 回复里，README 没有一处回答；三条「常见问题」和四条「没看到界面时」也是两处并列的排障。

## Decision

两份 README 在 #46/#47 的骨架上改四处，随后按维护者第二轮意见重排了章节顺序：masthead → 这是什么（一段话 + 能力目录表 + 版本行）→ 四个工作台（每个工作台各带自己的动图，小说不再只说「见顶部动图」；末尾三条共同规矩取代原「核心体验」列表）→ 安装（预构建包、视频依赖、媒体 API、独立 profile 全部折叠）→ 开始创作（四种入口各一条可复制请求）→ 看看它的输出 → 常见问题 → 延伸阅读 → 贡献 → 致谢 → ZenStory。首屏不再单放一张动图，「核心体验」「能力目录」「按需加载」三个独立章节并入上述位置。

1. **首屏动图下面一句话说清它是什么**：打包后的插件装进官方 DSH Web 的真实画面，取自原生集成测试（`pnpm test:dsh` 加 `OH_STORY_DEMO_FRAMES_DIR`）的录制；左边是随包示例工程的文件树，右边是 DSH 原生 Chat。查看动图帧后确认右侧 Chat 里是集成测试的提示词（`AGENT_WRITE_SMOKE`、`ROLE_PARENT_RESULT` 等），不是创作者对话，所以文案只说画面来源，不把它说成一次创作会话。**「这是什么」改成五条加粗要点**：DSH 管运行、插件管创作（无第二套运行时/数据库，来自 `docs/ARCHITECTURE.md`）；四个上游固定版本随包并逐文件记哈希；文件就是创作事实；花钱先确认、Key 只在环境变量；不占别的场景。版本行写 v0.1.9（2026-09-10）并指向升级 FAQ。导航锚点从「开始创作」改为「看看它的输出」，与同组织仓库一致。
2. **新增「看看它的输出」**四个短小节，每段摘自树内文件或一次对树内文件的真实检查，逐段给出处：
   - 小说：随包示例工程 `scripts/demo-fixtures/story/…/追踪/上下文.md` 的续写状态卡节选（七栏中取五栏，省略以「……」标出），并逐字引用 `packages/dsh-plugin/src/native-hooks.ts` 里细纲门禁拒绝写入时的原话；示例工程的来源写明是 `sources.json` 记录的 oh-story-claudecode `abe9663` 的 demo（作者自有作品，前 20 章导入）。
   - 短剧：SHOT-EP001-002 穿过剧本、视觉设定（连续性锁）、分镜（起点/终点/视觉依据/冻结关键帧）、视频提示词四份文档，来源是 `sources.json` 记录的 drama-skills `bc96c5e` 公开样例；随后说明「生产」视图的按钮只发预检请求、任务停在「等待确认」（`docs/ARCHITECTURE.md` 与源码字符串）。
   - 「文档写错了，「生产」视图会指出来」：用 `parseEpisodeProduction`（`packages/dsh-plugin/src/client/drama-production.ts`）对样例和一份故意改坏三处的副本各跑一次，三条 error 的文字、文件与行号逐字来自解析器输出（`unknown_source` 分镜.md:21、`unknown_motion_shot` 视频提示词.md:29、`duplicate_id` 图片提示词.md:3/:11）；同时写明未改动样例也会得到六条 `generated_visual_id` 提醒，不隐瞒。改坏的副本只在临时目录，探针脚本不入库。付费 Turn 无成果时的任务卡文案逐字取自源码。
   - 游戏：随包 `packages/knowledge/novel-to-game/examples/jin-ping-mei/qa/verification.json` 的 `status` / `completeRun` / `checks` 与四条限制项中的第二、三条，逐键原样引用，省略处以「……」标出，并写明原记录有四条。
   - 视频工作台没有树内真实产出（集成测试用的是 5 秒办公室片段的烟测项目），所以不写进这一节，视频段保持说明文字。
3. **「没看到界面时」并入「常见问题」**，从 3 条扩到 13 条，每条一个 `###` 标题便于站内锚点：新增「我在用 Claude Code / Codex 也该装吗」、「Token 消耗如何」（#1：插件不调模型，DSH 每条答复下显示用量；影响用量的三点——Skills 随 profile 每个 Session 加载、Role 是子 Agent 调用、Reference Gate 要读到末尾；本仓库没有公开统计）、「普通会话也变三栏」（#29 → 0.1.7）、「长答复被输入框遮住」（#3、#26 → 0.1.6/0.1.8，只给读者需要的版本，不复述四次修复史）、「Windows 能用吗」（CI 的可移植门在 macOS 与 Windows 跑、集成测试在 Linux 跑）、「升级到新版本后要做什么」（重跑安装命令换版本号；Skills/Roles 随包无需重新部署；0.1.5 与 0.1.7 两次短剧契约收紧）。原有三条与四条排障原样保留，只改成标题形式。
4. **中文 README 末尾补上「ZenStory AI 项目」表**（此前只有英文版有），新增「贡献与交流」段指向 Issues 与 CONTRIBUTING；「延伸阅读」补上架构说明与验证说明。README_EN 逐段同步，节选保留中文原文并在括号里给英文大意，顶部加 `Last synced` 注释。

## Alternatives considered

- **把首屏动图换成一段真实录屏**（oh-story #434 的做法）。最强理由：视频比动图更能在十秒内说明「装了会怎样」，而且现在动图右侧 Chat 里是测试提示词。被否：录屏需要一次付费真跑、剪辑与 user-attachments 托管，超出这次文档改动的范围；先把动图的来源写清楚，录屏留待下一次。
- **把改坏样例的探针脚本和输出放进仓库当测试**。最强理由：README 引用的报错以后能自动核对。被否：CONTRIBUTING 禁止「只断言文案存在」的测试，而 `drama-production.test.ts` 已经覆盖这三类诊断的文字；README 只需注明副本在临时目录。
- **为 token 消耗给一个数字**。最强理由：#1 问的就是数字。被否：仓库没有任何用量记录，集成测试用的是本地假 Provider（`prompt_tokens: 12`），真 Provider 测试也不落盘用量；编一个数字比不给更糟，所以只写影响用量的机制和 DSH 里在哪看。

## Consequences

- 收益：读者不用装就能看到状态卡、五份文档怎么互相引用、工作台会报什么、QA 记录承认了什么；Issues 里问过的五个问题在 README 有了带版本号的答案；两处排障合成一处；中英两份内容一致。
- 代价：README 中文 224→362 行、英文 239→372 行（第一版 431/435 行，维护者审阅后把「看看它的输出」压掉一半：每小节只留一段节选加一句话，删去解释段落、六条 warning 与付费 Turn 文案）；「看看它的输出」里的行号（分镜.md:21 等）和示例工程内容绑定，下次同步上游 demo 时要重跑探针核对；动图仍然是集成测试画面，右侧 Chat 的测试提示词还在。
- 未做：没有重录动图；视频工作台没有真实产出可展示；没有为 README 新增测试。

## Verification

- 探针：`pnpm exec tsx <scratch>/probe-production.mts` 对未改动样例输出 `shots=8 diagnostics=6`（全部 `generated_visual_id` warning），对改坏副本输出 `diagnostics=11`，其中三条 error 的 message / path / line 与 README 逐字一致。
- 细纲门禁原话与 `native-hooks.ts:102` 一致（章号按状态卡的下一章代入 21）；「等待确认」「DSH Turn 已结束，尚未发现关联成果……」与 `packages/dsh-plugin/src` 中的字符串一致。
- 状态卡、五份短剧文档、`verification.json` 的节选逐行对照来源文件；`sources.json` 的上游 commit 与 README 里两条 GitHub 链接一致。
- 两份 README 的本地链接与页内锚点逐个解析到存在的文件或标题；外部链接逐个请求。
- `grep` 核对 #46 列出的划界句式仍为空；`项目主页` / `Project page` 各只出现一次。
