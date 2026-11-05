# Agent Note: 游戏画布摘要不拼接标记片段

Status: implemented

## Problem

PR #104 的 CodeQL 检出单次删除 HTML 标记和注释可能重新拼出标记，注释匹配还遗漏换行。

## Decision

摘要将完整标记和多行注释替换为空格，避免拼接两侧内容；最终删除残留尖括号。摘要仍作为 React 文本渲染，不作为 HTML 注入。

## Alternatives considered

不新增 HTML 解析依赖；这里仅生成简短纯文本摘要。

## Consequences

内联标记两侧保留空格，多行或未闭合注释不显示到摘要。增加片段拼接和多行注释回归测试。

## Verification

运行 pnpm verify，并由 PR CI 复核 CodeQL。
