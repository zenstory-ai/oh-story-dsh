# 作者记忆维护

[author-memory.md](author-memory.md) 的少见时刻补充：记一条、确认、替换、忘掉和优先级仍按那份协议，本文件只在下列情况读——作者说「整理作者记忆」，或回执 `warnings`／查询 `omitted_ids` 提示超编；写入因 `作者画像.md` 写满失败；书根就是工作区，或工具报 `state.book`、单书布局错误；要做存量迁移 `migrate`、多事件原子 `commit`、派生视图 `check`；冲突候选要落定；碰到升级前留下的旧条目。

作者记忆借鉴“原始证据 → 候选 → 已确认画像 → 变更记录”的记忆管道，但把决定权留给作者。

## 文件

```text
{工作区}/.story/作者记忆/          # 项目级 store：global / genre / workflow 条目，编号 AP
├── _author-memory-state.json  # 唯一结构化权威
├── 作者画像.md               # 仅 active，供作者查看与管理
├── 待确认.md                 # pending / conflict，不参与约束
└── 变更记录.md               # 最近 100 次、最新在前的事务记录
{书}/.story/作者记忆/            # 书级 store：只存这本书的 book 条目，编号 BP，同样四个文件
```

三个 Markdown 文件都从 state 确定性生成，禁止手改；完整历史保留在 state，变更记录只展示最近 100 次。`作者画像.md` 是人类管理视图，普通写作 agent 不整份注入，而是调用 `query` 取得本次相关的紧凑上下文。

## 任务映射表

各 skill 入口的 `query` 命令按此表选 kind；写入时的预算提醒也按这四类任务组合估算。

| 任务 | query kinds | 注入位置 |
|---|---|---|
| 正文初稿 / 续写 | `prose_style` + `story_design` | 主会话与实际正文 agent |
| 去 AI 味 / 改写 | `prose_style` | 主会话与实际改写 agent |
| 设定 / 大纲 | `story_design` + `workflow` + `interaction` | 主会话，不传正文 agent |
| 审稿 | `delivery` + `interaction` + 必要的 `prose_style` | 主会话，不降低 rubric |

审稿匹配项只用于交付格式、协作方式和“作者有意采用的表达选择”说明；问题严重度和 PASS/FAIL 仍由 rubric 决定。

## 注入预算与容量

- **写入不因注入预算失败**：`record` / `commit` 照常成功、给回执；工具按上表四类任务组合估算最坏查询情形（全局条目＋各 scope 维度最重的单一切片，切片按大小写无关归并、轻重按写作时真正读到的字段算，与真实查询同一把尺），装不进 2048 字节的组合在返回的 `warnings` 里点名将被略过的条目及其断言首句。
- 写入落盘后另一级 store 读不出来（书目录不存在、`--book` 与书级记录不符等）也照常给回执，`warnings` 注明本次提醒没算上它。写书级条目时「本书＋全局」按实际条目精确计算；写项目级条目时只看得到项目级 store，顺手传 `--book-root` 就把当前这本书也算进提醒。
- 查询按 **重要度 → 本书例外 → 最近更新** 排序装填（同一范围的条目必在同一 store，「最近」按该 store 的修订号比，不跨 store 比较），先丢的恒是重要度较低的条目——`importance` 决定超编时谁留在 prompt 里。装不下的条目跳过而不中断（一条长的不挡后面的短条），漏下的 ID 按同一优先级报进 `omitted_ids`（最多列 20 条，`omitted` 是真实总数）。
- 注入预算之外还有一道硬上限：`作者画像.md` 超过 12288 字节时写入会直接失败并要求先整理。active 条目攒到几十上百条才会碰到（远在注入预算之后），碰到就走「整理作者记忆」；`forget` 这类减量操作在满编时照常可用。

## 整理作者记忆

