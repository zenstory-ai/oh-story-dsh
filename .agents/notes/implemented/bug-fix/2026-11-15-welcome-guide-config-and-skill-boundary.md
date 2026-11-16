# Agent Note: 空白会话欢迎引导改为可持久关闭的配置项并说明会话模式技能边界

Status: implemented

## Problem

此前只要安装并启用 `@oh-story/dsh`，浏览器端就会在每个不含创作文件的空白会话（以及无会话首页）无条件注入 `WelcomeGuide`，标题固定写「Oh Story 已加载」，并引导直接输入 `/story` 等技能命令（见 [欢迎卡提供内置游戏示例入口](../feature/2026-10-19-example-entry-and-video-runtime-check.md) 与 [DSH 0.2.2-rc.2 在对话滚动区外多包一层后，工作台照常挂载](./2026-11-12-dsh-0.2.2-rc2-conversation-wrapper.md)）。这在日常使用中造成三处问题（[#128](https://github.com/zenstory-ai/oh-story-dsh/issues/128)）：

1. DSH Web 的全局插件对所有工作区生效，日常编程、Creator 写插件等无关空白会话每次新建都会被整块欢迎卡挤占首屏，且没有任何关闭入口。
2. 欢迎卡与 README 把「插件已安装到当前 profile」等同于「当前会话已加载全部创作技能」。实际上，工作区已有创作文件时工作台不依赖会话模式即可打开，但从空目录运行 `/story`、`/short-drama`、`/novel-to-game quick`、`/video-recap` 需要当前会话所选 Agent Preset 挂载了 `@deepseek-ai/dsh-tool-skill`（如 `Standard`、`PTC`）；`Minimal` 等未挂载技能工具或隔离了 `skills` 服务的模式并不会加载本插件技能。
3. 核查 DSH `0.2.0-rc.2` 至 `0.2.2-rc.1` 的公开扩展面后，插件自身并不定义专属 Preset，而客户端公开 RPC `skills/list`（`SessionSkillCatalog.list`）会直接回退读取宿主 `ctx.get('skills')`，不检查当前会话的 `tools.get('skill', live)` 是否存在——即便切到 `Minimal` 模式，`skills/list` 仍原样返回 33 个插件技能，无法作为「当前会话实际加载了技能」的可靠信号。

## Decision

- 采用持久生效的欢迎屏配置开关方案，修改旧笔记中「新的空白会话照常显示欢迎卡」的无条件行为：在宿主 `Config` 上声明 `welcomeGuide: z.boolean().default(true).volatile()`，通过 `settings.configure({ auto: false })` 关闭通用自动表单，并在 `/oh-story/workspace` 与新增无会话轻接口 `/oh-story/config` 中同步返回实时 `welcomeGuide` 值。
- 浏览器端通过可选注入 `configForms.get("oh-story")` 读写当前 profile 的 `cordis.patch.yml`，同时在 `plugins.bundle.config`（key `@oh-story/dsh`）注册「空白会话欢迎引导」开关，并在 `WelcomeGuide` 标题栏提供一键「关闭欢迎引导」按钮。
- 加载阶段（`formStatus === "loading"` 或尚未拿到宿主初始配置）先不渲染欢迎卡，避免已关闭欢迎屏的用户在刷新页面时闪出卡片；当宿主设置不可写或未启用 `ui-settings`（无 profile 的 `--config` 启动等）时，若宿主静态配置未强制设为 `false`，回退到浏览器 `localStorage`（`oh-story.welcome-guide`）保存开关选择。
- 欢迎卡标题改为「Oh Story 创作工作台」，正文与 README、英文 README、插件包 README 明确区分两件事：打开已有作品工作区会自动展开工作台（不依赖会话模式）；从空白会话调用创作技能新建作品则需要所选会话模式启用技能加载（如 `Standard`、`PTC`，`Minimal` 模式不加载插件技能）。关闭欢迎引导不影响任何已有会话或含创作文件工作区的工作台自动展开。

## Alternatives considered

- 按会话所选 Preset / 模式自动约束欢迎屏：插件没有专属「Oh Story 模式」，DSH 默认的 `Standard`、`PTC`、`cordis` 均继承宿主 `SkillRegistry`；即便排除 `Minimal`，用户在默认 `Standard` 模式下新开任何日常编程空白会话依然每次强制弹出欢迎屏，无法解决首屏打扰。同时公开 `skills/list` 在 `Minimal` 下也会误报技能存在，而读取 DOM 模式名或引入未列入 `peerDependencies` 的内部 Preset 服务既脆弱又越界。
- 同时叠加模式过滤与关闭开关：由于客户端公开接口不能诚实区分 `Minimal` 与 `Standard` 的技能工具挂载状态，叠加不准确的模式判断反而会制造新的误导，单一且持久可操作的配置开关更干净。
- 只存浏览器 `localStorage`、不接入 DSH `configForms`：实现更短，但换端口、换浏览器或在 `cordis.patch.yml` 中声明配置时无法与 DSH 原生插件设置页互通。以 `configForms` 为主、无 profile 宿主回退 `localStorage`，两边都能持久生效。

## Consequences

收益：用户可在首次看到欢迎卡时一键永久关闭，也可随时在左侧「插件 → `@oh-story/dsh`」或 `cordis.patch.yml` 的 `welcomeGuide` 中开关；刷新页面不闪屏，含创作文件的工作区与收起/展开记忆不受影响；文案不再把「插件已安装」误导成「任意模式下技能均已生效」。

代价：插件新增了一个轻量 `/oh-story/config` GET 分支（供无会话首页与无 `configForms` 宿主回退读取）以及 `plugins.bundle.config` 插槽组件；当用户确实选了 `Minimal` 模式且尚未关闭欢迎引导时，仍由欢迎卡文字说明模式边界，而非自动按模式隐藏。

## Verification

- `packages/dsh-plugin/tests/workbench-presence.test.ts` 与 `packages/dsh-plugin/tests/welcome-guide.contract.test.tsx`：覆盖 `Config` 默认值与 volatile 读取、`/oh-story/config` 实时响应、加载态防闪烁、可写 `ConfigForm` 持久读写、只读宿主 `welcomeGuide: false` 锁定、无 profile 宿主 `localStorage` 回退、`WelcomeGuide` 模式边界文案与已有作品工作区不受影响。
- `scripts/native-dsh-smoke.ts`（`pnpm test:dsh` 在 `0.2.2-rc.1`、`pnpm test:dsh:rc` 在 `0.2.0-rc.2`）：真实 Chrome 验证首次启动展示新文案与「关闭欢迎引导」按钮且 500px 窄屏不溢出；点击关闭后 `profiles/web/cordis.patch.yml` 写入 `welcomeGuide: false`，刷新页面空白会话不再弹出欢迎屏，切换到已有小说工作区仍正常显示创作工作台；再从「插件 → `@oh-story/dsh`」打开开关后配置文件更新、空白会话恢复引导并在首轮对话开始后自动收起。
