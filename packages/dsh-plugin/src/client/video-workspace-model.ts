import type { VideoNarrativeProjection, VideoNarrativeSegment, VideoTimeRange } from "../video-narrative.js";
import type { VideoPreviewAsset, VideoProjectSummary, VideoArtifactSummary } from "../video-project.js";
import type { CreativeCanvasNode, CreativeCanvasEdge } from "./creative-canvas.js";
import type { GameWorkspaceFile } from "./game-workspace-types.js";

export type VideoWorkspaceTab = "preview" | "canvas" | "docs";
export type VideoProject = VideoProjectSummary;

const CREATIVE_DOCUMENT_ORDER = [
  "EDIT_PLAN.md",
  "BRIEF.md",
  "MEDIA_NOTES.md",
  "STORYBOARD.md",
  "SCRIPT.md",
  "PROMO.md",
  "narration.json",
  "recap_story_plan.json",
  "agent_narration_brief.md",
  "visual_audio_board.json",
  "subtitles.srt",
  "subtitles.ass"
] as const;

const PRODUCTION_RECORD_ORDER = [
  "timeline.json",
  "check.json",
  "REFERENCE_NOTES.md",
  "reference_metrics.json",
  "probe.json",
  "transcript.json",
  "measure.json"
] as const;

const CANVAS_DOCUMENT_ORDER = [
  "EDIT_PLAN.md",
  "BRIEF.md",
  "MEDIA_NOTES.md",
  "STORYBOARD.md",
  "SCRIPT.md",
  "PROMO.md",
  "REFERENCE_NOTES.md",
  "recap_story_plan.json",
  "agent_narration_brief.md",
  "visual_audio_board.json"
] as const;

const DOCUMENT_TITLES: Readonly<Record<string, string>> = {
  "BRIEF.md": "需求与画幅",
  "MEDIA_NOTES.md": "素材笔记",
  "EDIT_PLAN.md": "剪辑与旁白方案",
  "PROMO.md": "宣发文案",
  "STORYBOARD.md": "分镜脚本",
  "SCRIPT.md": "解说脚本",
  "REFERENCE_NOTES.md": "参考笔记",
  "reference_metrics.json": "参考指标",
  "timeline.json": "成片时间线",
  "check.json": "成片体检",
  "probe.json": "媒体探测",
  "transcript.json": "原声转写",
  "measure.json": "配音实测",
  "narration.json": "解说稿",
  "recap_story_plan.json": "故事与表达",
  "agent_narration_brief.md": "解说方向",
  "visual_audio_board.json": "画面与声音",
  "subtitles.srt": "字幕稿",
  "subtitles.ass": "字幕样式"
};

function artifactFileName(path: string): string {
  return path.split("/").at(-1) ?? "";
}

export function videoTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function videoRange(range: { readonly start: number; readonly end: number }): string {
  return `${videoTime(range.start)}–${videoTime(range.end)}`;
}

/** Human-facing role label distinguishing v0.8.0 `preview.mp4` from legacy `edited_source.mp4`. */
export function videoPreviewLabel(asset: Pick<VideoPreviewAsset, "role" | "label" | "path" | "editedKind">): string {
  if (asset.role === "source") return "原片";
  if (asset.role === "final") return "成片";
  if (asset.editedKind === "preview" || asset.path.endsWith("/preview.mp4") || asset.label === "粗剪预览") {
    return "粗剪预览";
  }
  return asset.label === "剪后片" ? "剪后片" : "剪后画面";
}

export function videoDocumentTitle(artifact: VideoArtifactSummary): string {
  return DOCUMENT_TITLES[artifactFileName(artifact.path)] ?? artifact.label;
}

export function videoCreativeDocuments(project: VideoProject): readonly VideoArtifactSummary[] {
  const order: readonly string[] = CREATIVE_DOCUMENT_ORDER;
  return project.artifacts
    .filter((artifact) => order.includes(artifactFileName(artifact.path)))
    .sort((a, b) => order.indexOf(artifactFileName(a.path)) - order.indexOf(artifactFileName(b.path)));
}

/** Non-primary artifacts (e.g. v0.8.0 `timeline.json`, `check.json`, `REFERENCE_NOTES.md`, `reference_metrics.json`, custom `*.srt`). */
export function videoProductionRecords(project: VideoProject): readonly VideoArtifactSummary[] {
  const creativePaths = new Set(videoCreativeDocuments(project).map((artifact) => artifact.path));
  const priority: readonly string[] = PRODUCTION_RECORD_ORDER;
  const rank = (artifact: VideoArtifactSummary): number => {
    const name = artifactFileName(artifact.path);
    const index = priority.indexOf(name);
    if (index >= 0) return index;
    const lower = name.toLocaleLowerCase();
    if (lower.endsWith(".srt") || lower.endsWith(".ass")) return priority.length;
    return priority.length + 1;
  };
  return project.artifacts
    .filter((artifact) => !creativePaths.has(artifact.path))
    .sort((left, right) => rank(left) - rank(right) || left.path.localeCompare(right.path, "zh-Hans-CN"));
}

/** Preferred exportable `.srt` subtitle artifact (`subtitles.srt` first, then any project `.srt`). */
export function videoSubtitleArtifact(project: VideoProject): VideoArtifactSummary | undefined {
  return project.artifacts.find((artifact) => artifact.path.endsWith("/subtitles.srt"))
    ?? project.artifacts.find((artifact) => artifact.path.toLocaleLowerCase().endsWith(".srt"));
}

