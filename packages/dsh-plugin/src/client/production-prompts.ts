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
  return `/short-drama-produce

执行创作者已明确确认的成片合成任务。
- 任务 ID：${job.id}
- 剧集：${production.episodeDirectory}
- 按以下顺序合成，不得自行换序：
${orderedPaths.map((path, index) => `${String(index + 1)}. ${path}`).join("\n")}
- 输出：${production.episodeDirectory}/制作成果/成片-${job.id}.mp4

先验证输入均存在且可读，再使用当前 DSH Preset 可见的媒体/命令工具执行；音视频参数不兼容时做明确、可审计的标准化。所有命令和写入继续遵守 DSH 权限与审批，不得伪造成功。`;
}
