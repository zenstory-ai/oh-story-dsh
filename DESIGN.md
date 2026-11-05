# Design

## Source of truth

Status: Active
Date: 2026-11-04
Surface: DSH 插件的短剧工作台（已实施）、游戏工作台（已实施）与视频工作台（已实施）。

用户已批准 DSH 浅色无限画布 Demo，要求流程自然、主界面不展示技术细节、保持现有 DSH 风格。固定步骤向导与独立深色应用方向已否决。视觉参考为本次聊天中 `drama-studio-demo/evidence/08-dsh-plugin-canvas.png`；现状证据为原生 DSH 上的 22 个场景截图。设计边界遵循 [架构说明](docs/ARCHITECTURE.md) 与现有 [无限画布决策](.agents/notes/implemented/feature/2026-10-08-infinite-drama-canvas.md)。外部交互研究参考 [即梦生成画布](https://jimeng.jianying.com/ai-tool/home?createTab=canvas)、[FLORA Canvas](https://docs.flora.ai/editor/canvas)、[Krea Nodes](https://www.krea.ai/blog/multiplayer-nodes)；这些资料来自官方公开页面，未登录实测。

## Brand

Oh Story 作为 DSH 内的工作台出现。复用宿主主题、字体、按钮与会话导航。画面承载作品气质，操作界面保持熟悉与克制。避免单独品牌壳、强制阶段向导和第二套 Chat。

## Product goals

让作者在一个可持续调整的空间里看故事、人物、场景、镜头和真实成果，比较版本并继续创作。成功标准是默认就能看画布，进入文稿和原生 Chat 方便，生成准备和实际媒体完成清楚区分。

不新增后台数据库、Agent Runtime、供应商配置系统或独立剪辑器。短剧改版保持其他工作台流程；游戏区沿已批准的独立原型接入生产 GameStudio，并继续保持视频与小说流程。

## Personas and jobs

短剧和漫剧创作者：理解当前一集、维护角色与场景一致性、比较镜头成果、在原生 Chat 中讨论修改、明确确认后生产。

## Information architecture

短剧拥有集级工作区：工作台标签、剧集选择、制作/文稿切换、可收起的文稿目录和原生 Chat。默认进入制作区，以画布展示已存在的五份创作文档与真实媒体。制作区内的画布、素材、生成记录、成片提供不同观察方式；镜头清单是辅助入口。原文导航始终可达。

## Design principles

- 文档和 workspace 媒体仍是创作事实，画布仅投影它们。
- 画布空间布局和视野是每集独立的 Session UI 状态。
- 卡片保留就地准备动作，选中后显示上下文操作；名称、真实成果与下一步优先于内部 ID。
- 生产先准备预览，再在原生 Chat 明确确认；不得由画布点击替代同任务确认。
- Chat/Composer 始终由 DSH 挂载，收起只改变布局；现有草稿和附件不被上下文入口覆盖。

## Visual language

直接消费 `--dsw-*` 主题变量；浅色与深色随宿主变化。细点画布、白色/宿主底色卡片、品牌蓝选中态、轻边框、6–10px 圆角、宿主系统字体。人物与镜头使用真实媒体，不打包概念 Demo 的示例剧情或图片。技术 ID 和文件来源放在按需展开的详情或原文里。

## Components

短剧工作区工具栏、剧集选择器、文稿目录、原生 Chat 切换、故事/素材/镜头卡片、真实图片/视频和版本条、语义连线、上下文动作、视野控件、生成记录、制作详情及现有成片顺序。

## Accessibility

工具栏使用标准按钮、选择器与 tabs；焦点可见。节点可用键盘选择、打开原文和方向键移动；画布提供键盘平移和按钮缩放/适应。视频使用浏览器原生控件。避免将仅用于拖拽的区域覆盖到内部按钮与媒体控件。完整无障碍审计不属于本轮交付。

## Responsive behavior

桌面以画布为主，可按需展开目录和原生 Chat。窄屏把画布与 Chat 作为同一会话中的可切换区域，保持输入和生成确认可达。其他工作台的断点规则不变。

## Interaction states

覆盖文档加载、只有剧本/没有分镜、没有媒体、真实图片/视频成果、版本选用、未配置供应商、文档诊断、等待确认、执行中、取消、输出待核对、原文草稿冲突与剧集切换。生成成功只来自真实 workspace 输出与现有任务关联。

## Content voice

使用故事、角色、场景、镜头、画面、视频、版本、生成记录、制作详情等创作语言。主操作避免供应商参数、Python、路径和任务 ID。当前 DSH 仅提供 `conversation.send(text)`，发送给 Agent 的完整生产契约不能通过非官方手段隐藏或删减；完整检查内容保留在原生 Chat，工作台只呈现自然摘要。

## Implementation constraints

React 18 与 DSH 官方 Browser slots，复用 Session Store、ConversationController 和已有媒体路由；无新增依赖。固定上游知识资产不改。验证包含定向单测、`pnpm verify`、打包装入隔离官方 DSH Web 的原生集成检查和真实界面截图。

## Game workspace

Status: Active。用户已批准原型并要求开发；正式插件实现试玩、创作画布与文稿。原型的演示剧情与图片不打包进插件。

### Evidence and jobs

现有 `GamePreview` 已具备大面积真实 iframe、显式载入新版本、全屏与进度保留；`GameDesign` 主要是文件下拉框与只读查看。现场截图见本次 `game-studio-demo/evidence/00-current-game.png`。项目事实遵循固定上游 `pipeline-contract.md`：简报、原著依据、概念、玩法设计、美术方向、构建与独立 QA 文件；不另建创作数据库。

交互研究参考官方 [GDevelop 工作区](https://wiki.gdevelop.io/gdevelop5/interface/)、[GDevelop AI](https://wiki.gdevelop.io/gdevelop5/interface/ai/)、[Twine 结构视图](https://www.twinery.org/cookbook/introduction/twine2_passages_view.html) 与 [Inky](https://github.com/inkle/inky)。公开文档支持“不同创作观察面”“连线表达故事关系”“写作与试玩相互反馈”等模式；本项目采用何种布局是设计判断，未登录体验这些产品。

### Navigation and canvas

- 主入口为「试玩 / 创作画布 / 文稿」。已有构建默认大面积试玩；画布展开时收起 Chat，给故事、世界、人物、玩法、美术和可试玩内容留下空间。
- 画布是自由创作关系，不把原著到 QA 做成强制阶段链，也不复制短剧镜头生产线。卡片映射现有创作文档或其中的明确小节，构建卡片映射真实 `build/app/`。节点位置与视野保持为 Session UI 状态。
- 首次进入画布自动取景，之后保留用户视野；选中内容进入 Chat 时保持可见。文稿按创作意义命名，来源路径按需展开。
- 桌面预览与原生 Chat 并排；Chat 可收起。手机宽度切换为单个面板，由「制作 / 对话」唯一负责，不再同时显示 Chat 按钮。试玩 iframe 与 Chat 保持挂载。

### Iteration and feedback

玩家循环是“试玩、讨论改动、再试玩”。试玩感受直接进原生 Chat，不再有专门的笔记入口或存储协议；项目里已有的 `PLAYTEST_NOTES.md` 保持原样，作为普通项目文件在文稿「更多项目文件」里查看和编辑。上下文入口保留已有 Chat 草稿。试玩区不重复项目名：当前项目由工具栏选择器表明。

制作中继续玩旧版。新版准备好时只提示“有新版本”，用户明确选择载入；不自动刷新丢失进度，也不承诺跨构建的存档兼容或任意历史回滚。

QA 继续作为后台验证事实，主界面不新增 QA Tab、通过率或发布分数。没有试玩时用自然语言讨论游戏想法，不展示安装命令、文件路径、开发服务器和配置参数。

### Prototype and implementation boundaries

本地 buildless 原型为 `game-studio-demo/dist/`，使用 DSH 外观示意和仓库现有的非露骨背景、立绘组成原创短篇演示《青石巷来信》。包含可完成的两条分支、两个结局、存档与重来，用于审阅试玩与创作界面的关系。它的 Chat、文稿、笔记和新版本状态都是浏览器本地演示，不代表真实 DSH Agent 已构建或验证了游戏。

正式实现使用宿主原生 Chat、文件、版本与 iframe 隔离边界。现有协议不保证游戏运行时会上报“当前场景”或支持跳到任意场景；原型自己的场景消息仅演示可能的交互。未定义适配协议前，正式版最多关联当前构建与创作者手动选中的内容，不宣称所有游戏都能自动定位。文稿草稿与保存继续沿用现有编辑器及并发写入保护。

## Video workspace

Status: Active。用户要求继续打磨交互后开发；正式 VideoStudio 接入预览、创作画布、文稿与原生 Chat。

### Evidence and jobs

改版前 `video-studio.tsx` 提供「预览 / 产物」，已有原片、剪后画面、成片和显式载入新版能力；产物以文件与文本呈现，环境检查占据主要工作区。创作者需要边看边听、逐段调整讲法、核对原声和原片，并把反馈带回同一段 DSH 会话。

研究参考官方 [Descript 文本编辑](https://www.descript.com/transcription)、[Premiere 文本剪辑](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html)、[CapCut 文稿剪辑](https://www.capcut.com/tools/video-transcript-editing) 与 [Frame.io 时间点评论](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/share-for-review-using-frame-io/add-comments-on-shared-projects.html)。这些公开资料支持文本与预览联动、基于时间的反馈等交互；下述布局为项目设计判断，未登录实测这些产品。

### Navigation and canvas

- 主入口为「预览 / 创作画布 / 文稿」。默认大面积可播放成片与逐段解说；原生 Chat 按需展开，桌面展开时收起解说侧栏，保留单独查看稿件的入口。窄屏逐个显示播放器、稿件浮层与 Chat，面板切换只由「制作 / 对话」负责。
- 预览保留「成片 / 剪后画面 / 原片」。播放器是页面主角：项目名只在选择器出现，不另设标题；「解说稿」「讨论当前画面」放进版本栏，不另设信息栏，时间由原生控件显示，只有制作中或正在核对区间时才出现状态条。段落定位与逐段讨论都在解说稿内，解说与保留原声采用不同标识；不扩展为多轨剪辑器，不伪造波形或逐字对齐。
- 画布组织观众的疑问、原片依据、开场、转折、情绪落点、原声和可播放成片，连线说明内容关系。不是素材分析到导出的固定阶段链。节点可选择、拖动、缩放、适应视野并进入文稿与 Chat。
- 文稿按「解说稿 / 故事与表达 / 当前成片字幕」组织，来源和工具参数收进制作详情。新项目先预览原片并讨论想讲什么，不把环境安装说明当作创作首页。

### Timing and iteration

原片与输出采用不同时间基准。`narration.json` 的时间在剪辑模式下属于输出时间；原片范围需要结合 `clip_plan_validated.json` 等实际映射，以区间重叠推导，不能把解说起止直接当作原片位置。缺少可靠映射时仍可读稿和播放，隐藏或禁用原片联动，并说明尚无对应关系。画布故事关系同样需要来自实际文稿或明确的作者选择。

段落与当前画面可把版本、时间基准和文字上下文带到原生 Composer，已有草稿保持。改稿先作为草稿，现有配音和成片继续使用当前版本；制作和新版到达均不自动替换正在播放的视频。用户明确载入后才更新画面和配音。字幕预览、独立字幕文件与已烧录字幕分别表述，不暗示预览样式已写进 MP4。

### Prototype and implementation boundaries

本次本地原型位于聊天附件目录 `video-studio-demo/`，使用原创演示《青石巷来信》：48 秒原片、36 秒剪后画面、36 秒带本地合成配音的成片，以及预制的开场修改版本。六段实际剪辑映射支撑跳转与原声核对，视频和字幕可以真实下载；画面为插画组合，不代表真实影视分析或模型生成质量。草稿、导入与 Chat 为浏览器内交互演示，没有上传素材或调用外部 AI。

正式实现沿用 DSH 原生 Chat、文件、媒体路由、任务、权限和并发写入保护，不打包演示剧情或媒体，不建立第二套 runtime。workspace API 以限定文件读取与纯函数投影提供旁白、明确原声、创作摘要和可靠区间映射。未知时间基准、多源含混或映射缺口不启用定位；跨片段关系不合并为假连续区间。正式画布共用游戏区的交互引擎，布局按项目保存在 Session UI 状态。文稿逐段修改只替换原数组项的 narration 字段，保留时间和未知元数据，经共享缓冲区与 CAS 保存；文字更新标为改稿，现有配音不变。播放器在预览、画布和文稿之间保持挂载，离开预览时暂停；显式切换角色按可靠对应调整位置，新版不会自动载入。生产界面不提供原型的浏览器导入或模拟 Chat，也不添加字幕烧录状态的推断。

## Open questions

- [ ] 等宿主提供正式的消息摘要/原始内容双通道后，评估进一步收起长投产指令；当前不绕过会话 API。

- [ ] 游戏类型通用的试玩上下文：是否扩展可选的运行时消息协议，何时加入与如何限定？由后续实现评审确定，当前不作为默认能力。
