import type { DramaEpisodeProduction } from "./drama-production.js";
import type { ProductionJob, ProductionMediaVersion } from "./production-runtime.js";

const authorityBoundary = "只使用当前 DSH Preset 可见的工具；所有文件、网络、生成和命令操作继续遵守 DSH 权限与审批。";

/**
 * The listed references are what the workbench can see, not what the job sends: upstream
 * `prepare` requires `reference_bindings` to equal the source entry's own declaration slot for
 * slot, and a frame's role comes from the 用途 that entry's 输入参考图 records (分镜.md for SHOT-*,
 * 视频提示词.md for MOTION-*), never from this list. How a 结束帧 travels depends on the dialect:
 * frame positions keep it in last_frame, but MiniMax H3 cannot mix frame and reference inputs, so a
 * mixed group goes out whole as full-reference reference_image (upstream minimax-h3.md, and
 * target-model-profile.md 参考条件方式).
 */
const referenceRules = "参考输入以来源条目自己的声明为准（IMG-* 的「参考」，SHOT-*／MOTION-* 的「输入参考图」，以及 MOTION-* 独立的「参考音频」）：reference_bindings 必须与该条目逐槽一致，工作台列出的补充参考只作核对，条目里没有声明的不要直接加进 job，确需使用时先请拥有该条目的阶段修订文档。起始帧与结束帧的角色只取自来源条目自己「输入参考图」各槽位记录的用途（起始帧／结束帧）：SHOT-* 看《分镜.md》，MOTION-* 看《视频提示词.md》；再由目标模型方言翻成 adapter 的 role，不按文件名或工作台清单推断。目标方言用 first_frame／last_frame 位置承接这组输入时，结束帧只进 last_frame，绝不降级成普通参考图；方言要求整组走多槽参考时（如 MiniMax H3 的 full-reference：首尾帧输入与参考输入互斥，起始帧、结束帧都随整组以 reference_image 送入），按方言翻译，并在预览里写明结束帧将作为参考图送入，或先请分镜 owner 取舍。MOTION-* 的「参考音频」不混入「输入参考图」：它排在图片 binding 之后，role 固定为 reference_audio，character 逐字照抄该行「角色」，音频顺序仍独立从 1 编号；adapter profile 未显式声明支持 reference_audio 时必须在提交前失败，不能静默丢弃或把音频当图片。";
/** Upstream's SHOT-* selector extracts only the start frame, so the note belongs to image jobs alone. */
const shotStartFrameNote = "分镜.md 的 SHOT-* 只产出起始帧；要产出结束帧，先由图片提示词阶段建立独立的 IMG-* 条目再投产。";

function referenceParagraph(kind: ProductionJob["kind"]): string {
  return kind === "image" ? `${referenceRules}${shotStartFrameNote}` : referenceRules;
}

export function nativeProductionPrompt(
  production: DramaEpisodeProduction,
  job: ProductionJob,
  references: readonly ProductionMediaVersion[]
): string {
  const referenceText = references.length === 0
    ? "无"
    : references.map((item) => `${item.targetId}: ${item.path ?? item.url}`).join("\n");
  return `/short-drama-produce

只准备当前单项生产任务，不运行 Provider。
- 任务 ID：${job.id}
- 任务类型：${job.kind === "image" ? "图片/关键帧" : "镜头视频"}
- 建议 adapter 契约：${job.kind === "image" ? "gpt-image-2" : "seedance"}（实际配置与模型以当前 DSH 运行环境为准）
- 投产对象：${job.targetId}
- 创作文档目录：${production.episodeDirectory}
- 工作台列出的补充参考（不是生产输入快照）：
${referenceText}
- 输出目录：${production.episodeDirectory}/制作成果/${job.targetId}
- 输出文件名必须同时包含投产对象 ID 与任务 ID ${job.id}，以便 DSH 工作台关联版本。

待预检提示词：
${job.prompt}

${referenceParagraph(job.kind)}

按 short-drama-produce 的硬闸门建立临时 job 并执行 prepare，在 Chat 中完整展示 adapter、模型/profile、数量、参数、references、outputs 与 overwrite。此按钮只表达“准备预览”，不构成看到预览后的生产确认；不得 confirm 或 run。用户在后续消息明确确认这份预览后，才可调用 oh_story_production track_job 登记同一个任务 ID，并运行 Provider。${authorityBoundary}`;
}

