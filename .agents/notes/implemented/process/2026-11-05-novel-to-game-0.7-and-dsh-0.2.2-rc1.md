# Agent Note: NovelToGame 0.7.0 与 DSH 0.2.2-rc.1 适配

Status: implemented

## Problem

0.1.22 发布后，npm 上 `@deepseek-ai/dsh` 的 `next` 指向 `0.2.2-rc.1`（issue #105），`latest` 仍是 `0.2.1-rc.5`。rc.1 改用稳定版 Cordis `4.1.0`、Schemastery `3.19.0`，要求 Node.js 24.9+。同日 NovelToGame 发布 0.7.0：互动影游成为支持的形态，`game-world-design`、`game-concept`、`game-art-direction`、`game-build`、`game-qa` 都加了过场相关的做法，《金瓶梅》示例改成 97 MB 的互动影游。Oh Story、Drama Skills 与 video-recap 没有新版本。

## Decision

- NovelToGame 同步到 0.7.0（`b06f4b3`），7 个 Skill 照旧随包；示例不再分发，见 [不再随插件分发游戏示例](../simplification/2026-11-05-stop-bundling-game-example.md)。上游 Skills 不引用示例目录。游戏技能桥的白盒试玩说明在 0.7.0 的 `pipeline-contract.md` 里依然成立。
- 默认宿主与开发宿主仍是 npm `latest` 的 `0.2.1-rc.5`。0.2.2 试用线从 `0.2.2-alpha.3` 换成 `0.2.2-rc.1`：发布门禁脚本 `test:dsh:alpha` 改名为 `test:dsh:next`，在 rc.1 上跑打包 Chrome 冒烟，仍只在本地 `verify:release` 里跑。兼容范围 `>=0.2.2-alpha.2 <0.2.3-0` 已经覆盖 rc.1；Cordis `^4.0.4`、Schemastery `^3.18.4` peer 已经覆盖 4.1.0 / 3.19.0，都不用改。延续 [0.2.2 试用线](2026-10-29-dsh-0.2.2-alpha-trial-line.md)的做法。

## Alternatives considered

- 默认线跟着 npm `next` 换成 `0.2.2-rc.1`：[0.1.19](2026-10-27-dsh-rc4-and-upstream-skills-release.md) 就是这样把默认线换到 `next` 的 rc.4，照做最一致。但那次 rc.4 与 rc.2 同属 0.2.1，插件依赖的包几乎没变；这次是新的小版本，插件依赖的包大多换了接口，还要求更高的 Node.js。npm `latest` 还没前进，默认安装命令立刻跟上会让一部分用户因 Node 版本装不上。等 rc.1 成为 `latest` 再换默认线。
- 保留 `test:dsh:alpha` 继续测 alpha.3：npm `alpha` 仍指向 alpha.3。但 0.2.2 已经有 rc，测 rc 比测 alpha 更接近用户会装的版本；同时测两条只会再多一轮打包 Chrome。

## Consequences

收益：游戏作者拿到 0.7.0 的互动影游与过场制作经验；0.2.2 线的验证对准了 release candidate。

代价：README 的默认安装仍是 0.2.1，想用 0.2.2 的人要自己换版本号；0.2.2 alpha 不再单独验证，只靠兼容范围覆盖。

## Verification

- 临时副本把依赖切到 `0.2.2-rc.1`、Cordis `4.1.0`、Schemastery `3.19.0` 与配套 Cordis 插件 `1.1.0`：typecheck、250 个单元测试、7 个真实 Cordis 契约测试、boundary 与构建全部通过。
- 打包 Chrome 与真实 provider 结果见本次 PR。
