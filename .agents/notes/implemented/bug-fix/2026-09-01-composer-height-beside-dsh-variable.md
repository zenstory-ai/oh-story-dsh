# Agent Note: Composer 座位高度发布为插件自有 CSS 变量，never 覆写 DSH 拥有的变量

Status: implemented

## Problem

工作台把 Composer 座位叠在 Chat 列上，Chat 尾部要为座位留白。DSH 0.1.2 把流式 Todo 面板并进 Composer 座位，但 `--dsh-composer-height` 仍只报输入框高度，尾部被遮。合并 #21 冲突时曾把插件实测的座位高度直接写进 `--dsh-composer-height`：这次写入落在一个同时改变 scrollHeight 的 ResizeObserver 回调里，与 DSH 自己的滚动处理互相触发，packaged E2E 掉到 2/5，三处无关断言失败。

## Decision

- `client/index.tsx` 实测座位高度后写入滚动容器上的 `--oh-story-composer-height`，卸载时移除；`client/plugin.css` 以 `max(var(--dsh-composer-height, 152px), var(--oh-story-composer-height, 0px))` 取较大值作为 `padding-bottom` 与 `scroll-padding-bottom`。
- 规则：DSH 拥有的 CSS 变量、锚点与滚动状态，插件只读不写；插件要影响布局，发布并列的自有变量，由 CSS 合成。
- 贴底状态只由用户自己的滚动（滚轮、触摸、拖动、非输入框按键）释放，布局引起的滚动不改它；Chat 正文纳入尺寸观察，窗口变化后的多帧重排（实测 4882→4018→3996→3974→3912）每次回落都重新贴底；正文 subtree 观察命中后短路，流式输出不逐 token 触发布局计算。

来源：b9427d8 (#22)、708d79f (#27)、a340c36 (#5)。

## Alternatives considered

- **覆写 `--dsh-composer-height`**（#21 合并时的做法）— 最强理由：只有一个变量，CSS 不用改。否：写 DSH 也在写的变量必然形成 resize 决斗；改回并列变量后 8/8 绿，对比 2/5 是实测。
- **在 ResizeObserver 回调里现算是否贴底**（708d79f 之前）— 最强理由：直觉最简单。否：回调运行时 Chat 已重排完，判定恒为"没贴底"，永不重新贴底。
- **永不释放贴底**（708d79f 验证断言时试过）— 最强理由：读者永远看得到尾部。否：读者主动上滚 600px 后再改窗口会被拽回底部（held 1554 → fromBottom 0），反向断言因此常驻。

## Consequences

- **收益**：E2E 常驻断言（1440x900、1000x900、1200x640、600x800 循环后尾部标记既不在座位下也不在视口外；反向断言读者离底 600px 后仍 ≥100px）在修复前必红。
- **代价与已知上限**：多一个变量与一份实测逻辑；DSH 改滚动几何时（0.1.2-rc.1 改为 500ms 采样加 `scrollend` 收尾）要重跑 `pnpm test:dsh` 确认 `data-composer-seat` 与 `data-chat-flow` 锚点仍在。若上游 `--dsh-composer-height` 开始报告完整座位高度，可删除自有变量，但 max() 合成在那之前不能拆。
