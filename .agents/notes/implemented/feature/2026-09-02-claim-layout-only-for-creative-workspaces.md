# Agent Note: 工作台只在存在创作项目的 workspace 接管会话布局，且可随时收起

Status: implemented

## Problem

DSH 是通用 Harness，但插件一旦安装，Browser 入口就无条件注入工作台，CSS 把会话滚动宿主改成三栏网格，官方 Chat 被压进 520px 右栏且无法关闭——写代码、普通问答、机器上每个 workspace 都如此（issue #29）。全局的 `Ctrl/Cmd+S` 与文件链接监听挂在 Session 上，非创作会话同样被劫持。

## Decision

- `packages/dsh-plugin/src/client/workbench-presence.ts`：`hasCreativeProject` 只在 workspace 含创作文件、workspace 游戏项目或视频项目时为真；随包的《金瓶梅》示例（`source === "example"`）never 计入。
- 无创作项目时插件在界面上完全不渲染，两个全局监听器只在工作台打开时绑定；workspace 请求仍跟随 Agent 变更，Agent 写出第一个创作文件（如 `/story-setup`）后同一会话内自动接管。
- 每个工作台标题栏有「收起创作工作台」，收起后只在会话列角落留一个启动器，位置来自 bridge 发布的几何而非视口。显式选择永远优先于自动判断（`resolveWorkbenchOpen`）。
- DSH Session Store 不持久化，所以该选择按 workspace 存在浏览器 `localStorage`（键 `oh-story.workbench.<cwd>`），同 workspace 的新会话与重启后都沿用；存储不可用时 try/catch 降级，Session 内仍保留选择。

来源：d8898c8 (#30)。

## Alternatives considered

- **无条件注入，用独立 profile 隔离**（3e1631d 文档化的安装方式）— 最强理由：不改代码，把插件装进专用 profile 就能让原版 `web` 干净。否：把负担推给用户，且同一 profile 内仍无法在创作与非创作会话之间切换；独立 profile 的安装说明仍保留，作为按需加载的补充。
- **把开关存进 DSH Session Store** — 最强理由：跟随官方生命周期，不碰浏览器存储。否：Store 不持久化，新会话与重启都会丢掉选择。

## Consequences

- **收益**：装了插件但无创作项目的 DSH 与不装插件的行为逐字一致，smoke 有专门断言（无项目 workspace、首个创作文件接管、收起后新会话沿用）。
- **代价与已知上限**：判定依赖 `/oh-story/workspace` 响应，首屏可能先见原生布局再切换；示例游戏不再自动打开工作台，首次使用必须先有创作文件（0.1.8 的首次引导由此而来）；`localStorage` 按浏览器各自保存，换机器不同步。若 DSH 日后持久化 Session Store，可重访存储位置。
