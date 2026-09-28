---
name: output-contract
description: |
  story-short-analyze 输出契约。定义 Stage → 文件映射、_meta.json schema、
  写入顺序、Resume 与验收接入点。story-short-write 怎么读这些产出由写作侧自己维护。
---

# 输出契约：story-short-analyze ↔ story-short-write

`story-short-analyze` 拆完一篇短篇后，产物落盘到 `拆文库/{书名}/`。`story-short-write`
写下一篇同题材短篇时，**同时**读这个目录下的全部产出。

---

## 输出目录与文件树

```
拆文库/{书名}/
├── 原文/                  # 管道前置步骤产出，存放源文件备份
├── 拆文报告.md             # 人类可读综合报告（Stage 2-6 综合）
├── 情节节点.md             # Stage 2 情节节点清单
├── 写作手法.md             # Stage 4 写作手法分析
└── _meta.json             # 管道元数据 + 结构计数（resume + 验收数值依据）
```

**文件名约定**：`拆文报告.md / 情节节点.md / 写作手法.md` 由 `story-short-write` 硬编码
消费，不可重命名。分析叙事走 markdown，数字/枚举走 `_meta.json.structure_counts`。
写作侧怎么读这些产出（读哪几段、按什么顺序用）由 `story-short-write` 自己的参考文件维护，不在本契约里。

---

## Stage → 文件映射

| Stage | 名称 | 落地文件 | 主要内容 |
|-------|------|----------|---------|
| 2 | 结构+情节节点 | `拆文报告.md`（故事核/结构/梗概段） + `情节节点.md` | 故事核 / 4-6 段结构 / 故事梗概 / 情节节点清单 |
| 3 | 情感线+爆点 | `拆文报告.md`（情感曲线段+爆点段） | 情感曲线 ≥5 节点 / 爆点 6 维度 / 期待感 |
| 4 | 反转+写作手法 | `拆文报告.md`（反转段） + `写作手法.md` | 前置反转检查 / 反转分析（铺垫 ≥3） / 写作手法 ≥5 项 |
| 5 | 人物+开头结尾 | `拆文报告.md`（人物段+首尾段） | 人物分类+功能评估 / 开头分析 / 结尾分析 / 首尾呼应 |
| 6 | 综合评估 | `拆文报告.md`（综合段） + `_meta.json`（写 structure_counts） | 五维评分 / 爆点性 / 话题性 / 共鸣 ≥3 层 / 可复用结构 ≥3 条 / 节奏速报 |

---

## `_meta.json` schema

`_meta.json` 是管道元数据 + 结构计数。**不放分析内容**，只放数字和枚举——给验收
检查做完整性校验用。分析叙事都在 `拆文报告.md` 里。

```jsonc
{
  "version": "2.0",
  "word_count": 5234,                   // 源文字数（Phase 1 探针填入）
  "genre_detected": "追妻",             // Phase 1 题材识别；未识别填 "通用"
  "created_at": "{ISO8601 时间戳}",      // 拆文启动时间，写入时填当前 UTC
  "stages_completed": [2, 3, 4, 5],     // 已完成 Stage，按完成顺序 append
  "last_stage_in_progress": null,       // 当前正在执行的 Stage；空闲为 null

  "structure_counts": {                 // Stage 6 完成时一次性写入；structure_counts 数值校验依据
    "beats": 5,                         // 结构段数（结构划分，开端/发展/高潮/结局，Stage 2）
    "hooks": 4,                         // 钩子数（Stage 3）
    "setup_clues": 3,                   // 反转铺垫线索数（Stage 4）
    "character_archetypes": 3,          // 有反差人物数（Stage 5）
    "reusable_structures": 3,           // 可复用手法条数（Stage 6）
    "reversal_type": "视角反转"          // 反转类型枚举（视角/身份/动机/时间线/信息/认知/无反转）；甜宠/喜剧/报应型填「无反转」
  }
}
```

### 写入顺序（crash safety）

1. **Stage N 开始前**：`last_stage_in_progress = N`，写盘。
2. **Stage N 文件写完后**：non-empty + 最小长度合理性检查（如 `拆文报告.md` 新增段 ≥ 200 字）。
3. **通过**：清空 `last_stage_in_progress`，append `N` 到 `stages_completed[]`。
4. **失败**：`stages_completed` 不动，`last_stage_in_progress` 保留为 `N`。
5. **Stage 6 完成时额外动作**：把 `structure_counts` 一次性算出并写入 `_meta.json`，
   然后才进入验收。

### Resume 协议

- `last_stage_in_progress` 非空 → 该 Stage 上次中断，**从头**重跑（不复用半成品）。
- `last_stage_in_progress` 为空 → 从 `max(stages_completed) + 1` 开始。
- `stages_completed` 含 6 → 已完成，询问用户覆盖/取消。

**Stage 6 = 内容写完 AND 验收通过**。验收未过前 `last_stage_in_progress` 保持 `6`、`stages_completed` 不含 `6`；resume 时正文/structure_counts 已在盘上，只重跑验收检查，不重写 Stage 6 正文。

---

## 验收接入点

Stage 6 内容写完后、`stages_completed[6]` append 前，跑三道检查：

### Step 1：拆文报告 AI 腔自检

扫描 `拆文报告.md` 全文 against 拆文流程本地加载的禁用词表与报告 AI 腔规则。
这是拆文报告质量门；成稿去 AI 规则由写作流程在自己的 Skill 内维护，不跨 Skill 读取参考文件，也不要把两套规则混用。
命中 → 不写 `stages_completed[6]`，逐处修订**拆文报告本身**的 AI 腔后重扫
（源文里有 AI 腔不算——这里扫的是分析师写的报告）。

### Step 2：`_meta.json.structure_counts` 数值校验

| 字段 | 最低值 | 不达标 |
|------|--------|--------|
| `structure_counts.beats` | ≥ 4（结构段：开端/发展/高潮/结局）| 阻断 |
| `structure_counts.hooks` | ≥ 3 | 阻断 |
| `structure_counts.setup_clues` | ≥ 3（reversal_type=无反转时跳过本行）| 阻断 |
| `structure_counts.character_archetypes` | ≥ 2 | 阻断 |
| `structure_counts.reusable_structures` | ≥ 3 | 阻断 |
| `structure_counts.reversal_type` | 在枚举内（含「无反转」）| 阻断 |
| `genre_detected` | 非空 | 阻断 |

> 情节节点数不设阈值，按 `情节节点.md` 的语义变化边界提取（见拆文流程的情节节点提取规则），不在本表。`beats` 是结构段数，不是情节节点数。

### Step 3：`story-short-analyze` BLOCK 项扫描

扫拆文流程本地质量检查清单的全部 `[BLOCK]` 项，确认对应产出均已写出。
任一缺失 → 阻断。`[WARN]` 项 → 写入拆文报告末尾「待补」清单，不阻断。

### Step 4：通过

清空 `_meta.json.last_stage_in_progress`，append `6` 到 `stages_completed[]`，按拆文
流程 SKILL 的完成汇报告诉作者。

---

## 版本约定

`_meta.json.version` 跟本契约走：字段改名、类型或必填变更升 major，新增可选字段升 minor。
