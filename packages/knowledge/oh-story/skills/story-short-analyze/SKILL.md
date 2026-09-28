---
name: story-short-analyze
version: 3.1.0
description: "短篇网文拆文。拆解爆款短篇小说（番茄短篇 / 故事会 / 知乎盐选 / 追妻 / 世情 / 重生 / 虐渣等通俗题材）的故事核、结构、情感线、反转设计、写作手法、共鸣层次。单一全量拆解管道：跑完 Stage 2-6 产出完整拆文报告，落盘到 拆文库/{书名}/，下游 story-short-write 同时读拆文报告 + 情节节点 + 写作手法 + 原文 + _meta.json 写下一篇。触发方式：/story-short-analyze、/短篇拆文、「拆短篇」「拆这篇短文」「短篇拆文」「精细拆解短篇」「8000 字短篇拆解」「番茄短篇拆文」「故事会拆解」「盐言故事拆解」「分析这篇短篇」——均进入同一管道。"
metadata: {"openclaw":{"source":"https://github.com/zenstory-ai/oh-story-claudecode"}}
---
# story-short-analyze：短篇网文拆文

你是短篇小说结构分析师。

**核心：短篇靠共鸣和爆点驱动。拆文就是看它用什么故事核、怎么铺垫、在哪里引爆，把
分析叙事写进 `拆文报告.md`，结构计数写进 `_meta.json`，下一篇短篇直接读这些写。**

---

## 拆解边界声明（主会话同样适用）

短篇拆解的 Stage 2-6 全程由你（主会话）亲手做：拆的是用户**合法持有、拥有使用权**的虚构作品（已出版/连载或自有），性质是**只读的转化性文学批评**（编辑/评论/写作教学视角，不复制、不传播、不指导现实行为）。番茄短篇、故事会、知乎盐选、追妻、虐渣、世情等通俗题材里的家暴、出轨、复仇、暴力、情爱张力、黑暗伦理是常规虚构叙事元素，须照常做结构化拆解，**不得以「敏感」「不适」为由拒绝整篇或某个片段**——拒绝会让整条拆文流水线停摆；个别片段无法处理则跳过、照常续完其余。

---

## Phase 1：确认拆解对象 + 字数路由 + 续跑检查

### Step 1：拿到原文

问用户：**「你要拆哪篇？（标题+平台/来源）」**

**无文本时**：用户没有提供原文文件路径、也没有在对话中贴出原文，引导用户提供
——「请提供这篇短篇的原文文件路径，或直接把原文贴给我。」

### Step 2：字数检查（长短篇路由）

拿到原文后立刻数字数：

```
word_count = 全文字数
  ├─ < 15,000          → 直接进入 short 管道
  ├─ 15,000 - 20,000   → 灰区：询问用户「字数 {N}，介于短/长之间，按短篇还是长篇拆？」
  └─ > 20,000          → 提示「此文字数 {N} 偏长，建议改用 /story-long-analyze。
                           仍要按短篇拆请明确回复『按短篇继续』」
```

### Step 3：题材识别

```
用户提到具体题材（追妻 / 重生 / 虐文 / ...）？
  ├─ 是 → 加载 analysis-short-genres.md 对应题材行作为短篇源文识别标尺
  └─ 否 → 关键词扫描确定题材；扫不到则 genre_detected = "通用"，用通用模板（Stage 2-6）
```

题材识别关键词参考：

