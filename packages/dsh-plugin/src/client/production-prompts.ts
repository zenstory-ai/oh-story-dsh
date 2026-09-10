import type { DramaEpisodeProduction } from "./drama-production.js";
import type { ProductionJob, ProductionMediaVersion } from "./production-runtime.js";

const authorityBoundary = "只使用当前 DSH Preset 可见的工具；所有文件、网络、生成和命令操作继续遵守 DSH 权限与审批。";

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
- 参考素材：
${referenceText}
- 输出目录：${production.episodeDirectory}/制作成果/${job.targetId}
- 输出文件名必须同时包含投产对象 ID 与任务 ID ${job.id}，以便 DSH 工作台关联版本。

待预检提示词：
${job.prompt}

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

把数量、逐项输出和成本边界完整展示给创作者。此按钮只表达“准备预览”，不构成看到预览后的生产确认；不得 confirm 或 run。用户在后续消息明确确认这份预览后，才可调用 oh_story_production track_job 登记同一个批次任务 ID，并运行 Provider。${authorityBoundary}`;
}

export function nativeCompositionPrompt(
  production: DramaEpisodeProduction,
  job: ProductionJob,
  orderedPaths: readonly string[]
): string {
  return `/short-drama-edit

执行创作者已明确确认的成片装配任务。
- 任务 ID：${job.id}
- 剧集：${production.episodeDirectory}
- 创作者在成片视图排定的镜序，不得自行换序：
${orderedPaths.map((path, index) => `${String(index + 1)}. ${path}`).join("\n")}
- 剪辑单：${production.episodeDirectory}/剪辑单.md
- 输出：${production.episodeDirectory}/制作成果/成片/

先写剪辑单再渲染。逐段看完素材后写下真实的入出点、取舍理由、声音处理与字幕，不要按镜序凭空填时间；字幕逐字取自剧本.md。剪辑单落盘后依次运行 edit_tool.py 的 check 与 render，check 报出的问题先改文档再重跑。缺失或不可用的素材写进「未采用镜头」并说明属于哪一类，不要退回去生成新素材，也不要改动剧本、分镜或视频提示词的语义。字幕默认走零依赖的 ffmpeg 路线；改用 Remotion 需要先安装 Node 依赖并逐帧过无头浏览器，只有创作者明确同意这次安装时才走。ffmpeg 与 ffprobe 通过当前 DSH 执行环境调用，不可用时如实报出来，不要把「没测」写成「通过」。所有命令和写入继续遵守 DSH 权限与审批，不得伪造成功。`;
}
