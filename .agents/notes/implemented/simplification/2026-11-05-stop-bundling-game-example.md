# Agent Note: 不再随插件分发游戏示例

Status: implemented

## Problem

插件此前随包分发 NovelToGame 的《金瓶梅 · 风月总账》可玩构建：manifest 记录 `examples: ["jin-ping-mei"]`，同步脚本复制 `examples/jin-ping-mei/`（去掉原著和创作材料后约 18 MB），服务端单独提供 `/oh-story/game-preview/example/...` 预览路由，欢迎卡和「游戏项目」下拉都有「内置示例」入口（见 [欢迎卡提供内置游戏示例入口](../feature/2026-10-19-example-entry-and-video-runtime-check.md)）。

NovelToGame 0.7.0 把这个示例改成互动影游，加入 58 段配音过场和新配乐，可玩构建涨到 97 MB，其中 63 MB 是 96 个 MP4。照旧同步的话，每个安装插件的人都要下载约 100 MB 的 tarball，而大多数人从不打开这个 18+ 示例。上游 Skills 本身不读任何示例。

## Decision

插件不再分发任何上游游戏示例（维护者 2026-11-05 决定）。

- NovelToGame 同步只复制 `skills/` 和 README、LICENSE、VERSION；manifest 去掉 `examples` 字段。parity 检查要求 manifest 里没有 `examples/` 路径，打包冒烟要求 tarball 里没有 `lib/novel-to-game/examples/`。
- 服务端删掉示例预览路由和示例项目条目；`/oh-story/workspace` 只返回工作区里的 `game-adaptations/*` 项目，`GameProjectSummary` 去掉 `source` 字段，只用于示例的 `PINNED` 校验绑定一并删除。
- 欢迎卡去掉「先玩内置示例」，游戏工作台的空状态和「游戏项目」下拉去掉「内置示例」；没有游戏项目的工作区直接进入新游戏讨论。不改为链接上游在线试玩站。
- 游戏技能桥去掉「随包《金瓶梅》只是只读示例」一句。
- 打包冒烟原来用示例跑的项目切换隔离、存读档、试玩/文稿切换保持 iframe、全屏、500 px 窄屏和小说/游戏切换，改用测试专用的第二个工作区游戏 `smoke-game-alt`：它的构建用 `localStorage` 实现快存、快读，验证沙箱预览里的存档照常可用。视频空状态的环境检查从首次启动流程移到普通工作区流程，因为没有示例后首次启动页没有打开工作台的入口。

## Alternatives considered

- 同步 0.7.0 但去掉过场视频：保留零 API Key 的试玩入口，tarball 约 37 MB；上游 QA 也要求游戏在没有视频时照常可玩（显示过场静帧并缓慢平移）。但展示的恰好是 0.7.0 主打的互动影游，去掉视频后示例不能代表上游能力，仍然多带十几 MB。
- 去掉示例、欢迎卡改为链接上游在线试玩站（西游记全年龄、金瓶梅 18+）：保留「先玩再决定」的入口，不占包体。维护者选择不放外链，插件只呈现作者自己的作品。
- 整包同步、照常分发：新用户能直接看到配音过场，但每次安装多下载约 80 MB，对不做游戏的作者没有价值。
- NovelToGame 停在 0.6.1：本版最省事，但游戏作者拿不到 0.7.0 的互动影游与制作经验，问题只是推迟。

## Consequences

收益：tarball 里 NovelToGame 部分从约 18 MB 降到约 240 KB；默认安装不再带 18+ 内容；服务端少一条预览路由和一种项目来源，前端少一类分支。

代价：新用户没有不用 API Key 就能试玩的入口，要先让 Agent 做出自己的游戏才能看到游戏工作台的试玩效果；0.1.18 审计 #13 修的那条路径不再存在。README 不再展示随包 QA 记录，改为指向上游标签里的示例记录。打包冒烟不再覆盖真实 ADV 的年龄门禁和成人资源延迟加载，这些本来就是上游示例自己的行为。

## Verification

- `pnpm assets:sync:game` 后 NovelToGame 目录约 244 KB，parity 报告 `no bundled examples`。
- 单元测试改为不再构造 `source` 字段的游戏项目，覆盖只有构建的项目在画布上显示为一张试玩卡。
- 候选源码 `672629a` 的打包 tarball 为 2.8 MB（0.1.22 约 21.6 MB）；干净克隆 `pnpm verify:release` 退出 0，打包 Chrome 在 `0.2.1-rc.5`、`0.2.0-rc.2` 与 `0.2.2-rc.1` 均 `"ok": true`，`gameSaveRestore: true`。
