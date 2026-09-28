# 作者记忆协议

作者记忆保存跨会话复用的创作偏好，不保存小说世界里的事实，决定权留给作者。本文件管最常见的时刻：作者说出一条偏好，或要确认、替换、忘掉某条。少见情况读 [author-memory-maintenance.md](author-memory-maintenance.md)：整理作者记忆与超编、画像写满、单书布局与 `state.book` 报错、存量迁移、多事件 `commit`、`check`、冲突候选落定、升级前的旧条目。

## 边界与优先级

加载优先级从高到低：

1. 安全、用户授权范围、明确的平台交付要求、字数与文件协议；句长、视角、修辞和标点偏好不属于不可覆盖的硬门禁；
2. 用户在当前请求中的明确要求；
3. 当前书的 `设定/文风.md`、题材定位、细纲和其他项目设定；
4. 作者记忆中的本书偏好；
5. 作者记忆中的题材、流程和全局偏好；
6. 对标素材、通用方法和默认值。

按表达维度取最窄适用要求：低优先级只补缺项，不与高优先级要求并列执行。通用 references 自称“必须/禁用”不改变此顺序；审稿不因作者有意采用的表达本身扣分，真实可读性与因果问题仍照常评价。

作者记忆不能把本书事实写进 `.story/作者记忆/`，不能覆盖当前请求，不能降低审稿 rubric，也不能让去 AI 味改动剧情意图。小说事实继续由各书的 `追踪/` 和 `设定/` 管理。

## 存放与路由

两级 store，记忆随书走：`{工作区}/.story/作者记忆/` 存 global / genre / workflow 条目（编号 `AP`），`{书}/.story/作者记忆/` 只存本书的 book 条目（编号 `BP`）。每级各有 `作者画像.md`（生效条目）和 `待确认.md`（候选，不参与约束），都从 state 生成，禁止手改；不存在时写作、审稿、去味照常继续，首次 `record` 自动创建。

- `--workspace` 必须显式传，指创作工作区根——承载多本书、`.active-book`、`长篇/`、`短篇/` 或 `拆文库/` 的那一层；已有记忆时，是项目级 state（不带 `book` 字段）所在的最近祖先。`长篇/`、`短篇/` 下的书目录永远不当 `--workspace`，也不要把用户主目录当默认工作区。
- `--book-root` 是当前书的项目目录（`.active-book` 指向、或含 `设定/`、`正文/` 的那一层，如 `{工作区}/长篇/{书名}/`）；书名默认取书级 state 记的名字，首次取目录名，`--book` 可覆盖。书根就是工作区时读维护文件「单书布局」。
- ID 前缀就是 store：`decide` / `forget` 看 `item_id`（`AP` 项目级，`BP` 书级），`remember` / `replace` 看 `scope.level`（`book` 书级，其余项目级）。书级操作必须传 `--book-root`，没传直接报错，不会退而写进项目级。
- `replace` 与 `conflicts_with` 不能跨 store：本书例外按优先级覆盖全局规则，不算冲突，直接 `remember` 为 book 条目；要把全局规则改成本书规则，拆成 `forget` ＋ `remember` 两个事件。

## 查询

各 skill 入口已写好本任务的 `query` 命令（长篇正文由组装脚本代查）；没写命令的长篇设定、大纲等任务查 `story_design` + `workflow` + `interaction`，结果只给主会话、不传正文 agent。四类任务的映射表见维护文件。state 存在才查（两级都不存在时返回空结果、零写入）；结果合并项目级与 `--book-root` 所指书级（不传就拿不到本书条目），`--kind` 必传，输出不超过 2048 字节。

普通创作只做一次本地 `query`，完整画像、证据、候选和 journal 不进 prompt。查询项是低优先级倾向，不是逐条打卡清单：自然吸收，不复述画像、不刻意提高词面命中率，不为命中牺牲连贯、节奏、字数或本书既定笔调。**`omitted_ids` 非空＝记忆超编**，不是「没有更多了」：转告作者并建议「整理作者记忆」，不得改读完整画像规避预算。待确认项不进 prompt，也不为确认它们中断任务；只在作者主动查看、候选积累到适合回顾的节点，或新偏好与 active 条目冲突时集中呈现。

## 记不记、记成什么

不装记录全部用户消息的 prompt hook，不在作者没开口时观察他，只记作者明确表达的偏好。是否属于长期习惯由 agent 判断，拿不准就只执行不记录；作者可明说“记住：……”，以回执验收。

| 输入证据 | 处理 |
|---|---|
| “以后都这样”“我一直习惯……”等直接、稳定、范围清楚的原话 | `active`，`source=explicit_user` |
| 用户明确接受助手提出的长期做法 | `active`，`source=accepted_suggestion` |
| 作者原话像长期偏好但范围或稳定性含糊 | `pending`，取当前最窄合理范围；待确认只来自作者自己的话 |
| 同类修改反复出现、从成稿或操作轨迹看出的模式 | 不记录、不推断；作者没开口的偏好不进记忆 |
| “这一章别……”“这次给我……”等一次性要求 | 只执行，不记录 |
| 角色、时间线、伏笔、世界观、当前剧情走向 | 写项目设定/追踪，不写作者记忆 |
| 助手自己生成的文字、默认模板、工具告警、rubric 结论 | 不自我学习 |

保留否定词、限定词和适用范围：`quote` 写原话，`assertion` 只做不改变语义的紧凑归纳，**新建条目限一句话（≤120 字节，约 40 个字）**，写不下就压缩措辞、不切限定词；背景写进 `reason`（不进 prompt），不另开字段。

