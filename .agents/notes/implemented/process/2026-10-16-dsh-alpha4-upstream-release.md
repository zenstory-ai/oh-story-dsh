# Agent Note: DSH alpha.4 与上游 Skills 联合适配发布

Status: implemented

## Problem

插件 0.1.15 的开发宿主停在 DSH 0.2.1-alpha.1，官方 alpha 已更新到 alpha.4，并开始优先读取 engines.dsh 判断插件兼容性。Oh Story 0.8.6 迁移作者记忆脚本归属，既有 DSH 技能桥的路径需要跟随；Drama 0.9.0 也需将已审文档与当前 release 对齐。

## Decision

保留默认 DSH 0.2.0-rc.2 和显式 alpha 试用两条线，将开发与打包浏览器验证宿主更新为 alpha.4，配套 Cordis / Schemastery 升到官方使用的 alpha.2。在插件 engines.dsh 写入经实际验证的兼容范围，并保留旧宿主所需 peer 元数据。通过现有同步命令更新 Oh Story，Drama 与其他两套资产维持已审固定提交，修正技能桥与相关契约校验。以 0.1.16 走既有受保护 PR、main 精确提交 CI、Tag 与双渠道发布流程。

DSH 官方 alpha.2 移除 `both` 工具展示模式，并将内置子代理工具改为立即返回 child ID；本插件未使用 `both`。升级类型检查实际发现 `SubagentRuntime.start()` 已移除，新 `startActivation()` 的请求同时移除 persona / toolFilter、返回值不再暴露 localAgent，signal 也只负责启动前取消。Role 工具按能力分流：旧宿主继续用 start，新宿主预留 childId，使用 DSH 会在首请求前等待的 agent/created 事件写入子 Agent 作用域 persona 和 tools.restrict，然后用 caller delivery 等待结果，把工具后续取消接到 activation.dispose。新宿主的子会话保留在 DSH 目录中，因此恢复角色子会话时也按已有 descriptor 的 label 重新应用同一 persona 与权限。alpha.3 调整对话滚动和子代理预设，打包验证覆盖工作台三栏、长答复尾部、队列取消与 Role 子代理。

## Alternatives considered

- 只提高依赖版本可以最小化改动，但遗漏 engines.dsh 与已移动脚本会让新宿主或写作流程继续读取过时契约，因此同时审查适配层。
- 将默认宿主直接切换到 alpha.4 可减少一条验证线，但 npm latest 仍为 rc.2，维持默认安装线可避免让既有作者被动切换到试用宿主。
- 将 Role 文本直接拼进子 Agent 用户提示词可免去作用域初始化，但会降低角色指令优先级，且无法继续约束工具权限，因此沿用 DSH 自己的 prompt section 和工具限制服务。

## Consequences

收益是作者能使用新 Skills 与当前 alpha 宿主，并保留默认安装路径。代价是需要对两条宿主线运行完整打包浏览器验证，发布仍依赖所有受保护 CI 与公开渠道验收完成。

## Verification

第二轮 alpha.4 smoke 已通过 Role、工作台切换与长答复多尺寸尾部检查，Todo 断言却把 `flow.lastElementChild` 当成最后一条可见内容，得到零矩形后又在另一次读取取得 null。官方 ChatFlow 分别标记内容行 `data-chat-flow-key` 与运行行 `data-chat-running`，折叠结构及辅助尾节点不保证有可见矩形。Todo 检查改为同一顶层 flow 中最后一个有实际矩形的语义内容或运行行，并在同一次测量核对其上下边界、Composer 座位与完整留白；保留尾行必须位于视口内且在 Composer 上方的要求，不修改已通过长答复检查的产品布局。后续同一轮适配中的三种宽度几何检查也改为此语义行选择，允许 `conversation.chat.flow` 包装层，排除嵌套工作过程及隐藏行；原来的 Composer 边界、留白与列内位置断言全部保留。

alpha.4 打包 smoke 首轮暴露默认工作区可保留多条空白会话，原先「全局只有一条 blank」的假设失效。官方 `SessionListRequest` 只接收 cursor，列表仍是全局；新建接口仅在显式 sessionId 时尝试复用指定空白会话。测试以使用引导所在主对话的 `data-conversation-session` 读取当前身份，再同时核对该条 global list 记录的 blank 与默认工作区规范路径，只启动当前可见会话并验证引导消失。