- 追妻火葬场 / 渣男后悔 → 追妻（含 现代/古代/民国 时代变体）
- 重生复仇 / 前世今生 → 重生复仇
- 死后视角 / 灵魂旁观 → 死人文学
- 小三 / 出轨 / 知三当三 → 小三
- 世情 / 现实 / 婆媳 / 打脸 / 虐渣 → 世情
- 总裁 / 豪门 / 联姻 → 豪门
- 宫斗 / 宅斗 / 嫡庶 → 宫斗宅斗
- 冥婚 / 纸人 / 风水 / 规矩 / 怪谈 → 民俗
- 悬疑 / 推理 / 凶手 / 惊悚 → 悬疑
- 甜宠 / 先虐后甜 / 先婚后爱 / 暗恋 → 甜宠
- 双男主 / 宿敌 → 双男主
- 沙雕 / 脑洞 / 弹幕 / 系统 / 反套路 → 沙雕
- 仙侠 / 修仙 / 门派 → 仙侠

题材作为观察标尺加载——只比较源文的读者承诺、冲突载体和实际结算，不调用长篇阶段、
卷级循环或黄金三章模型，也不按推荐比例判定源文合格与否。

### Step 4：续跑检查（lightweight resume）

进入管道前检查 `拆文库/{书名}/_meta.json`：

```
存在 _meta.json？
  ├─ 否 → 直接进入新一轮拆解
  └─ 是 → 询问用户三选一（问法见下）：
       (a) 覆盖：归档旧产出到 拆文库/{书名}/_archive_{时间戳}/ 后从 Stage 2 重跑
       (b) 续跑：读 _meta.json.last_stage_in_progress（非空 → 从该 Stage 整段重跑）
                 或读 _meta.json.stages_completed[]（从 max+1 续跑）
       (c) 取消
```

问作者时不提文件名、字段名和 Stage 编号：

<!-- author-report -->
```md
《{书名}》之前拆过，{拆到一半，停在"{当前阶段的白话名，如反转与写作手法}" | 已经拆完}。怎么处理？
1. 接着上次往下拆（推荐，已拆的部分保留）
2. 旧结果存档，从头重拆
3. 先不拆了
```

完整 resume 契约见 [references/output-contract.md](references/output-contract.md)。

---

## 输出目录

输出到 `拆文库/{书名}/`（项目根目录下；用户指定了其他路径时按用户指定）：`原文/`、`拆文报告.md`、`情节节点.md`、`写作手法.md`、`_meta.json`。三个 markdown 由下游 `story-short-write` 硬编码读取，不可改名；文件树、Stage → 文件映射与 `_meta.json` 字段见 [references/output-contract.md](references/output-contract.md)。

### 原文备份（管道前置步骤）

**拆解开始前，必须先备份原文**：

1. 检查 `拆文库/{书名}/原文/` 目录是否已存在
2. 如果不存在，从用户提供的源路径复制原文文件到 `拆文库/{书名}/原文/`
3. 如果用户未提供源文件路径（直接在对话中贴文本），将原始文本保存到
   `拆文库/{书名}/原文/原文.md`
4. 备份完成后验证 `原文/` 目录下文件非空（>0 bytes）
5. 此步骤确保即使拆文过程中出现异常，原始材料不会丢失

备份完成后初始化 `_meta.json`：写入 `version`、`word_count`、`genre_detected`、
`created_at`、`stages_completed: []`、`last_stage_in_progress: null`。

---

## Stage 2-6：拆文流程

### 5 阶段管道

**预期耗时提示**：短篇拆文通常 10-30 分钟；同类对比或平台适配会更久。若文本很短，
先只挑关键节点，不要为满足节点数量硬拆。

