import { basename, extname } from "node:path";

export const VIDEO_DIRECTORY = "video-recaps";

export interface VideoWorkspaceFile {
  readonly path: string;
  readonly bytes: number;
  readonly version: string;
  readonly kind: "text" | "media";
  readonly mimeType?: string | undefined;
}

export interface VideoPreviewAsset {
  readonly role: "source" | "edited" | "final";
  readonly label: string;
  readonly path: string;
  readonly bytes: number;
  readonly version: string;
  readonly mimeType: string;
}

export interface VideoArtifactSummary {
  readonly label: string;
  readonly path: string;
  readonly version: string;
  readonly kind: "plan" | "script" | "subtitle" | "quality" | "manifest";
}

export interface VideoProjectSummary {
  readonly id: string;
  readonly root: string;
  readonly title: string;
  readonly state: "not-started" | "working" | "waiting" | "ready";
  readonly stage: string;
  readonly stageLabel: string;
  readonly nextArtifact?: string | undefined;
  readonly previews: readonly VideoPreviewAsset[];
  readonly artifacts: readonly VideoArtifactSummary[];
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm"]);
const SKIPPED_DIRECTORIES = new Set(["frames", "tts_segments", "asr_chunks", "chunks", "cache", "tmp", ".subtitle_measure"]);
const VISIBLE_TEXT_FILES = new Set([
  "project.json",
  "recap_run_manifest.json",
  "recap_phase.json",
  "agent_narration_brief.md",
  "recap_story_plan.json",
  "visual_audio_board.json",
  "clip_plan.json",
  "clip_plan_validated.json",
  "narration.json",
  "narration_review.md",
  "tts_meta.json",
  "timeline.json",
  "assembly_manifest.json",
  "assembly_qc.json",
  "final_qc.json",
  "final_qc.md",
  "delivery_qc.json",
  "subtitles.srt",
  "subtitles.ass"
]);

const ARTIFACT_META: Readonly<Record<string, { readonly label: string; readonly kind: VideoArtifactSummary["kind"] }>> = {
  "recap_run_manifest.json": { label: "运行清单", kind: "manifest" },
  "recap_phase.json": { label: "阶段账本", kind: "manifest" },
  "agent_narration_brief.md": { label: "解说 Brief", kind: "plan" },
  "recap_story_plan.json": { label: "故事方案", kind: "plan" },
  "visual_audio_board.json": { label: "音画方案", kind: "plan" },
  "clip_plan.json": { label: "剪辑计划", kind: "plan" },
  "clip_plan_validated.json": { label: "已校验剪辑计划", kind: "plan" },
  "narration.json": { label: "解说词", kind: "script" },
  "narration_review.md": { label: "解说复核", kind: "quality" },
  "timeline.json": { label: "成片时间线", kind: "plan" },
  "assembly_manifest.json": { label: "合成清单", kind: "manifest" },
  "assembly_qc.json": { label: "合成质检", kind: "quality" },
  "final_qc.json": { label: "最终质检", kind: "quality" },
  "final_qc.md": { label: "最终质检报告", kind: "quality" },
  "delivery_qc.json": { label: "交付质检", kind: "quality" },
  "subtitles.srt": { label: "SRT 字幕", kind: "subtitle" },
  "subtitles.ass": { label: "ASS 字幕", kind: "subtitle" }
};

export function videoProjectRoot(path: string): string | undefined {
  const parts = path.split("/");
  const name = parts[1];
  if (parts[0] !== VIDEO_DIRECTORY || name === undefined || name === "" || name === "." || name === ".." || name.startsWith(".") || name.includes("\\") || name.length > 128) return undefined;
  return `${VIDEO_DIRECTORY}/${name}`;
}

export function skipVideoDirectory(path: string): boolean {
  const parts = path.split("/");
  return parts[0] === VIDEO_DIRECTORY && parts.length >= 3 && SKIPPED_DIRECTORIES.has(parts.at(-1) ?? "");
}

export function visibleVideoPath(path: string): boolean {
  const root = videoProjectRoot(path);
  if (root === undefined || path === root) return false;
  const name = basename(path);
  const extension = extname(name).toLocaleLowerCase();
  if (VISIBLE_TEXT_FILES.has(name)) return true;
  if (!VIDEO_EXTENSIONS.has(extension)) return false;
  return path.startsWith(`${root}/sources/`)
    || path.startsWith(`${root}/outputs/`)
    || name === "edited_source.mp4"
    || /^recap_.+\.(?:mp4|mov|webm)$/iu.test(name);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function referencedMedia(files: readonly VideoWorkspaceFile[], value: unknown): VideoWorkspaceFile | undefined {
  const path = text(value)?.replaceAll("\\", "/");
  if (path === undefined) return undefined;
  const direct = files.find((file) => file.path === path || path.endsWith(`/${file.path}`));
  if (direct !== undefined) return direct;
  const name = path.split("/").at(-1);
  const matching = files.filter((file) => file.path.split("/").at(-1) === name);
  return matching.length === 1 ? matching[0] : undefined;
}

function previewAsset(file: VideoWorkspaceFile, role: VideoPreviewAsset["role"], label: string): VideoPreviewAsset | undefined {
  return file.kind === "media" && file.mimeType?.startsWith("video/") === true
    ? { role, label, path: file.path, bytes: file.bytes, version: file.version, mimeType: file.mimeType }
    : undefined;
}

export function summarizeVideoProject(
  root: string,
  files: readonly VideoWorkspaceFile[],
  metadata: {
    readonly project?: unknown;
    readonly runManifest?: unknown;
    readonly assembly?: unknown;
  } = {}
): VideoProjectSummary {
  const id = root.slice(`${VIDEO_DIRECTORY}/`.length);
  const projectFiles = files.filter((file) => file.path.startsWith(`${root}/`));
  const project = record(metadata.project);
  const manifest = record(metadata.runManifest);
  const settings = record(manifest?.settings);
  const assembly = record(metadata.assembly);
  const source = referencedMedia(projectFiles, manifest?.source_video)
    ?? projectFiles.find((file) => file.kind === "media" && file.path.startsWith(`${root}/sources/`) && file.mimeType?.startsWith("video/") === true);
  const edited = projectFiles.find((file) => file.path.split("/").at(-1) === "edited_source.mp4");
  const final = referencedMedia(projectFiles, assembly?.final_output)
    ?? projectFiles.filter((file) => file.kind === "media" && (file.path.startsWith(`${root}/outputs/`) || /^recap_.+\.(?:mp4|mov|webm)$/iu.test(file.path.split("/").at(-1) ?? ""))).at(-1);
  const previews = [
    source === undefined ? undefined : previewAsset(source, "source", "原片"),
    edited === undefined ? undefined : previewAsset(edited, "edited", "剪后片"),
    final === undefined ? undefined : previewAsset(final, "final", "最终成片")
  ].filter((value): value is VideoPreviewAsset => value !== undefined);
  const names = new Set(projectFiles.map((file) => file.path.split("/").at(-1)));
  const cutMode = settings?.edit_mode === "cut" || names.has("clip_plan.json") || edited !== undefined;
  let state: VideoProjectSummary["state"] = "not-started";
  let stage = "source";
  let stageLabel = source === undefined ? "等待导入视频" : "可以开始";
  let nextArtifact: string | undefined;
  if (final !== undefined) {
    state = "ready"; stage = "complete"; stageLabel = "成片已就绪";
  } else if (names.has("tts_meta.json")) {
    state = "working"; stage = "assemble"; stageLabel = "正在合成";
  } else if (names.has("narration.json")) {
    state = "working"; stage = "voiceover"; stageLabel = "配音与合成";
  } else if (cutMode && edited !== undefined) {
    state = "waiting"; stage = "narration"; stageLabel = "等待解说词"; nextArtifact = "narration.json";
  } else if (cutMode && names.has("clip_plan.json")) {
    state = "working"; stage = "cut"; stageLabel = "正在剪辑";
  } else if (manifest !== undefined) {
    state = "waiting";
    stage = cutMode ? "clip-plan" : "narration";
    stageLabel = cutMode ? "等待剪辑计划" : "等待解说词";
    nextArtifact = cutMode ? "clip_plan.json" : "narration.json";
  }
  const artifacts = projectFiles.flatMap((file): VideoArtifactSummary[] => {
    const name = file.path.split("/").at(-1) ?? "";
    const meta = ARTIFACT_META[name];
    return meta === undefined ? [] : [{ ...meta, path: file.path, version: file.version }];
  }).sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));
  return {
    id,
    root,
    title: text(project?.title) ?? id,
    state,
    stage,
    stageLabel,
    nextArtifact,
    previews,
    artifacts
  };
}
