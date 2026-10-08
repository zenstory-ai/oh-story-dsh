# Agent Note: 上游 Skills 与 DeepSeek Harness 出新版时自动开 issue

Status: implemented

## Problem

插件固定四套上游 Skills（manifest 记录仓库与 commit）和一条 DSH 兼容线（peer 范围与 devDependencies），上游发版后没有任何信号到达本仓库，只能靠人记得去看。2026-10-08 实际情况：video-recap-skills 0.6.2 于 10-04 发布，本仓库仍停在 0.6.1，四天没人发现。上游紧急修复因此拖到下一次有人想起来同步。

## Decision

- `.github/workflows/upstream-updates.yml` 每天 01:17 UTC 运行，也可手动触发（`dry_run` 只打印）。权限只有 `contents: read` 与 `issues: write`，不需要额外 secret。
- `scripts/upstream-updates.mjs`（只用 Node 内置模块，不装依赖）：
  - Skills：读 `packages/knowledge/<set>/manifest.json` 的仓库与 commit，取上游 `releases/latest`，用 compare API 判断最新 release tag 是否含有固定 commit 没有的提交（`ahead` / `diverged` 才算更新）。按 commit 而不是版本号比较，因为 Drama 的 manifest 没有 `releaseVersion`，从 main 同步的固定点也能正确判断。
  - DSH：读 npm `@deepseek-ai/dsh` 的全部 dist-tags；指向的版本不在 `@deepseek-ai/dsh-agent` peer 范围里点名的版本（去掉 `-0` 上界）或 devDependencies 里，就算更新。
- 每个「依赖@版本」一个 issue，标签 `upstream-update`（不存在时自动创建），正文末尾带 `<!-- upstream-update:<key>@<version> -->` 标记。去重看全部状态的 issue：关闭即表示维护者已决定，不再提醒。Skills 出了更新的版本时，旧版本的打开 issue 留言后以 not planned 关闭；DSH 不这样做，因为 `latest` 与 `alpha` 是并行线，不是先后关系。
- issue 正文带同步清单，内容取自 `2026-08-20-pinned-upstream-assets-manifest-review.md` 与 `2026-09-28-dsh-0.2.0-rc.1-compat-line.md` 的既有流程。本地 `pnpm upstream:updates` 是 dry-run；`pnpm test:upstream-updates` 并入 `pnpm verify`。

## Alternatives considered

- **Dependabot / Renovate** — 最强理由：现成、免维护，还能直接开 PR。不用：四套 Skills 不是包依赖，而是按 manifest 哈希固定的 vendored 目录，这两者都看不到；DSH 的 20 多个 `@deepseek-ai/dsh-*` 包要和 overrides、`minimumReleaseAgeExclude`、原生测试的 `dshVersion` 一起改，自动 bump 只改一处，必然过不了 parity 和原生测试。
- **自动开同步 PR 而不是 issue** — 最强理由：省掉手工跑 `assets:sync`。不用：既有决定要求同步 PR 连同 manifest 一起评审，破坏性版本还要同批改技能桥、fixture 与迁移说明，这些需要读上游 CHANGELOG 判断；机器开的 PR 只是一份必然要重写的半成品。
- **一个依赖一个长期 issue，原地改标题** — 最强理由：issue 数量少。不用：维护者关闭一个版本表示「不跟」时，原地更新会把这个决定连同历史一起覆盖掉，下一个版本也就不会再提醒。

## Consequences

- **收益**：上游发版后最多一天出现带链接与清单的 issue；关闭即静默，不会每天骚扰。
- **代价**：只看 GitHub「latest release」，上游不发 release 只推 main 的修复不会提醒；预发布（prerelease）也不提醒。DSH 若新增一个 dist-tag（比如 `canary`），每个新版本都会开 issue，届时要关掉或在脚本里排除。依赖 GitHub 与 npm 的公开 API，任一失败时这次运行失败、等第二天重跑；中途失败已开出的 issue 会被下一次运行的标记去重认出，不会重复。