真实供应商脚本按 `tool/call.callId` 与 `tool/result.message.toolCallId` 关联每个必需 Role 的结果；要求角色参数精确匹配、结果非错误且包含非空文本，避免只发起调用或失败后由父模型自行完成也通过。最终输出成功返回结果的必需 Role 数量。

DSH 适配定向验证：alpha.4 开发依赖下，`pnpm --filter @oh-story/dsh typecheck`、`pnpm dsh:boundary` 通过；Role、真实 Cordis Context 契约、文件活动与生产状态四个测试文件共 57 项通过。新增契约覆盖 managed 子 Agent 在首请求前配置一次角色与工具限制、caller delivery、工具取消触发 disposal、缺少初始化时拒绝、恢复新角色 descriptor 时重建配置以及恢复旧 descriptor 时避免重复注册。公开类型使用本地结构接口，避免旧宿主类型没有 `startActivation` 导致消费者 TypeScript 编译失败。最后复核历史 descriptor 分支后，Role 两文件 15 项与定向 ESLint 再次通过。

Skills 适配范围：Oh Story 从 `747b8e30`（0.8.5、agents 34）更新到正式发布提交 `86a8000c`（0.8.6、agents 35），保留 13 个 Skills 与 7 个 Roles。`story` 的 DSH 原生入口只把作者习惯管理交给对应长短篇写作 Skill；作者记忆协议、脚本与单书工作区参数说明随之移到写作 Skill，独立去味和审稿只接收调用方已有偏好。两级记忆存储、事件格式和回执保持上游现有契约，无数据迁移。三层去味方法和新版 narrative-writer 引用逐字同步；native hook 核心在该固定点区间未变，不新增守卫。

Drama 保持 `dafe80ee`：它是 v0.9.0 正式标签之后的已审 main 提交，当前 Skills 树与正式标签一致，不为“对齐 release”回退该提交或重写 fixture provenance。NovelToGame `bf0ffbc0` 与 video-recap `5785c33` 同样维持已审固定点。

同步源的 `skills/story-long-analyze.zip` 是 `.git/info/exclude` 忽略的本地旧备份，未被上游 Git 跟踪，包内含 2026-09-18 旧技能和 macOS `__MACOSX/._*` 文件，无运行时引用。将它按精确路径加入同步排除和 parity 禁入清单，再运行同步命令重建资产与 manifest，避免旧备份进入发布包。

针对性验证：在 `packages/dsh-plugin` 运行 `pnpm exec vitest run tests/skill-provider.test.ts tests/role-provider.test.ts tests/native-hooks.test.ts`，3 个文件、42 项测试通过，覆盖记忆管理入口与资源归属、三层方法资源及现有原生守卫。

根目录首次 `pnpm verify:release` 的 ESLint 扫进 `.claude/worktrees/` 中的本地旧 checkout，错误路径全部属于这些旧副本。发布验证在仅含已提交源码的临时干净副本中运行，保留用户原有工作区与旧 checkout；不因此修改 lint 规则。

用户另行授权用临时 Key 验证真实 DeepSeek 模型。凭据只存于权限 0600 的临时文件，通过现有 `DEEPSEEK_API_KEY_FILE` 读取，验证完成后删除本地副本，并提醒用户撤销临时 Key。真实模型测试另检查必需 Role 的工具结果成功，避免仅发生调用即误判通过。

真实模型验证：2026-10-16 在 `44b9b7e` 打包运行时上执行 `pnpm test:dsh:real`，DSH `0.2.1-alpha.4`、`deepseek-official/deepseek-flash` 返回 `ok: true`。小说/短剧均使用随包 Skill，3 次 Role 调用中两个必需角色均有成功非空结果；持久事件分别 109 / 68，项目 digest 不变。临时凭据文件已在进程成功退出后删除，已通知用户可撤销。之后改动仅涉及浏览器测试与验证文档，未改变该付费运行所测的插件逻辑。

最终本地验收：干净源码副本运行 `pnpm verify:release` 成功退出（0），lint、typecheck、四套 parity、DSH boundary、16 项发布测试、3 项更新监测测试、23 文件共 179 项单元/契约测试及构建全通过；DSH alpha.4 与默认 rc.2 的完整打包 Chrome JSON 均为 `ok: true`，包括 Role、流式写文件、混合装配、ADV 存取档、500px 布局及 20 writer CAS。后续发布沿用受保护 PR、精确 main CI、Tag 与双渠道验证。
