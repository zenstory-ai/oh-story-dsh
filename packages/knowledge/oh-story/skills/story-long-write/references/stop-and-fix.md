# 写正文前缺东西：停下修

workflow-chapter 或 workflow-daily 发现缺文件、追踪对不上时读。本轮不写正文，修好再从 workflow-chapter 步骤 1 开始；告诉作者时用 workflow-chapter「写不下去、要停下时」的问法。

- **追踪检查不过**：按 `tracking_commit.py check` 的提示修。
- **已有正文却缺 `_tracking-state.json`**：停止写作，请作者走 `/story-import`「旧追踪项目迁移」。（新书还没有正文时不算缺，按 workflow-chapter 开头初始化。）
- **派生视图与 state 不一致**：按 [tracking-transaction.md](tracking-transaction.md) 为该章提交 `mode=revision` 事务整份重建，不手改、不继续下一章。
- **登记了对标却缺情绪模块／节奏**：请作者用 `/story-long-analyze` 补拆。作者定了不对标不算缺。
- **要找某类文件放哪**：读 [project-files.md](project-files.md) 照做。