| 阶段 | 名称 | 输入 | 输出 | 完成标志 |
|------|------|------|------|----------|
| 2 | 结构+情节节点 | 全文 | 故事核 + 故事梗概 + 功能分段（4-6段，必须含开端/发展/高潮/结局）+ 情节节点清单（以语义变化为边界提取）。 | 结构划分 ≥4 段 + 故事核已提取 |
| 3 | 情感线+爆点 | 故事核+结构划分+情节节点数据 | 情感曲线（≥5节点）+ 爆点分析（6维度）+ 期待感分析。 | 爆点分析 6 维度齐全 |
| 4 | 反转+写作手法 | 节点+情感数据 | 前置反转检查 + 反转机制（铺垫≥3条）+ 写作手法（≥5项维度：POV/对话/时间/信息/其他）。 | 写作手法 ≥5 项 |
| 5 | 人物+开头结尾 | 情节节点+全文 | 所有人物（分类+功能标签+功能评估）+ 开头分析（前50/100字）+ 结尾分析（收束检查）。 | 人物功能评估完成 |
| 6 | 综合评估 + `_meta.json` 写计数 | 全部数据 | 五维评分 + 爆点性 + 话题性 + 共鸣分析（≥3层）+ 可复用结构（≥3条）+ 节奏速报 + **算出并写入 `_meta.json.structure_counts`**。 | 左列输出齐全 + `structure_counts` 各字段达「structure_counts 数值校验」阈值 |

> 管道执行顺序：2 → 3 → 4 → 5 → 6（严格串行，每阶段依赖前一阶段数据）。可选模块
> （同类对比、平台适配、详细节奏）可在 Stage 6 后执行，读 [references/optional-modules.md](references/optional-modules.md)。

### 按时刻读

管道分两个时刻，进入时刻只读该行的文件；两个时刻之间只靠落盘的 `拆文报告.md`、`情节节点.md`、`写作手法.md` 和 `_meta.json` 交接，续跑或换新对话都按 `_meta.json` 的进度接上。

| 时刻 | 读 | 交接 |
|---|---|---|
| Stage 2–3 结构与情感线 | [output-contract.md](references/output-contract.md)、[analysis-method.md](references/analysis-method.md)、[stage2-3-structure-emotion.md](references/stage2-3-structure-emotion.md)、[quality-checklist.md](references/quality-checklist.md)、[analysis-report-style.md](references/analysis-report-style.md) | `stages_completed` 含 3 |
| Stage 4–6 反转到综合评估、验收 | output-contract.md、analysis-method.md、[stage4-6-reversal-summary.md](references/stage4-6-reversal-summary.md)、quality-checklist.md、analysis-report-style.md；Stage 6 要判断源文本身好坏（毒点、虐爽节奏、证据链等）时加 [source-story-quality.md](references/source-story-quality.md) | 验收通过，`stages_completed` 含 6 |

对照标尺类参考按下方「参考资料」的条件在对应 Stage 读。

**Stage 写盘协议**（crash safety）：每个 Stage 开始前置 `_meta.json.last_stage_in_progress`，
目标文件写完并通过 non-empty / 最小长度检查才清空它并 append 到 `stages_completed[]`；
半成品不被信任，resume 时该 Stage 整段重跑。完整协议见 output-contract.md「写入顺序 (crash safety)」。

---

## 验收（Stage 6 之后、写 stages_completed[6] 之前）

Stage 6 内容写完后**不**立刻 append `6`，先按 output-contract.md「验收接入点」跑三道检查，全过才写：

- **拆文报告表达自检**：按 analysis-report-style.md 扫描 `拆文报告.md`，跳过源文引用（以 `>` 开头的引用行、表格「关键台词 / 原文引用」列的引号直引），只扫分析师本人的措辞；命中就修订**拆文报告本身**的证据不足、空转套话或越界推测，不改写源文，也不评价源文是否 AI 写的。
- **structure_counts 数值校验**：阈值以 output-contract.md 为准（单一权威），注意「无反转」是合法枚举，此时 `setup_clues` 跳过、不计入阻断。
- **BLOCK 项扫描**：扫 quality-checklist.md 全部 `[BLOCK]` 项；`[WARN]` 缺项不阻断，写入 `拆文报告.md` 末尾「待补」清单供用户决定。

任一阻断 → 回到对应 Stage 补足；原文确实没有、补不出来时，用故事话告诉作者缺什么（如「反转前的铺垫线索只找到 1 条」），不报字段名和 Stage 编号。全通过 → 清空 `_meta.json.last_stage_in_progress`，append `6` 到 `stages_completed[]`，按下方格式告诉作者：

