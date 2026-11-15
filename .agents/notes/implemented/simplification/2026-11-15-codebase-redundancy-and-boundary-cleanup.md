# Agent Note: 清理跨模块重复实现、死代码与失配边界检查

Status: implemented

## Problem

随着四个创作工作台、资产同步脚本与原生 DSH 冒烟测试逐版演进，仓库积累了三类技术债：

- **死代码与残留文件**：`packages/dsh-plugin/src/game-verification.ts`（及其单测）在游戏工作台移除独立 QA 状态机后已无任何生产调用方；`.github/workflows/recover-v0.1.13.yml` 是一次性历史补发工作流；构建与同步脚本在过滤掉上游 `dashboard` 文件后仍先 `mkdir` 了空的 `assets/dashboard`、`scripts/dashboard` 目录。
- **跨文件重复实现**：创作路径归一化与目录前缀判定散落在 `native-hooks.ts`、`workspace-route.ts`、`file-activity.ts`、`drama-production.ts` 等多处；随包知识根目录解析在 `index.ts`、`skill-provider.ts`、`role-provider.ts`、`drama-adapters.ts` 中各自拼装；短剧画布与游戏/视频画布维护了两套几乎相同的平移缩放交互代码与两份近似的工具卡样式；四个资产同步脚本与三个原生 DSH 测试脚本也各自复制了遍历哈希、JSON 格式化和临时目录启动逻辑。
- **空转或漏扫的门禁断言**：`scripts/check-dsh-boundary.ts` 原先只扫根目录单层 `scripts/*.ts`，漏扫子目录及 `.mjs` 脚本；`scripts/native-dsh-smoke.ts` 中针对游戏预览 CSP 拦截内联脚本的检查因 `script-src 'self'` 根本未执行内联赋值而恒为 `undefined !== true`，属于永真断言；若干路由与前端组件还残留对同构静态类型做二次运行时 `typeof` 兜底的防御分支。

## Decision

- 删除无调用方的 `packages/dsh-plugin/src/game-verification.ts`、`packages/dsh-plugin/tests/game-verification.test.ts` 与一次性工作流 `.github/workflows/recover-v0.1.13.yml`，并同步更新 `docs/ARCHITECTURE.md` 中关于游戏 QA 不设宿主侧状态机的描述。
- 提取单一职责共享模块，消除重复实现：
  - `packages/dsh-plugin/src/creative-paths.ts` 统一工作区相对路径归一化、小说/短剧/游戏/视频路径归属与安全文件名判定；
  - `packages/dsh-plugin/src/bundled-paths.ts` 统一随包知识库与静态资源路径解析；
  - `packages/dsh-plugin/src/client/use-infinite-canvas.ts` 与 `packages/dsh-plugin/src/client/tool-card.css` 统一无限画布平移缩放指针交互与工具调用卡片样式；
  - `scripts/asset-sync-utils.ts` 与 `scripts/native-dsh-helpers.ts` 统一四个上游资产同步脚本与原生 DSH 集成脚本的公共辅助函数。
- 保留所有跨越信任、进程或宿主版本边界的必要防御：子代理启动参数双写（`role-tool.ts`）、请求头与沙箱路径校验（`workspace-request-trust.ts`、`workspace-route.ts`）、游戏独立 loopback origin 与 CSP、CAS 版本原子写（`replaceIfVersion`）及长篇细纲与提取器写围栏（`native-hooks.ts`）；仅移除已被 TypeScript 类型与上游解析保证覆盖的冗余分支及无意义的空 `catch`。
- 修复门禁与打包细节：`scripts/check-dsh-boundary.ts` 递归扫描 `packages/`（排除 `@oh-story/dsh` 自身）与 `scripts/` 下全部代码文件；`scripts/native-dsh-smoke.ts` 注入真实内联脚本并捕获 `securitypolicyviolation` 事件以非空转方式验证游戏预览 CSP；`drama-assets.ts`、`video-recap-assets.ts` 与 `build-dsh-plugin.ts` 按最终保留文件创建父目录，不再生成空的 `dashboard` 目录。

## Alternatives considered

- 保留 `game-verification.ts` 供日后恢复宿主侧 QA 徽标：违反游戏工作台不设独立 QA UI 的既有边界（见 [游戏区设计笔记](../feature/2026-11-04-game-playable-workspace-design.md)），未引用的模块只会继续腐化。
- 把四个资产同步脚本合并成单个大脚本：四个上游仓库的目录结构、排除名单和元数据校验各不相同，硬合成一个参数化入口反而增加分支复杂度；只抽公共文件遍历、哈希和写入工具更清晰。
- 一并删除 `role-tool.ts` 旧版 `request` 字段或旧版 DSH 选择器回退：`0.2.0-rc.2` 与 `0.2.1-rc.5` 仍在插件声明的兼容范围内，属于真实跨版本边界而非过度防御。

## Consequences

收益：路径规则、画布交互与同步辅助函数各留唯一真源；打包产物不再夹带空目录；DSH 依赖边界检查覆盖全部 72 个非插件脚本文件，游戏预览 CSP 在真实浏览器冒烟测试中得到正向拦截验证。

代价：新增 6 个小型共享模块，阅读单个调用点时需多跳转一层导入。

## Verification

- `pnpm verify` 通过：ESLint 零警告、TypeScript 类型检查、四个上游资产 parity、DSH 边界检查（扫描 72 个非插件文件）、15 项发布门禁测试、3 项上游更新脚本测试、34 个测试文件共 251 项单测与构建全部通过。
- 打包后原生 DSH Web 冒烟测试在默认线 `0.2.2-rc.1`、旧兼容线 `0.2.0-rc.2` 与试用线 `0.2.2-rc.3` 上均返回 `"ok": true`。
