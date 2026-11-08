# Agent Note: 同步 Oh Story、Drama Skills 与 NovelToGame

Status: implemented

## Problem

三个上游发布了新版本。小说排纲任务简报改用 `agent-references/` 相对路径，短剧对标拆解加入整集还原。DSH 的资料工具要求完整的随包路径，短剧工作台从工作区根目录读取 `剧集/`。

## Decision

- 从发布标签同步 Oh Story 0.10.3、Drama Skills 0.11.2 与 NovelToGame 0.7.1，短剧演示样例和校验清单取同一提交。
- 排纲助手用 `oh_story_bundled_reference` 将简报里的相对引用映射到随包资料。
- 短剧对标先登记用途与外传许可。使用当前 DSH 会话可用的音视频工具做还原。自有或已获授权的还原项目以独立工作区进入短剧画布。

## Alternatives considered

让短剧工作台识别嵌套剧集需要同时改画布、生产任务和媒体库。独立工作区沿用现有项目布局，也符合上游将还原保存在单独项目的约定。

## Consequences

已登记的对标素材需要补记允许用途与外部模型上传许可。DSH 中的书稿、设定、追踪和游戏项目沿用原路径。

## Verification

- `pnpm assets:check` 核对三个发布标签和短剧示例的逐文件哈希。
- 单测覆盖排纲资料路径、对标还原限制和新版适配器文档的必需变量。
