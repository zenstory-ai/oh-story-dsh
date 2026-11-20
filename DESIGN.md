# Design

## Source of truth

Status: Active
Date: 2026-11-17
Surface: DSH 插件的短剧、游戏、视频工作台与共用工作台设置。

已采纳 DSH 浅色无限画布方案：流程顺手、主界面不堆技术参数、沿用原生 DSH 视觉风格；固定步骤向导与独立深色外壳均不采用。视觉参考来自 `drama-studio-demo/evidence/08-dsh-plugin-canvas.png`，现状基线为原生 DSH 上的 22 张场景截图。设计边界遵循 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 与[无限画布决策](.agents/notes/implemented/feature/2026-10-08-infinite-drama-canvas.md)。外部画布交互参考了公开文档（[即梦生成画布](https://jimeng.jianying.com/ai-tool/home?createTab=canvas)、[FLORA Canvas](https://docs.flora.ai/editor/canvas)、[Krea Nodes](https://www.krea.ai/blog/multiplayer-nodes)，仅看官方公开页面，未登录实测）。

## Brand

Oh Story 以 DSH 内置工作台的形式出现，直接复用 DSH 的主题、字体、按钮与会话导航。作品画面是视觉重心，操作栏保持熟悉、克制，不另做独立品牌外壳、强制阶段向导或第二套对话界面。

## Product goals

让创作者在同一空间里串看故事、角色、场景、镜头和已生成的媒体，随时对比版本并回到对话继续打磨：默认进入就能看清全局画布，切去文稿或原生 Chat 顺手，准备预览与实际跑完的媒体区分清楚。

不新增后台数据库、第二套 Agent Runtime、供应商配置表单或重型剪辑器。短剧改版不影响小说、游戏、视频的既有流程。

## Personas and jobs

短剧与漫剧创作者：理清本集脉络、盯住跨镜人物与场景一致性、对比不同镜头版本、在原生 Chat 里讨论改法，并在核对预览后明确确认投产。

## Information architecture

短剧采用按集隔离的工作区：工作台页卡、剧集切换、「制作 / 文稿」视图、可收起的文稿目录与原生 Chat。默认打开「制作」区的无限画布，直接读取并展示本集已有的五份 Markdown 文档与本地媒体；同区的「画布 / 素材 / 生成记录 / 成片」与辅助「镜头清单」从不同角度查看同一份项目文件，随时可跳回原文。

四个工作台页卡旁统一提供「工作台设置」，通过复选框显示或隐藏小说、短剧、游戏、视频页卡（至少保留一项，支持一键「显示全部」）。修改即时生效，按当前浏览器的工作区保存；隐藏页卡不会删文件、停用 Skills、丢草稿或打断已挂载媒体。隐藏当前页卡时自动切到剩余第一项，启动识别与 Agent 文件跟随也不会重新翻出已隐藏页卡。收起整个工作台仍用顶栏 `×` 与角落浮动按钮，与页卡显隐互不干扰。

设置面板同时说清模型与 API 的归属：对话模型与 Key 在 DSH 设置里管理；生图、生视频、配音与配乐走各制作工具的本机环境变量，不会复用对话模型。面板本身不存密钥，也不改 DSH 配置（见 [#112](https://github.com/zenstory-ai/oh-story-dsh/issues/112)、`workbench-mode-tabs.tsx` 与 `workbench-presence.ts`）。

## Design principles

- 工作区里的本地文稿和媒体文件就是作品本身，画布直接读取并展示。
- 画布卡片坐标与缩放视野只作为按集隔离的会话界面状态保存。
- 卡片就地提供准备入口，选中后浮出关联操作；优先展示角色/镜头名、媒体画面与下一步动作，内部 ID 收进详情。
- 付费媒体一律先在对话里生成参数预览，经创作者明确确认后才真正调用外部接口，画布点击本身不算确认。
- 原生 Chat 与输入框始终保持挂载，收起只改布局宽度，带上下文进对话时绝不覆盖已有输入草稿与附件。

## Visual language

直接沿用 DSH 的 `--dsw-*` 主题变量，浅色与深色模式随 DSH 同步切换：细点阵画布、DSH 底色卡片、品牌蓝选中框、轻边框、6–10px 圆角与系统默认字体。卡片只展示项目真实媒体，不打包原型演示剧情或占位图；技术 ID 与源文件路径收在按需展开的详情里。

## Components

短剧顶栏、剧集下拉、文稿目录开关、原生 Chat 开关、故事/素材/镜头节点卡、真实图片与视频预览及版本切换条、语义连线、底部选中操作条、缩放与适应控件、生成记录、制作详情及成片顺序面板。

## Accessibility

工具栏采用标准按钮、下拉框与 `tablist`，键盘焦点清晰可见；画布节点支持键盘选中、回车打开原文、方向键微调位置，画布支持键盘平移与按钮缩放/适应，视频使用浏览器原生播放控件，拖拽热区不遮挡内部按钮与播放器控件。

「工作台设置」使用原生模态 `<dialog>`、带标签复选框与关闭按钮：`Escape` 关闭并将焦点退回当前可见的设置按钮；页卡栏方向键与 `Home` / `End` 只在可见页卡间移动；仅剩最后一个可见页卡时禁用取消勾选。窄屏下弹窗在视口内纵向滚动。

## Responsive behavior

桌面端以画布为主，文稿目录和原生 Chat 按需展开；窄屏下画布与 Chat 作为同一会话内可切换的两块面板，保证输入框和投产确认随时可点。其他工作台的响应式断点保持不变。

## Interaction states

覆盖加载中、仅有剧本尚无分镜、尚无媒体、已有图片/视频、多版本切换、未配供应商 Key、文档断链提醒、等待确认、生成中、已取消、状态待核对、本地草稿冲突与跨集切换。只有工作区实际保存到文件并关联上的媒体才显示为生成完成。

## Content voice

主界面统一使用「故事、角色、场景、镜头、画面、视频、版本、生成记录、制作详情」等日常创作词汇，不在主按钮上堆供应商参数、Python 路径或任务 UUID。由于当前 DSH 仅开放 `conversation.send(text)`，发往对话的完整预检指令原样保留在原生 Chat 中，工作台卡片只展示简明状态。

## Implementation constraints

基于 React 18 与 DSH 官方 Browser 插槽实现，复用 Session Store、`ConversationController` 与既有媒体路由，不加第三方依赖，不改固定上游知识资产。通过定向单测、`pnpm verify` 与隔离官方 DSH Web 的打包 Chrome 集成测试验证。

## Game workspace

Status: Active。正式插件围绕 `game-adaptations/<project>/` 提供「试玩 / 创作画布 / 文稿」，不打包原型演示剧情与图片。

### Evidence and jobs

`GamePreview` 提供独立沙箱 iframe 试玩、手动载入新版本、全屏切换与进度保留；项目文件结构遵循上游 NovelToGame 契约（简报、原著拆解、概念、玩法设计、美术方向、构建产物与独立 QA 记录），不另建数据库。界面布局参考了 [GDevelop](https://wiki.gdevelop.io/gdevelop5/interface/)、[Twine](https://www.twinery.org/cookbook/introduction/twine2_passages_view.html) 与 [Inky](https://github.com/inkle/inky) 的公开文档（多视角观察、节点连线与边改边玩，未登录实测）。

### Navigation and canvas

- 顶栏提供「试玩 / 创作画布 / 文稿」三项切换。已有可玩构建时默认展开大面积试玩；切到创作画布时自动收起右侧 Chat，给原著依据、世界观、角色、玩法、美术和试玩入口留足视野。
- 画布自由表达内容关联，不做成强制线性关卡向导。节点直接对应已有 Markdown 文稿（及其中明确小节）与真实 `build/app/` 构建，节点坐标和缩放视野保存在当前会话状态里。
- 首次打开画布自动居中取景，之后保留用户调整过的位置；文稿导航显示直观中文标题，底层相对路径收在折叠详情里。
- 桌面端左侧试玩、右侧原生 Chat 并排且可收起 Chat；窄屏下由顶栏「制作 / 对话」单选切换，试玩 iframe 与 Chat 均保持挂载不重载。

### Iteration and feedback

围绕「试玩 → 聊改法 → 再试玩」循环运转：试玩反馈直接发进原生 Chat，不再单设笔记接口；工程里已有的 `PLAYTEST_NOTES.md` 作为普通文件放在「更多项目文件」中查看编辑。带选中内容去 Chat 时保留输入框原有草稿。项目名称统一由顶栏下拉框展示，试玩区不再重复标题。

Agent 重新构建期间，左侧继续运行旧版可玩画面；新版就绪后仅提示「新的试玩版本已准备好」，由创作者主动点击「载入新版本」，避免自动刷新冲掉试玩进度。

自动化 QA 继续由后台 `/game-qa` 与 `qa/verification.json` 承担，主界面不设 QA 页卡、通过率徽章或评分卡。尚无游戏工程时直接用日常语言聊想法，不把命令行或目录结构摆上空状态首页。

### Prototype and implementation boundaries

早期静态原型（`game-studio-demo/dist/`，《青石巷来信》）仅用于确认版式与交互关系，其本地模拟对话和跳场消息不进入正式包。正式插件完全接入 DSH 原生 Chat、文件读写、CAS 版本校验与双回环地址隔离沙箱；在没有通用运行时通信协议前，不假定任意网页游戏都能上报当前场景或外部跳关。

## Video workspace

Status: Active。正式 `VideoStudio` 围绕 `video-recaps/<project>/` 提供「预览 / 创作画布 / 文稿」并与原生 Chat 联动。

### Evidence and jobs

创作者的核心工作是边看成片边顺解说词、核对保留的原片台词、跳回原片确认画面，再把修改意见带回当前 DSH 会话。交互设计参考了 [Descript](https://www.descript.com/transcription)、[Premiere 文本剪辑](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html)、[CapCut 文稿剪辑](https://www.capcut.com/tools/video-transcript-editing) 与 [Frame.io](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/share-for-review-using-frame-io/add-comments-on-shared-projects.html) 的公开说明（未登录实测）。

### Navigation and canvas

- 主视图切换为「预览 / 创作画布 / 文稿」。默认突出播放器与分段解说稿；桌面端展开原生 Chat 时自动收起解说侧栏，窄屏下统一由「制作 / 对话」切换面板。
- 预览区支持切换「成片 / 剪后画面 / 原片」，版本栏直接放置「解说稿」「讨论当前画面」「导出视频」与全屏按钮，不叠多余标题栏，仅在后台制作中或核对片段区间时显示简短状态提示。分段列表区分旁白与保留原声，不扩成多轨时间线，也不伪造音频波形或逐字时间轴。
- 创作画布把核心悬念、原片依据、开场钩子、转折、情绪落点、保留原声和成片预览连成关系图，共用游戏画布交互引擎，双击即可定位播放或打开对应文稿。
- 文稿区按创作含义整理「解说稿 / 故事与表达 / 当前成片字幕」等文档，底层运行清单与环境自检收进「制作详情」弹窗；空项目首页引导讨论素材和讲法，不拿环境安装步骤当首页。

### Timing and iteration

输出成片与原片分属两套时间轴：剪辑模式下 `narration.json` 记录的是成片时间，跳回原片必须依据 `clip_plan_validated.json` 等已校验映射按区间重叠换算；遇到时间基准未知、一段跨多处原片或映射缺失时禁用原片跳转并如实提示，绝不硬凑假时间点。

点击任意解说段或「讨论当前画面」可把当前版本、时间区间和文本带去原生 Chat（保留输入框已有草稿）。在文稿区逐段改写解说词只更新 `narration.json` 对应字段的文字，保留原有起止时间与其他元数据，走共享缓冲区与 CAS 原子保存；改完文字标为草稿，不会自动重跑配音或替换正在播放的视频，新成片生成后同样由创作者手动点击「载入新版本」。外挂字幕下载与硬字幕烧录分开表述，不把界面文字预览暗示成已烧进视频画面。

### Prototype and implementation boundaries

早期本地原型（`video-studio-demo/`）仅作交互审阅，不随包分发。正式插件复用 DSH 原生会话、受限文件与字节流媒体路由、权限审批及并发写保护；播放器在切去画布或文稿时自动暂停但保持挂载，切回继续查看。

## Open questions

- [ ] 待 DSH 开放正式的「简短界面摘要 / 完整发送指令」双通道接口后，评估收起对话流里的长篇投产预检提示词；在那之前不绕过官方会话 API。
- [ ] 是否为网页游戏定义可选的轻量试玩消息协议（如上报当前章节或读档点），留待后续需求明确时单独评审，当前不作默认假设。