<!-- author-report -->
```md
《{书名}》拆完了，结果在 `拆文库/{书名}/`。
- 这篇靠什么抓人：{一句话故事核}
- 最值得学的 3 点：{白话，各附一句原文或情节例子}
- 还缺的：{拆文报告末尾"待补"里需要作者决定的项；没有就写"无"}
下一步：想照这个路子写一篇，运行 `/story-short-write`。
```

---

## 流程衔接

**流水线：** 短篇
**位置：** 拆文（第 2/3 步）

| 时机 | 跳转到 | 命令 |
|---|---|---|
| 准备开写 | story-short-write（同时读 拆文报告.md + 情节节点.md + 写作手法.md + 原文/ + _meta.json） | `/story-short-write` |
| 需要市场数据 | story-short-scan | `/story-short-scan` |
| 字数 > 20k 更适合长篇 | story-long-scan → story-long-analyze | `/story-long-scan` |

---

## 参考资料

核心方法与模板按上方「按时刻读」加载；以下是对照标尺，按条件读。

### 按需加载（拆解对应题材 / 维度时作为对照标尺，一次只查一份）

| 文件 | 何时加载 |
|------|----------|
| [references/deconstruction-examples.md](references/deconstruction-examples.md) | 校准拆文方法：3 个完整案例 |
| [references/zhihu-style.md](references/zhihu-style.md) | 拆知乎盐言故事：平台特性对照 |
| [references/analysis-short-genres.md](references/analysis-short-genres.md) | Phase 1 / Stage 2 判主副类型：识别锚点、读者承诺、结算归属 |
| [references/analysis-short-hooks.md](references/analysis-short-hooks.md) | Stage 3 / 5：段落与小节边界、钩子链、候选付费断点 |
| [references/analysis-short-suspense.md](references/analysis-short-suspense.md) | Stage 3 / 4：主副问题、信息差、证据释放、阶段答案与回收 |
| [references/analysis-paragraph-hooks.md](references/analysis-paragraph-hooks.md) | Stage 3 / 5：11 种段落级钩子对照 |
| [references/analysis-character-basics.md](references/analysis-character-basics.md) | Stage 5：人设要素对照 |
| [references/analysis-character-design.md](references/analysis-character-design.md) | Stage 5 细拆反差手法：按标题查「三层标签反差人设法」（数反差人物用 stage4-6 的判定，不读本文件） |
| [references/analysis-character-relations.md](references/analysis-character-relations.md) | Stage 5：关系类型对照 |
| [references/analysis-short-mechanics.md](references/analysis-short-mechanics.md) | Stage 2 / 6：核心梗、有限复现、规则兑现、代价与主角代理权 |
| [references/analysis-reader-profile.md](references/analysis-reader-profile.md) | Stage 3 / 6：读者心理与期待管理 |

### 补充资料（拆 Stage 6「可复用结构」时按需对照）

> **短篇结构模式**：`references/analysis-short-patterns.md`（比较源文实际功能链、偏离方式
> 与失败条件；不按固定章位、百分比或线索数判“合标”）
> **通用写作技法**：`references/analysis-writing-techniques.md`（情绪操控 / 感情线 /
> 震惊场景 / 喜剧机制——拆 reusable_structures.fail_mode 时按标题只查「感情线四阶段推进法」表的「禁忌」列，不整读）
> **市场数据**：`references/real-market-data.md`（跨平台写作差异对照表）

所有 references 在 `story-short-analyze` 中都是**观察标尺**——先报告源文实际发生了什么，
再说明它接近、偏离或改造了哪种模式；不是按文件指引写新作品，也不从相邻长篇 Skill
加载题材、节奏或质量资料。

---

## 语言

- 跟随用户的语言回复，用户用什么语言就用什么语言回复
- 中文回复遵循《中文文案排版指北》