**一条偏好就是一条记录，例外和限定不许拆出去单列。** 「以后少用破折号，对话里也别用，除非表示打断」整条写成「破折号少用、对话里也不用，只在表示打断时保留」：超编时条目逐条被丢，拆开就可能只丢掉例外，把作者说过的限定变成绝对禁令。只有原话塞了**几条互不依赖**的偏好（如「多用短句」＋「章末留钩子」）才拆。

范围：“本书 / 这个角色 / 这次连载” → `book`；“都市文 / 这类题材” → `genre`；交稿、检查、确认节奏等操作习惯 → `workflow`；“以后 / 一贯 / 我习惯”且无更窄限定 → `global`；含糊但可能稳定 → 最窄合理范围并置 `pending`。

类型：`prose_style`、`story_design`、`workflow`、`delivery`、`interaction`。置信度与重要度均为 `low | medium | high`；超编时先丢重要度低的，按偏好的实际分量填，不要一律 `high`。`source` 只接受 `explicit_user`、`accepted_suggestion`、`manual`，工具拒绝推断类来源。

## 确认、替换、忘掉与冲突

- 同一类型、范围、归纳文本再出现，脚本强化原条目（累加证据与确认次数），不重复建条。
- 新偏好与同一 store 的 active 条目矛盾：以 `conflict` 记候选，`conflicts_with` 列冲突 ID，本轮仍按当前要求执行；本书例外与全局规则不算冲突。冲突候选不能直接 activate，落定见维护文件「冲突候选」。
- pending 用 `decide=activate|reject`。同一范围的规则改版用 `replace`，新条目启用、旧条目标 `superseded`；只有作者明确撤销或改变旧规则范围才跨范围替换。
- 作者说“忘掉 / 这不再是我的习惯”用 `forget`，保留历史证据但不再加载。active 条目的语义不可原地偷改，语义变化必须 replace，历史才可审计。

## 回执怎么告诉作者

回复就两行纯文本，不加代码块或引用格式：第一行用一句人话说记住了什么、管哪本书或哪类场合，如「记住了：《{书名}》的对话一律用「」，以后写这本书都照这个来；想改随时说。」；第二行是机器回执作凭证，如「技术备注：Author Memory Receipt: r1 · BP001」。

- 确认、替换、忘掉同理：「好，这条生效了：……」「换成了：……，原来的「……」不再用」「忘掉了：……」。只进待确认时说「这条先记在待确认里，你说"确认"才生效」；有冲突时用原话说明跟哪条旧习惯冲突。
- `warnings` / `omitted_ids` 不原样贴：说「你的习惯攒得有点多，写正文时这几条可能顾不上：「……」」，并建议说「整理作者记忆」。不提字节、prompt、kind、scope；编号只能跟着原话出现。

## 运行工具

依次尝试 `python3`、`python`、`py -3` 找到 Python 3，从当前 skill 根运行本地副本：

```text
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py record --workspace {工作区} [--book-root {书目录}] --input {工作区}/.story/work/作者记忆-事件.json
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py query  --workspace {工作区} --book-root {书目录} --kind {类型}（必传，可重复） [--genre {题材}] [--workflow {流程}]
```

- 子命令都可加 `--book {书名}`；写某本书时一律带 `--book-root`。事件 JSON 写在 `{工作区}/.story/work/`（不写系统 `/tmp`），成功后删掉；book 条目的 `scope.value` 填书名（书级 store 已记的名字，首次取目录名）。
- 明确的“记住 / 确认 / 替换 / 忘掉”都走单事件 `record`：自动读该 store 当前修订、首次自动初始化，不手工读修订号或拼多操作事务。同一 `event_id` 同内容幂等返回原回执，内容不同则失败；返回的 `store` / `book` 说明写到了哪一级。
- 成功才有 `Author Memory Receipt: rN · APxxx`，没有回执不得声称“已经记住”。**写入不因注入预算失败**：`warnings` 只是提醒（另一级 store 读不出来也在这里注明），按上节转告；有回执就是已记住，不要换 `event_id` 重试。

## 事件格式

新增或强化（`record` 输入；book 范围传 `--book-root`）：

```json
{
  "schema_version": 1,
  "event_id": "conversation-2026-08-25-message-42",
  "operation": {
    "action": "remember",
    "preference": {
      "kind": "prose_style",
      "scope": {"level": "global", "value": null},
      "assertion": "对话尽量短，用动作承接情绪，不用大段解释",
      "quote": "以后对话都短一点，情绪放动作里，别让角色长篇解释。",
      "source_ref": "conversation:2026-08-25",
      "source": "explicit_user",
      "confidence": "high",
      "importance": "high",
      "status": "active",
      "reason": "用户以“以后”明确声明长期偏好",
      "conflicts_with": []
    }
  }
}
```

待确认用 `"status": "pending"`；冲突候选用 `conflict` 并填同一 store 的 active ID。确认、替换、忘掉时，把下列对象换进新事件的 `operation`（`BP` 编号传 `--book-root`）；`replace.preference` 字段同上但不传 `status`、`conflicts_with`，新条目直接 active：

```json
{"action":"decide","item_id":"AP002","decision":"activate","quote":"对，这就是我的长期习惯。","reason":"作者明确确认"}
{"action":"replace","old_ids":["AP001"],"preference":{"kind":"prose_style","scope":{"level":"global","value":null},"assertion":"以后对话允许更长的试探，但避免解释设定","quote":"……","source_ref":"conversation:2026-08-25","source":"explicit_user","confidence":"high","importance":"high","reason":"作者明确替换原有全局规则，不是新增本书例外"}}
{"action":"forget","item_id":"AP003","quote":"忘掉这个偏好。","reason":"作者明确撤回"}
```
