# Agent Note: 上游知识资产固定版本、manifest 哈希校验，平台差异只走 DSH 覆盖层

Status: implemented

## Problem

插件随包携带四套上游知识库（Oh Story、Drama Skills、NovelToGame、video-recap-skills）的 Skills、Roles、references 与 scripts。若允许在本仓库手改上游文件，下一次 `assets:sync` 整目录重建会静默抹掉修改，而设置上游目录后 `assets:check` 又会因不一致而红——09ff4a5 的 PR 初稿正是这样手改了三份 Drama Skill 与固定 fixture。上游还带平台部署脚本、dashboard 服务器、`__pycache__` 等不该进发布包的内容。

## Decision

- 每套资产有 `packages/knowledge/<set>/manifest.json`，记录上游仓库、commit、release 版本、agents_version、Skill/Role 清单与每个文件的 sha256。`pnpm assets:check`（四个 `scripts/check-*-parity.ts`，属于 `pnpm verify`）比对文件集与哈希、Skill 数量（13/11/7/6）、VERSION 与 agents_version；显式设置 `*_UPSTREAM_DIR` 时还比对上游 HEAD。
- 同步 commit must 连同 manifest 一起评审；never 手工修改固定资产后绕过哈希校验（CONTRIBUTING）。
- DSH 平台差异只在加载时前置下发：`skill-provider.ts` 的 `DSH_SKILL_OVERRIDES`、`DSH_DRAMA_OVERRIDES` 与 bridge 文本；上游 SKILL.md 逐字不动。
- 同步时排除平台胶水与工作区污染（`scripts/knowledge-assets.ts` 的 `platformGlue`、`isPortableSourceAsset`），parity 与 build 拒绝其回流。排除按文件精确列出，never 整目录排除。
- 上游破坏性版本的 PR must 说明旧项目迁移边界，并同批更新 bridge、demo fixture、原生浏览器测试与真实 provider fixture。

来源：a79710d、3d73368 (#9)、09ff4a5 (#17)、b211cf5 (#18)、88b7f7c (#36)。

## Alternatives considered

- **在本仓库直接维护上游文件的 DSH 分叉** — 最强理由：改起来最直接，不用等上游。否：09ff4a5 实证会被 sync 抹掉并让 parity 红，也失去"逐字上游"的可审计性；改由 `DSH_DRAMA_OVERRIDES` 在加载时下发。
- **运行时从上游仓库拉取** — 蓝图 ADR-005 曾权衡：普通作者需要一键安装，联网拉取带来版本漂移与网络失败；固定 release asset 加 hash 才能做 parity 与许可证审查。
- **整目录排除上游脚本** — 最强理由：规则短。否：b211cf5 记录整目录排除 `story/scripts/` 时把上游新增的 `author_memory_commit.py` 一并丢掉，而 `references/author-memory.md` 仍进包，形成悬空引用；排除范围收窄到 `dashboard-server.mjs` 本身。

## Consequences

- **收益**：任何人能从 manifest 定位到上游 commit；CHANGELOG 的同步条目写上游版本与提交。
- **代价与已知上限**：上游紧急修复不会自动到达已发布插件，必须走同步加 release；同步 PR 体积大（3503397 触及 101 个文件），评审重点在 manifest 与 bridge 差异。护栏要区分"我们的代码"与"逐字上游"：88b7f7c 之后 tarball 源码检查只拒 `package/src|tests/`，ESLint 忽略 `packages/knowledge/**`。上游若开始携带带 `src/` 的运行时资产，先看这两处护栏。
