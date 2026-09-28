# Agent Note: 写正文守卫跟随上游，把空壳细纲当作没有细纲

Status: implemented

## Problem

DSH 的写正文守卫（`packages/dsh-plugin/src/native-hooks.ts` 的 `validateStoryMutation`）自 0.1.10 起镜像上游 Oh Story `proseBlockReason` 的细纲门禁：长篇书（有 `大纲/` 或 `追踪/`）新建 `正文/第N章*.md` 前必须有 `大纲/细纲_第N章*.md`。Oh Story 0.8.1 把门禁收紧为「细纲是空壳也拦」（`story_hook_core.js` 的 `outlineIsEmpty`）。DSH 侧只看文件名，模型先落一个只有标题的细纲就能绕过，而上游 CLI 下同样的写入会被拦；覆盖层与注释却仍自称「mirrors the outline gate」。

## Decision

- `validateStoryMutation` 找到本章细纲后逐份读取（`StoryFileSystem` 多了可选的 `readBytes`，一次最多读 64 KiB）：去掉 BOM 与每行行首的 `#`，再去掉空白（含全角空格 `　`），剩余不到 30 字（`OUTLINE_MIN_CHARS`，与上游同值）即为空壳。同章多份细纲时任一份有内容就放行；读不出或不是合法 UTF-8 的按「已写」放行；FileSystem 不提供 `readBytes` 时也按「已写」放行。以上都与上游 `outlineIsEmpty` 的判定一致。
- 全部为空壳时拒绝，提示沿用上游措辞：`细纲 大纲/细纲_第002章.md 是空的（不计 # 号和空白不到 30 字）。先按 story-long-write 单章流程把细纲写完整（这章发生什么、主角做什么选择），再写正文。`；完全没有细纲时仍是原来的「未找到对应的…」提示。
- 读取走调用方 Agent 的 FileSystem，与判断目录、Tracking 状态用的是同一个执行世界。导入窗口、改写已有章节不受细纲约束等既有放行条件不变。
- 测试：`packages/dsh-plugin/tests/native-hooks.test.ts` 覆盖空壳拦截（BOM、`#`、全角空格都不计数）、同章另一份有内容时放行、非 UTF-8 细纲放行；其余用例的细纲 fixture 改为有实际内容的文本。

来源：本次与 Oh Story 0.8.4 同步的提交（CHANGELOG 0.1.11）。

## Alternatives considered

- **只看文件名，把「mirrors」的说法改成「部分镜像」** — 最强理由：守卫只需 `stat` / `listDir`，不读文件内容，也不多一次 I/O。否：上游把空壳细纲视为真实写作风险（模型先写标题占位再直接写正文），DSH 用户跑的是同一套 Skill，只在 DSH 里放行等于让同一本书在不同宿主下遵守不同规则。

## Consequences

- **收益**：同一本书在 DSH 与上游 CLI 下被同一条细纲规则约束；Oh Story 覆盖层与注释里「mirrors the outline gate」的说法重新属实。
- **代价与已知上限**：每次新建章节多读一次细纲；超过 64 KiB 的细纲被截断后若恰好截在多字节字符中间，会解码失败而按「已写」放行，属于有意的放行方向。上游之后若改阈值或判定口径，要同步 `OUTLINE_MIN_CHARS` 与 `outlineIsEmpty`；守卫仍不镜像上游的 Tracking 检查点、上一章欠账与短篇 `小节大纲.md` 门禁（见 `validateStoryMutation` 的注释）。
