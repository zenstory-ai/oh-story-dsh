# agent-calls.md：短篇派写手的调用方式

只在要 spawn narrative-writer 时读；主会话自己写正文、自己去味时不读。何时派由 workflow-draft.md / workflow-revision.md 决定，这里只放 prompt 与必须附带的内容。Antigravity 用 `invoke_subagent` + 同名 `TypeName`。

## 写正文

spawn `Agent(subagent_type: "narrative-writer", prompt: ...)`，只传项目目录、输出文件、目标情绪、题材风格包、小节大纲、角色、主/副对标召回摘要、本书文风全文路径与 style_resolution、作者偏好 query 输出的 lines、格式硬约束和写作硬约束，并传入检查分工：本批只做内容覆盖与格式自检，完整语义去味由 Phase 4 负责，最终文件扫描由主会话负责。

不把本 skill 整段规则塞进 prompt；细节以 `short-format.md`、题材包、`short-craft.md` 与 `scene-craft.md` 为准。收回后按 workflow-draft.md 的格式规范重排再写入 `正文.md`。

## 精修去味

spawn `Agent(subagent_type: "narrative-writer", prompt: "项目目录：{dir}\n任务描述：去AI味+格式检查\n检查分工：你负责本次语义去味及原定自检；最终文件扫描由主会话执行，不在子代理内重复\n检查范围：{正文文件}\nstyle_resolution：{与写作一致的本次文风裁决，含全文路径}\n作者偏好：{query 输出的 lines}\n篇幅：短篇\n卖点保留：第一人称审判句、火葬场预告、心死式章尾留，只删中立作者讲解与空洞升华\nAI味等级：{轻度/中度/重度；未分级按轻度}\n删除优先：每条 AI 味项先判能否删除——删后不丢伏笔/钩子/角色/情节/必要信息的直接删，会丢才润色（删除受比例上限与本次字数范围下沿约束，跌破改降AI重写）\n必须检查：检查是否连续使用头皮发紧/眼皮一跳/心口一沉/胃里翻涌等精致戏剧反应，能写普通动作/普通感觉就写普通动作/普通感觉；已有手机/聊天记录/公告/账单/病历/证据截图等信息，保留为角色看到或处理的场内载体，不改成叙述者解释；任务卡点只在角色本来有要办的事且能加重情绪/证据/关系/反转时使用，不为自然感补流程")`
