import type { VideoNarrativeProjection, VideoNarrativeSegment, VideoTimeRange } from "../video-narrative.js";
import type { VideoProjectSummary, VideoArtifactSummary } from "../video-project.js";
import type { CreativeCanvasNode, CreativeCanvasEdge } from "./creative-canvas.js";
import type { GameWorkspaceFile } from "./game-workspace-types.js";

export type VideoWorkspaceTab = "preview" | "canvas" | "docs";
export type VideoProject = VideoProjectSummary;

export function videoTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function videoRange(range: { readonly start: number; readonly end: number }): string {
  return `${videoTime(range.start)}–${videoTime(range.end)}`;
}
export function videoDocumentTitle(artifact: VideoArtifactSummary): string {
  return ({ "narration.json": "解说稿", "recap_story_plan.json": "故事与表达", "agent_narration_brief.md": "解说方向", "visual_audio_board.json": "画面与声音", "subtitles.srt": "字幕稿", "subtitles.ass": "字幕样式" } as Record<string, string>)[artifact.path.split("/").at(-1) ?? ""] ?? artifact.label;
}
export function videoCreativeDocuments(project: VideoProject): readonly VideoArtifactSummary[] {
  const order = ["narration.json", "recap_story_plan.json", "agent_narration_brief.md", "visual_audio_board.json", "subtitles.srt", "subtitles.ass"];
  return project.artifacts.filter((artifact) => order.includes(artifact.path.split("/").at(-1) ?? "")).sort((a, b) => order.indexOf(a.path.split("/").at(-1) ?? "") - order.indexOf(b.path.split("/").at(-1) ?? ""));
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
  const documents = videoCreativeDocuments(project).filter((file) => file.kind === "plan");
  const creative = narrative?.creative;
  for (const [index, file] of documents.entries()) nodes.push({
    id: `document:${file.path}`, kind: "brief", title: videoDocumentTitle(file), eyebrow: "创作想法", path: file.path,
    excerpt: index === 0 ? [creative?.dramaticQuestion, creative?.viewerPromise, creative?.spine, creative?.endingAftertaste].filter(Boolean).join("\n") : undefined,
    initial: { x: 50, y: 60 + index * 230 }, width: 292, height: 190
  });
  const source = project.previews.find((asset) => asset.role === "source");
  if (source !== undefined) nodes.push({ id: "source", kind: "source", title: project.title, eyebrow: "原片", path: source.path, excerpt: "回到原片，核对画面与声音。", initial: { x: 50, y: 60 + documents.length * 230 }, width: 292, height: 300 });
  for (const [index, segment] of (narrative?.segments ?? []).entries()) nodes.push({
    id: `segment:${segment.id}`, kind: segment.kind === "original" ? "world" : "concept", title: segment.kind === "original" ? "留给原声" : `解说第 ${String((segment.index ?? index) + 1)} 段`,
    eyebrow: `${narrative?.authoredClock === "unknown" ? "文稿时间" : "输出"} ${videoRange(segment.output)}`, excerpt: segment.text ?? "在这里听见原片的声音。", path: project.narrationPath, segment,
    initial: { x: 442 + index % 3 * 350, y: 60 + Math.floor(index / 3) * 240 }, width: 296, height: 200
  });
  const preview = project.previews.find((asset) => asset.role === "final") ?? project.previews.find((asset) => asset.role === "edited");
  if (preview !== undefined) nodes.push({ id: "preview", kind: "preview", title: project.title, eyebrow: preview.role === "final" ? "可播放成片" : "剪后画面", path: preview.path, excerpt: "回到预览，听一遍完整的节奏。", initial: { x: 792, y: 80 + Math.ceil((narrative?.segments.length ?? 0) / 3) * 240 }, width: 316, height: 300 });
  // Only evidence-backed source relationships. Chronological order is shown by times, not a forced pipeline.
  const edges: CreativeCanvasEdge[] = source === undefined || narrative?.authoredClock === "unknown" ? [] : nodes.flatMap((node) => {
    const span = node.segment === undefined ? undefined : videoSourceRange(project, node.segment, files);
    return span === undefined ? [] : [{ from: "source", to: node.id, label: `原片 ${videoRange(span)}` }];
  });
  return { nodes, edges };
}