/** Changes one authored sentence and keeps timing, unknown metadata and array order intact. */
export function editVideoNarration(content: string, index: number, text: string): string | undefined {
  try {
    const rows: unknown = JSON.parse(content);
    if (!Array.isArray(rows) || index < 0 || !Number.isInteger(index)) return undefined;
    const row: unknown = rows[index];
    if (typeof row !== "object" || row === null || Array.isArray(row) || !("narration" in row) || typeof row.narration !== "string") return undefined;
    return `${JSON.stringify(rows.map((item: unknown, i: number) => i === index ? { ...row, narration: text } : item), null, 2)}\n`;
  } catch { return undefined; }
}

/** Overlay wording only when the authored row still describes the same interval. Media stays intact. */
export function videoDraftText(segment: VideoNarrativeSegment, content: string | undefined): string | undefined {
  if (segment.kind !== "narration" || segment.index === undefined || content === undefined) return segment.text;
  try {
    const rows: unknown = JSON.parse(content);
    const row: unknown = Array.isArray(rows) ? rows[segment.index] : undefined;
    if (typeof row === "object" && row !== null && "start" in row && "end" in row && row.start === segment.output.start && row.end === segment.output.end && "narration" in row && typeof row.narration === "string") return row.narration;
  } catch { /* Keep the loaded wording while a source edit is incomplete. */ }
  return segment.text;
}

export function videoSourceRange(project: VideoProject, segment: VideoNarrativeSegment, files: readonly GameWorkspaceFile[]): VideoTimeRange | undefined {
  const source = project.previews.find((asset) => asset.role === "source");
  const span = segment.sourceRanges[0];
  if (project.narrative?.authoredClock === "unknown" || source === undefined || span === undefined || segment.sourceRanges.length !== 1) return undefined;
  if (segment.sourceMapping === "identity") return span;
  if (span.sourcePath !== undefined) return source.path === span.sourcePath || source.path === `${project.root}/${span.sourcePath}` ? span : undefined;
  const sources = files.filter((file) => file.kind === "media" && file.path.startsWith(`${project.root}/sources/`));
  return span.sourceId === undefined && sources.length === 1 && sources[0]?.path === source.path ? span : undefined;
}

export interface VideoCanvasNode extends CreativeCanvasNode { readonly segment?: VideoNarrativeSegment | undefined }

export function videoCanvasModel(project: VideoProject, narrative: VideoNarrativeProjection | undefined, files: readonly GameWorkspaceFile[] = []): { readonly nodes: VideoCanvasNode[]; readonly edges: CreativeCanvasEdge[] } {
  const nodes: VideoCanvasNode[] = [];
  const canvasOrder: readonly string[] = CANVAS_DOCUMENT_ORDER;
  const documents = project.artifacts
    .filter((file) => canvasOrder.includes(artifactFileName(file.path)))
    .sort((left, right) => canvasOrder.indexOf(artifactFileName(left.path)) - canvasOrder.indexOf(artifactFileName(right.path)));
  const creative = narrative?.creative;
  const excerptSummary = [creative?.dramaticQuestion, creative?.viewerPromise, creative?.spine, creative?.endingAftertaste].filter(Boolean).join("\n");
  for (const [index, file] of documents.entries()) {
    const name = artifactFileName(file.path);
    nodes.push({
      id: `document:${file.path}`,
      kind: "brief",
      title: videoDocumentTitle(file),
      eyebrow: name === "EDIT_PLAN.md" || name === "SCRIPT.md" ? "剪辑方案" : name === "REFERENCE_NOTES.md" ? "参考拆解" : "创作想法",
      path: file.path,
      excerpt: index === 0 && excerptSummary !== "" ? excerptSummary : undefined,
      initial: { x: 50, y: 60 + index * 230 },
      width: 292,
      height: 190
    });
  }
  const source = project.previews.find((asset) => asset.role === "source");
  if (source !== undefined) {
    nodes.push({ id: "source", kind: "source", title: project.title, eyebrow: "原片", path: source.path, initial: { x: 50, y: 60 + documents.length * 230 }, width: 292, height: 282 });
  }
  const segmentPath = project.narrationPath ?? project.timelinePath;
  for (const [index, segment] of (narrative?.segments ?? []).entries()) {
    nodes.push({
      id: `segment:${segment.id}`,
      kind: segment.kind === "original" ? "world" : "concept",
      title: segment.kind === "original" ? "留给原声" : `解说第 ${String((segment.index ?? index) + 1)} 段`,
      eyebrow: `${narrative?.authoredClock === "unknown" ? "文稿时间" : "输出"} ${videoRange(segment.output)}`,
      excerpt: segment.text ?? "在这里听见原片的声音。",
      path: segmentPath,
      segment,
      initial: { x: 442 + index % 3 * 350, y: 60 + Math.floor(index / 3) * 240 },
      width: 296,
      height: 200
    });
  }
  const preview = project.previews.find((asset) => asset.role === "final") ?? project.previews.find((asset) => asset.role === "edited");
  if (preview !== undefined) {
    nodes.push({
      id: "preview",
      kind: "preview",
      title: project.title,
      eyebrow: preview.role === "final" ? "可播放成片" : videoPreviewLabel(preview),
      path: preview.path,
      initial: { x: 792, y: 80 + Math.ceil((narrative?.segments.length ?? 0) / 3) * 240 },
      width: 316,
      height: 282
    });
  }
  // Only evidence-backed source relationships. Chronological order is shown by times, not a forced pipeline.
  const edges: CreativeCanvasEdge[] = source === undefined || narrative?.authoredClock === "unknown" ? [] : nodes.flatMap((node) => {
    const span = node.segment === undefined ? undefined : videoSourceRange(project, node.segment, files);
    return span === undefined ? [] : [{ from: "source", to: node.id, label: `原片 ${videoRange(span)}` }];
  });
  return { nodes, edges };
}