export function nativeBatchPrompt(
  production: DramaEpisodeProduction,
  job: ProductionJob,
  candidates: readonly { readonly id: string; readonly prompt: string }[]
): string {
  return `/short-drama-produce

只准备当前批量生产任务，不运行 Provider。
- 批次任务 ID：${job.id}
- 任务类型：${job.kind === "image" ? "批量关键帧" : "批量镜头视频"}
- 建议 adapter 契约：${job.kind === "image" ? "gpt-image-2" : "seedance"}（实际配置与模型以当前 DSH 运行环境为准）
- 创作文档目录：${production.episodeDirectory}
- 输出根目录：${production.episodeDirectory}/制作成果
- 每个输出文件名必须包含对应镜头 ID 与批次任务 ID ${job.id}。

${candidates.map((item) => `## ${item.id}\n${item.prompt}`).join("\n\n")}

${referenceParagraph(job.kind)}

把数量、逐项输出和成本边界完整展示给创作者。此按钮只表达“准备预览”，不构成看到预览后的生产确认；不得 confirm 或 run。用户在后续消息明确确认这份预览后，才可调用 oh_story_production track_job 登记同一个批次任务 ID，并运行 Provider。${authorityBoundary}`;
}

/**
 * Upstream's edit stage owns only the 剪辑单 CUT items, the delivery spec, and what it writes under
 * 制作成果/成片/ (short-drama-edit stage-contract.md). Normalised clips therefore go to 成片/规格统一/,
 * which mediaTargetFromPath keeps out of the shot versions, and carry no job id that could correlate
 * them with a production job. An external mix ends with the loudnorm pass render itself runs
 * (edit_tool.py `_loudnorm_filter`, then AAC 192k at 48 kHz).
 */
export function nativeCompositionPrompt(
  production: DramaEpisodeProduction,
  job: ProductionJob,
  orderedSources: readonly {
    readonly shotId: string;
    readonly sourceId: string;
    readonly kind: ProductionMediaVersion["kind"];
    readonly path: string;
    readonly durationSeconds?: number | undefined;
  }[]
): string {
  return `/short-drama-edit

执行创作者已明确确认的成片装配任务。
- 任务 ID：${job.id}
- 剧集：${production.episodeDirectory}
- 创作者在成片视图排定的镜序与实际来源（自动模式已按视频优先解析；显式选源优先于自动结果），不得自行换序或替换：
${orderedSources.map((source, index) => `${String(index + 1)}. ${source.shotId} → ${source.sourceId} · ${source.kind === "video" ? "视频" : "静帧"} · ${source.path}${source.kind === "image" ? ` · 分镜时长 ${source.durationSeconds === undefined ? "未填写" : `${String(source.durationSeconds)} 秒`}` : ""}`).join("\n")}
- 剪辑单：${production.episodeDirectory}/剪辑单.md
- 输出：${production.episodeDirectory}/制作成果/成片/

先写剪辑单再渲染。逐段看完素材后写下真实的入出点、取舍理由、声音处理与字幕，不要按镜序凭空填时间；字幕逐字取自剧本.md。上面标为视频的来源使用对应 MOTION-*，标为静帧的来源逐字使用给出的 SHOT-* 或 IMG-*；静帧以列出的分镜时长为起点，但若已有配音，须先量出真实有声区间并据此排时长，不能截断台词。剪辑单记录素材取舍、入出点、后期处理与交付规格，不改写剧本、分镜或视频提示词的语义；不要退回去生成新素材。

按当前制作形态为每一镜交代下落：视频段来源写 MOTION-*；静帧段来源写分镜里的 SHOT-* 或图片提示词里的 IMG-*，不得因为省钱、失败或排队自行把视频改成静帧。存在 SHOT-* 静帧时，分镜里的每镜必须入片或列入「未采用镜头」；存在视频段时，视频提示词里的每个 MOTION-* 也必须入片或说明未采用。视频与静帧混剪时，同一镜用了 SHOT-* 可同时覆盖对应 MOTION-*，用了 MOTION-* 可同时覆盖对应 SHOT-*。未采用项写进剪辑单开头（交付规格所在处、第一个「## CUT-」之前）的一行：「- 未采用镜头：MOTION-…（理由：文件缺失——…）；SHOT-…（理由：质量不可用——…）」。多项用全角「；」连接，理由不能为空、自身不含「；」，并写明属于文件缺失、质量不可用还是叙事取舍；漏掉任何一个，check 都会阻断。

剪辑单落盘后依次运行 edit_tool.py 的 check 与 render，check 报出的问题先改文档再重跑。视频 CUT 的素材必须同宽、同高、同帧率：render 不替视频缩放或改帧率；静帧则按交付规格等比铺满、居中裁切并按运镜出画，因此只要有静帧就必须填写「画幅与帧率」。视频被 check 报出画幅或帧率不一致时，在当前 DSH 执行环境里经审批用 ffmpeg 按交付规格统一、保留构图，新文件写到 ${production.episodeDirectory}/制作成果/成片/规格统一/——这是剪辑阶段自己的中间文件，不放在生产阶段的原素材旁边、不覆盖已生产的素材，文件名也不沿用原文件里的任务 ID（可直接用 MOTION ID）；在该 CUT 下记录裁切或留边（不要写进「画面」行，它只认亮度、饱和、色温或「无」「不校」），把「来源」改指新文件，入出点随转换变化时同步修改，再重跑 check。静帧来源入点写 0.00、出点等于时长且至少 0.50 秒；需要运动时只用剪辑单支持的固定、推近、拉远或平移写法。

默认的硬字幕路线需要带 libass 的 ffmpeg，缺 libass 时如实报出，不要悄悄去掉字幕。Remotion 在项目外的 ~/.cache/short-drama-edit/remotion 里装 Node 依赖、逐帧过无头浏览器：可选的 Remotion 字幕路线要它，剪辑单里只要有「画面文字」行也必须要它；只有创作者明确同意这次安装（在该目录 npm install，0.8 之前装过的要重装一次）时才走，未同意就不写「画面文字」行，并告诉创作者画面里留给面板的空白会保持空白。剪辑单的「声音」行只是记录，render 不执行它：render 切段、静帧出画与运镜、同场景自动接镜（CUT 写了「画面」校正就替代它，「画面：不校」跳过它，交付规格写「接镜匹配：无」整集关闭）、硬拼接、混入「音效」「配音」「环境声」行、烧字幕与画面文字、可选颗粒、统一响度。配音可用负起点做 J-cut，也可跨切点做 L-cut；字幕同样可跨切点，按整条片核对不重叠且不越过结尾。「音效」「配音」「环境声」之外的混音、交叉淡入、配乐、转场或格式转换都是另一步经审批的外部 ffmpeg 处理，先写到临时文件；这一步最后要像 render 一样按剪辑单的「交付响度」对整片做两遍 loudnorm（I=交付响度、TP=-1.5、LRA=11，第二遍代入第一遍的实测值并用 linear=true），音频编码为 AAC 192k、48 kHz，然后才替换 ${production.episodeDirectory}/制作成果/成片/成片.mp4，并把命令记进剪辑单；重新 render 会覆盖成片，这些步骤要重做。最后对交付的这份成片.mp4 运行 edit_tool.py verify 并报告实测数字，「未测」项照实写未测。

ffmpeg 与 ffprobe 通过当前 DSH 执行环境调用，不可用时如实报出来，不要把「没测」写成「通过」。所有命令和写入继续遵守 DSH 权限与审批，不得伪造成功。`;
}