作者说「整理作者记忆」，或回执 `warnings`／查询 `omitted_ids` 提示超编、写入因画像写满失败时：读项目级与当前书的 `作者画像.md`（每条都标了范围、重要度、把握和确认次数，重要度就是超编时的去留依据），提出合并同义条（`replace` 多合一）、退役过时条（`forget`）、给错标成 `high` 的条目下调重要度、把超长断言压缩成一句话的提案；项目级画像里还有「本书：」条目时，「对该书运行 `migrate --book-root`」列为默认提案项。清单用原话逐条列给作者确认（编号只放括号里），确认后按 store 各汇成一份 `commit` 事务提交（一份事务只写一个 store）。合并时保住每条的否定词、限定词和适用范围——合不动就退役其中一条，不要靠删限定词把两条凑成一条。整理只由作者发起或确认，不自动执行。

## 冲突候选

冲突候选（`conflict`）不能绕过旧规则直接 `decide=activate`。作者选新说法：用 `replace`，`old_ids` 同时列旧 active 条目和这条冲突候选，新条目直接 active、两条旧的标 `superseded`；作者留旧规则：对候选 `decide=reject`。旧条目被 `replace` / `forget` 撤下后，它不再是任何候选的冲突对象，冲突对象清空的候选退回 `pending`。

## 单书布局

书根就是工作区（`--book-root` 与 `--workspace` 同一目录）时，书级 store 改住 `{工作区}/.story/作者记忆/书级/`，与项目级各自一份 state；首次建立的书名优先取项目级存量本书条目里唯一的书名，再取目录名。旧版曾把书级 state 写在项目级位置，此后项目级读写都报 `state.book`；带 `--book-root {工作区}` 运行任一命令（含 `query`）会先把它原样移进 `书级/`，不改内容。这个目录其实是某个工作区里的一本书时（上一层叫 `长篇/` 或 `短篇/`，或某个祖先有 `.active-book` 或项目级 state），工具直接报错、不动任何文件，按报错改传 `--workspace`。

## 存量迁移

不做双读：升级前写进项目级 store 的 book 条目不再参与查询与预算估算，也不再接受新的 book 写入；它们仍在 `作者画像.md` 里可见、可 `decide` / `forget`。对每本书运行一次 `migrate --book-root {书目录}` 即可整批搬回来：断言、证据、确认次数、重要度原样保留，换成 `BP` 编号，原 `AP` 条目标 `superseded` 并注明去向；与全局条目的冲突关系在迁移后不再成立，这类候选退回 `pending`。书级每个源条目一笔事务，重跑只补没做完的一半。「整理作者记忆」看到项目级画像里还有「本书：」条目时，把迁移列为默认提案项。

## 旧条目

- 升级前写下的长断言不受 120 字节新建上限约束：原样重申它会**强化**原条目（确认次数 +1），不会因超长被拒；只有真正新建条目才校验 120 字节。
- 存量 state 里推断类旧来源的条目照常可读、可确认、可退役；新写入仍只接受 `explicit_user`、`accepted_suggestion`、`manual`。

## 其他命令

先依次尝试 `python3`、`python`、`py -3` 找到 Python 3，再从当前 skill 根运行本地副本（`record` / `query` 见 author-memory.md）：

```text
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py init    --workspace {工作区} [--book-root {书目录}]
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py commit  --workspace {工作区} [--book-root {书目录}] --input {工作区}/.story/work/作者记忆-事务.json
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py migrate --workspace {工作区} --book-root {书目录}
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py check   --workspace {工作区} [--book-root {书目录}]
```

- `commit`：高级批量入口，只在需要把多个动作绑定成一次原子提交时用（如整理作者记忆）。顶层传 `schema_version`、唯一 `transaction_id`、当前 `expected_state_revision` 和含 1–32 项的 `operations`（每项与单事件的 `operation` 同形）。一份事务只写一个 store；先在内存完成 schema、引用、容量和所有视图校验，操作按数组顺序应用，任一步失败则整份事务零写入，最后原子替换 state。过期修订会在任何写入前失败。事务文件在成功前必须保留，成功后删除；显式记忆请求按 author-memory.md「回执怎么告诉作者」转告。
- `migrate`：把项目级 store 里某本书的存量 book 条目整批搬进 `--book-root` 的书级 store，幂等，中途失败直接重跑；返回 `migrated`（源→新编号），没有存量时为空。
- `check`：从 state 重建并逐字核验所有派生视图；传 `--book-root` 时两级一起核验。
- `init`：显式初始化 store；平常不需要，首次 `record` 会随事务创建。
