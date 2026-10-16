# agent-calls.md：短篇派写手的调用方式

按 workflow-draft.md / workflow-revision.md 决定是否派 narrative-writer；派出时读本文件，主会话自行写作或去味时跳过。Antigravity 用 `invoke_subagent` + 同名 `TypeName`。

## 写正文

spawn `Agent(subagent_type: "narrative-writer", prompt: ...)`，只传项目目录、输出文件、目标情绪、题材风格包、小节大纲、角色、主/副对标召回摘要、本书文风全文路径与 style_resolution、作者偏好 query 输出的 lines、格式硬约束和写作硬约束，并传入检查分工：本批只做内容覆盖与格式自检，完整语义去味由 Phase 4 负责，最终文件扫描由主会话负责。

写手按 `short-format.md`、题材包、`short-craft.md` 与 `scene-craft.md` 执行，无需将 skill 全文复制进 prompt。主会话收到结果后，按 workflow-draft.md 的格式规范重排，再写入 `正文.md`。

## 精修去味

spawn `Agent(subagent_type: "narrative-writer", prompt: "项目目录：{dir}\n任务描述：去AI味+格式检查\n检查分工：你负责本次精修清单与检测命中的定点语义修复；最终文件扫描由主会话执行\n检查范围：{正文文件与待修位置、问题类别}\n所选 Gate：{按命中类别选，类别不明写 A-G；仍只处理本次精修问题}\nstyle_resolution：{与写作一致的文风裁决，含全文路径}\n作者偏好：{query 输出的 lines}\n篇幅：短篇\n卖点保留：第一人称审判、火葬场预告、心死余韵按具体功能保留；压掉空泛与重复，不强制补反应\n执行边界：按读取表与 deslop-gates 的范围协议修复；不扩大为完整故事重写；需新增动机、证据、事件或改变选择、结果、揭露时机的给出具体设计建议，已授权的执行\n验收：复读完整场景及小节承接，说明原文问题、修改动作与保留理由；不用固定删减率，字数不足如实交回")`
