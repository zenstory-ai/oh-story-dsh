# Agent Note: 跨工作台切换保持用户导航与旧宿主草稿

Status: implemented

## Problem

四类工作台提交 PR 前的整体检查发现：为了保留播放器而持续挂载的隐藏游戏、视频工作台，在停留于文稿标签时仍会默认选文稿，从而把作者切回已离开的工作台。试玩笔记样式文件也未加入浏览器样式注入。旧宿主 DSH 0.2.0-rc.2 没有新宿主的安全草稿初始化接口，直接调用会产生浏览器异常。

## Decision

游戏默认选文稿仅在工作台可见时执行；视频隐藏时不挂载有默认选择副作用的文稿组件，保留工作区与播放器本体。共享缓冲区保留未保存改稿。试玩笔记样式通过现有内联样式机制打包与注入，不新增依赖。

Chat 上下文适配只检查公开的 `requestDraftInitialization` 能力；存在时继续使用 `whenDraftExists: keep` 事务，并按官方 `applied / preserved / blocked` 返回值判断：只有 applied 表示讨论内容已填入。preserved、blocked 或接口不存在时保留新上下文，聚焦同一段原生 Chat，不替换输入也不发送；工作台保留明确可见的讨论内容卡片，提供查看、复制和关闭。该分支不使用旧 `setDraft`，因为其整体替换会清除引用，且无法识别 detached optimistic drafts 与 attachment flights。

## Alternatives considered

- 隐藏时卸载整个工作台：会丢失 iframe 或播放器状态，只停止导航副作用即可。
- 用旧版 `setDraft` 或 DOM 填入上下文：不能保证保护已有输入、引用、附件与待提交内容。
- 仅吞掉缺失方法异常：会让作者误以为讨论上下文已带入，必须显式保留可复制内容。
- 收窄宿主兼容范围：现有旧版支持可以通过小范围公开能力适配保留。

## Consequences

旧版宿主、已有草稿或待提交状态下，作者可以复制保留的讨论内容到 Chat，已有输入保持原样；默认宿主的空草稿继续自动请求安全初始化。跨工作台往返保留改稿和媒体运行时。此修复延续短剧、游戏与视频现有设计决定，不新增会话或文稿数据库。

## Verification

- 官方 npm `@deepseek-ai/dsh-client-ui-conversation@0.2.0-rc.2` 的 `lib/types/client/contract/input.d.ts` 公开 `for(ctx)`、`setDraft`、`focus` 与状态读取；`lib/client.js` 的 `setDraft` 实现整体清空并重建编辑器。其未提供安全初始化接口。证据来源：[官方发布包](https://registry.npmjs.org/@deepseek-ai/dsh-client-ui-conversation/-/dsh-client-ui-conversation-0.2.0-rc.2.tgz)。
- `chat-context.test.ts` 覆盖新宿主 keep 事务与聚焦顺序、已有草稿、待提交状态与旧宿主均返回可见回退信号，禁止调用整体替换。
- 原生浏览器回归覆盖从游戏文稿依次进入小说、短剧、视频并返回保留草稿；从视频文稿依次进入小说、短剧、游戏并返回保留草稿，双帧后确认导航未被后台工作台抢占；检查试玩笔记实际呈现右侧抽屉；旧版 Chat 回退内容可见且原输入保留。

- 最终 `pnpm verify`、`pnpm test:contract`、`pnpm test:dsh` 与 `pnpm test:dsh:rc` 全部通过：34 个文件、245 项测试，7 项定向服务契约；官方 DSH 0.2.1-rc.5 与 0.2.0-rc.2 原生浏览器均返回 `ok: true`。具体四类路径与边界见 `docs/VALIDATION.md` 的 Unreleased 记录；未调用付费生成。
