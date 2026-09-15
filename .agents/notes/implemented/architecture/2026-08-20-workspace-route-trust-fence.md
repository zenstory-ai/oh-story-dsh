# Agent Note: 工作区文件路由的信任围栏：浏览器围栏、Session 作用域与路径收容

Status: implemented

## Problem

插件在 DSH 现有 web server 上挂了 `/oh-story` 路由（读写创作文件、媒体预览、游戏与视频预览）。这是插件唯一新增的 HTTP 面：DNS rebinding、跨站请求、请求方自报工作目录、符号链接逃逸、并发覆盖都可能穿过它读写工作区；生成的游戏本身是不可信脚本，还会在 iframe 里自行导航。

## Decision

- 每个请求先过与 DSH 原生 `/api` 相同的围栏（`packages/dsh-plugin/src/workspace-request-trust.ts`）：Host 必须是 loopback 或 `trustedHosts` 声明的裸 `host[:port]`；`sec-fetch-site: cross-site` 拒绝；带 `Origin` 时必须与 Host 同源。`trustedHosts` 条目格式不合法时插件加载即抛错，never 静默放宽。
- 工作目录只来自 DSH `sessionId` 解析出的 Agent，never 来自请求；子 Session（`parentSession` 存在或 `origin === "subagent"`）没有编辑路由。
- 路径解析、收容、读写走该 Agent 的 DSH `FileSystem` 与 sandbox policy；读返回版本，写以 `replaceIfVersion` 为原子前置条件，过期写拒绝。可编辑范围限于文档化的创作项目目录与扩展名白名单；媒体预览只读。
- 游戏预览的每种响应都下发 CSP 并含 `sandbox` 指令；loopback 上用 `127.0.0.1`/`localhost` 互换做 iframe origin 隔离。
- 该路由是 [pure-dsh-plugin-ownership-boundary](2026-08-20-pure-dsh-plugin-ownership-boundary.md) 里插件唯一拥有的服务端面。

来源：a79710d、8736381、42ff167、02f48c1、e6b76f3 (#12)。

## Alternatives considered

- **只在单元测试里验证围栏 helper** — 最强理由：逻辑纯函数，测起来最便宜。否：8736381 指出把围栏从路由处理器里删掉 CI 仍然绿，于是 packaged smoke 用 `node:http` 直接驱动挂载的路由（`fetch` 会静默丢弃伪造 Host），先确认同源请求 200，再断言 rebound Host、cross-site 标记、外来 Origin、opaque Origin 各得 403。
- **插件自行做路径安全**（a79710d 的 `workspace-security.ts`：逐段 `lstat`、symlink 逐级 realpath 复核）— 最强理由：不依赖 DSH 文件系统 API，本地即可测。否：与 sandbox/remote provider 下 Agent 看到的工作区不一致；42ff167 改为复用 Agent FileSystem 与 sandbox policy 并删除该文件。
- **只对 HTML 响应下发 CSP** — 曾是现状。`.svg` 以 `image/svg+xml` 提供却是可执行文档，游戏可把 iframe 导航到带脚本的 SVG（sandbox 标志跨导航延续、CSP 不延续），再用 URL 里的 sessionId 读写工作区；e6b76f3 改为每种响应都下发。

## Consequences

- **收益**：SECURITY.md 能写出一段可核实的信任边界，且围栏在 packaged smoke 里有活体断言。
- **代价与已知上限**：非 loopback 部署必须显式配置 `trustedHosts`；子 Session 中的工作台没有编辑器；child-session、absolute-path、symlink 逃逸的负例在 packaged 层仍是待补契约（`docs/VALIDATION.md`）。新增任何路由前缀时 must 复用同一围栏与 Agent FileSystem，never 另起一套路径检查。
