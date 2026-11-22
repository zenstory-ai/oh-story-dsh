import { basename, extname } from "node:path";
import { VIDEO_DIRECTORY } from "./creative-paths.js";
import { projectVideoNarrative, type VideoNarrativeProjection, type VideoTimelineClip } from "./video-narrative.js";

export { VIDEO_DIRECTORY };
export type {
  VideoCreativeSummary,
  VideoNarrativeKind,
  VideoNarrativeProjection,
  VideoNarrativeSegment,
  VideoTimelineClip,
  VideoTimeRange
} from "./video-narrative.js";

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
  /** Distinguishes Video Recap 0.8.0 `preview.mp4` ("preview") from legacy `edited_source.mp4` ("edited"). */
  readonly editedKind?: "preview" | "edited" | undefined;
}

export interface VideoArtifactSummary {
  readonly label: string;
  readonly path: string;
  readonly version: string;
  readonly kind: "plan" | "script" | "subtitle" | "quality" | "manifest";
}

export type VideoCheckItemStatus = "pass" | "warn" | "fail" | "skip";

export interface VideoQualityCheckItem {
  readonly key: string;
  readonly label: string;
  readonly status: VideoCheckItemStatus;
  readonly detail: string;
}

export interface VideoQualityReviewHint {
  readonly check: string;
  readonly code: string;
  readonly label: string;
  readonly message: string;
  readonly severity: "warn" | "fail";
  readonly timestamp?: number | undefined;
  readonly endTimestamp?: number | undefined;
}

export interface VideoQualityCheckSummary {
  readonly ok: boolean;
  readonly status: "pass" | "warn" | "fail";
  readonly summary: string;
  readonly checks: readonly VideoQualityCheckItem[];
  readonly reviewHints: readonly VideoQualityReviewHint[];
  readonly path?: string | undefined;
  readonly version?: string | undefined;
}

export interface VideoProjectSummary {
  readonly id: string;
  readonly root: string;
  readonly title: string;
  readonly state: "not-started" | "working" | "waiting" | "ready";
  readonly stage: string;
  readonly stageLabel: string;
  readonly nextArtifact?: string | undefined;
  readonly editedKind?: "preview" | "edited" | undefined;
  readonly previews: readonly VideoPreviewAsset[];
  readonly artifacts: readonly VideoArtifactSummary[];
  readonly narrative?: VideoNarrativeProjection | undefined;
  readonly qualityCheck?: VideoQualityCheckSummary | undefined;
  readonly narrationPath?: string | undefined;
  readonly narrationVersion?: string | undefined;
  readonly timelinePath?: string | undefined;
  readonly timelineVersion?: string | undefined;
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm"]);
const SUBTITLE_EXTENSIONS = new Set([".srt", ".ass"]);
const SKIPPED_DIRECTORIES = new Set(["frames", "tts_segments", "asr_chunks", "chunks", "cache", "tmp", ".subtitle_measure"]);
const VISIBLE_TEXT_FILES = new Set([
  "project.json",
  // Video Recap 0.8.0 creative Markdown workspace + timeline v3 + check.json v1 + video-reference
  "BRIEF.md",
  "MEDIA_NOTES.md",
  "EDIT_PLAN.md",
  "PROMO.md",
  "STORYBOARD.md",
  "SCRIPT.md",
  "REFERENCE_NOTES.md",
  "reference_metrics.json",
  "check.json",
  "probe.json",
  "transcript.json",
  "measure.json",
  // Legacy pre-0.8.0 artifacts (kept read-compatible for existing projects)
  "recap_run_manifest.json",
  "recap_phase.json",
  "agent_narration_brief.md",
  "recap_story_plan.json",
  "production_reference.json",
  "reference_measurements.json",
  "reference_breakdown.json",
  "visual_audio_board.json",
  "clip_plan.json",
  "clip_plan_validated.json",
  "narration.json",
  "narration_lint.json",
  "packaging_plan.json",
  "promo_copy.json",
  "sfx_plan.json",
  "original_subtitles.json",
  "tts_meta.json",
  "timeline.json",
  "assembly_manifest.json",
  "assembly_qc.json",
  "final_qc.json",
  "final_qc.md",
  "shot_review.json",
  "delivery_qc.json",
  "cut_delivery_qc.json",
  "recap_project.json",
  "resource_lock.json",
  "subtitles.srt",
  "subtitles.ass"
]);

const ARTIFACT_META: Readonly<Record<string, { readonly label: string; readonly kind: VideoArtifactSummary["kind"] }>> = {
  "BRIEF.md": { label: "需求与画幅", kind: "plan" },
  "MEDIA_NOTES.md": { label: "素材笔记", kind: "plan" },
  "EDIT_PLAN.md": { label: "剪辑与旁白方案", kind: "script" },
  "PROMO.md": { label: "宣发文案", kind: "plan" },
  "STORYBOARD.md": { label: "分镜脚本", kind: "plan" },
  "SCRIPT.md": { label: "解说脚本", kind: "script" },
  "REFERENCE_NOTES.md": { label: "参考笔记", kind: "plan" },
  "reference_metrics.json": { label: "参考指标", kind: "quality" },
  "check.json": { label: "成片体检", kind: "quality" },
  "probe.json": { label: "媒体探测", kind: "manifest" },
  "transcript.json": { label: "原声转写", kind: "subtitle" },
  "measure.json": { label: "配音实测", kind: "quality" },
  "recap_run_manifest.json": { label: "运行清单", kind: "manifest" },
  "recap_phase.json": { label: "阶段账本", kind: "manifest" },
  "agent_narration_brief.md": { label: "解说 Brief", kind: "plan" },
  "recap_story_plan.json": { label: "故事方案", kind: "plan" },
  "production_reference.json": { label: "制作参考", kind: "plan" },
  "reference_measurements.json": { label: "参考测量", kind: "quality" },
  "reference_breakdown.json": { label: "参考拆解", kind: "plan" },
  "visual_audio_board.json": { label: "音画方案", kind: "plan" },
  "clip_plan.json": { label: "剪辑计划", kind: "plan" },
  "clip_plan_validated.json": { label: "已校验剪辑计划", kind: "plan" },
  "narration.json": { label: "解说词", kind: "script" },
  "narration_lint.json": { label: "解说词校验", kind: "quality" },
  "packaging_plan.json": { label: "包装方案", kind: "plan" },
  "promo_copy.json": { label: "宣发文案", kind: "plan" },
  "sfx_plan.json": { label: "音效方案", kind: "plan" },
  "original_subtitles.json": { label: "原声字幕", kind: "subtitle" },
  "timeline.json": { label: "成片时间线", kind: "plan" },
  "assembly_manifest.json": { label: "合成清单", kind: "manifest" },
  "assembly_qc.json": { label: "合成质检", kind: "quality" },
  "final_qc.json": { label: "最终质检", kind: "quality" },
  "final_qc.md": { label: "最终质检报告", kind: "quality" },
  "shot_review.json": { label: "镜头复核", kind: "quality" },
  "delivery_qc.json": { label: "交付质检", kind: "quality" },
  "cut_delivery_qc.json": { label: "剪后片质检", kind: "quality" },
  "recap_project.json": { label: "项目绑定", kind: "manifest" },
  "resource_lock.json": { label: "资源锁定", kind: "manifest" },
  "subtitles.srt": { label: "SRT 字幕", kind: "subtitle" },
  "subtitles.ass": { label: "ASS 字幕", kind: "subtitle" }
};

const CHECK_LABELS: Readonly<Record<string, string>> = {
  container_valid: "容器格式",
  decode_integrity: "解码完整性",
  geometry_and_cfr: "画幅与帧率",
  av_sync: "音画同步",
  audio_health: "音频响度与边缘",
  visual_health: "画面黑屏与定格",
  subtitle_and_timing: "字幕与旁白时序"
};

const REVIEW_HINT_LABELS: Readonly<Record<string, string>> = {
  black_span: "黑屏片段",
  freeze_span: "画面定格",
  dead_air: "长时间静音",
  near_silent_audio: "整体音量过低",
  edge_speech_truncation: "切点人声截断",
  narration_bed_audio_leak: "旁白底噪残留",
  flash_sliver: "极短闪帧",
  subtitle_overlap: "字幕重叠",
  narration_overlap: "旁白重叠",
  subtitle_past_video_end: "字幕超出片尾"
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
  if (VISIBLE_TEXT_FILES.has(name) || SUBTITLE_EXTENSIONS.has(extension)) return true;
  if (!VIDEO_EXTENSIONS.has(extension)) return false;
  return path.startsWith(`${root}/sources/`)
    || path.startsWith(`${root}/outputs/`)
    || path.startsWith(`${root}/work/out/`)
    || path.startsWith(`${root}/out/`)
    || name === "edited_source.mp4"
    || name === "preview.mp4"
    || name === "final.mp4"
    || /^recap_.+\.(?:mp4|mov|webm)$/iu.test(name);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function markdownHeading(content: string | undefined): string | undefined {
  if (content === undefined) return undefined;
  const line = content.split(/\r?\n/u).find((row) => /^#\s+/u.test(row));
  const cleaned = line?.replace(/^#\s+/u, "").trim();
  return cleaned === undefined || cleaned === "" ? undefined : cleaned;
}

function referencedMedia(files: readonly VideoWorkspaceFile[], value: unknown): VideoWorkspaceFile | undefined {
  const raw = text(value)?.replaceAll("\\", "/");
  if (raw === undefined) return undefined;
  const normalized = raw.replace(/^(?:\.\.\/)+/u, "").replace(/^\.\//u, "");
  const direct = files.find((file) =>
    file.path === raw
    || file.path === normalized
    || raw.endsWith(`/${file.path}`)
    || file.path.endsWith(`/${normalized}`)
  );
  if (direct !== undefined) return direct;
  const name = raw.split("/").at(-1);
  const matching = files.filter((file) => file.path.split("/").at(-1) === name);
  return matching.length === 1 ? matching[0] : undefined;
}

function previewAsset(
  file: VideoWorkspaceFile,
  role: VideoPreviewAsset["role"],
  label: string,
  editedKind?: "preview" | "edited"
): VideoPreviewAsset | undefined {
  return file.kind === "media" && file.mimeType?.startsWith("video/") === true
    ? {
        role,
        label,
        path: file.path,
        bytes: file.bytes,
        version: file.version,
        mimeType: file.mimeType,
        ...(editedKind === undefined ? {} : { editedKind })
      }
    : undefined;
}

function formatSec(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded)}s`;
}

function normalizeCheckStatus(value: unknown): VideoCheckItemStatus {
  return value === "pass" || value === "warn" || value === "fail" || value === "skip" ? value : "skip";
}

function reviewHintMessage(code: string, hint: Record<string, unknown>, timestamp?: number, endTimestamp?: number): string {
  const explicit = text(hint.detail);
  if (explicit !== undefined) return explicit;
  switch (code) {
    case "black_span":
      return timestamp !== undefined && endTimestamp !== undefined
        ? `${formatSec(timestamp)}–${formatSec(endTimestamp)} 检测到黑屏（${formatSec(finiteNumber(hint.duration) ?? (endTimestamp - timestamp))}）`
        : "检测到黑屏片段";
    case "freeze_span":
      return timestamp !== undefined && endTimestamp !== undefined
        ? `${formatSec(timestamp)}–${formatSec(endTimestamp)} 检测到画面定格（${formatSec(finiteNumber(hint.duration) ?? (endTimestamp - timestamp))}）`
        : "检测到画面定格";
    case "edge_speech_truncation": {
      const clipId = text(hint.clip_id);
      const edge = hint.edge === "out" ? "出点" : "入点";
      return `${clipId ?? "镜头"}${edge}疑似切到人声`;
    }
    case "narration_bed_audio_leak": {
      const clipId = text(hint.clip_id);
      const tail = finiteNumber(hint.tail_s);
      return `${clipId ?? "镜头"}在旁白结束后仍有原声残留${tail === undefined ? "" : `（${formatSec(tail)}）`}`;
    }
    case "flash_sliver": {
      const clipId = text(hint.id) ?? text(hint.clip_id);
      const dur = finiteNumber(hint.duration_s);
      return `${clipId ?? "镜头"}时长过短${dur === undefined ? "" : `（${formatSec(dur)}）`}`;
    }
    default:
      return REVIEW_HINT_LABELS[code] ?? code;
  }
}

/** Parse Video Recap 0.8.0 `check.json` v1 into a structured summary for the studio UI. */
export function parseVideoQualityCheck(
  value: unknown,
  options: {
    readonly clips?: readonly VideoTimelineClip[] | undefined;
    readonly path?: string | undefined;
    readonly version?: string | undefined;
  } = {}
): VideoQualityCheckSummary | undefined {
  const doc = record(value);
  const rawChecks = record(doc?.checks);
  if (doc === undefined || rawChecks === undefined) return undefined;

  const clipMap = new Map<string, VideoTimelineClip>();
  for (const clip of options.clips ?? []) clipMap.set(clip.id, clip);

  const checks: VideoQualityCheckItem[] = [];
  for (const [key, entry] of Object.entries(rawChecks)) {
    const item = record(entry);
    if (item === undefined) continue;
    checks.push({
      key,
      label: CHECK_LABELS[key] ?? key,
      status: normalizeCheckStatus(item.status),
      detail: text(item.detail) ?? ""
    });
  }
  if (checks.length === 0) return undefined;

  const checkStatusMap = new Map(checks.map((item) => [item.key, item.status]));
  const rawHints = Array.isArray(doc.review_hints) ? doc.review_hints : [];
  const reviewHints: VideoQualityReviewHint[] = [];
  for (const candidate of rawHints) {
    const hint = record(candidate);
    if (hint === undefined) continue;
    const check = text(hint.check) ?? "general";
    const code = text(hint.code) ?? "warning";
    const clipId = text(hint.clip_id) ?? text(hint.id);
    const clip = clipId === undefined ? undefined : clipMap.get(clipId);
    let timestamp = finiteNumber(hint.start) ?? finiteNumber(hint.at) ?? finiteNumber(hint.video_end) ?? finiteNumber(hint.end);
    let endTimestamp = finiteNumber(hint.end);
    if (timestamp === undefined && clip !== undefined) {
      timestamp = hint.edge === "out" ? clip.output.end : clip.output.start;
      endTimestamp ??= clip.output.end;
    }
    const severity: "warn" | "fail" = checkStatusMap.get(check) === "fail" ? "fail" : "warn";
    reviewHints.push({
      check,
      code,
      label: REVIEW_HINT_LABELS[code] ?? code,
      message: reviewHintMessage(code, hint, timestamp, endTimestamp),
      severity,
      timestamp,
      endTimestamp: endTimestamp !== undefined && timestamp !== undefined && endTimestamp > timestamp ? endTimestamp : undefined
    });
  }

  const failedCount = checks.filter((item) => item.status === "fail").length;
  const ok = doc.ok === false ? false : failedCount === 0;
  const hasWarn = reviewHints.length > 0 || checks.some((item) => item.status === "warn");
  const status: VideoQualityCheckSummary["status"] = !ok ? "fail" : hasWarn ? "warn" : "pass";
  const summary = status === "fail"
    ? `物理体检未通过（${String(Math.max(1, failedCount))} 项失败）`
    : status === "warn"
      ? `物理体检通过，${String(reviewHints.length > 0 ? reviewHints.length : checks.filter((item) => item.status === "warn").length)} 条待复核`
      : `${String(checks.filter((item) => item.status === "pass").length)} 项体检通过`;

  return {
    ok,
    status,
    summary,
    checks,
    reviewHints,
    path: options.path,
    version: options.version
  };
}

export function summarizeVideoProject(
  root: string,
  files: readonly VideoWorkspaceFile[],
  metadata: {
    readonly project?: unknown;
    readonly runManifest?: unknown;
    readonly assembly?: unknown;
    readonly narration?: unknown;
    readonly validatedClips?: unknown;
    readonly visualAudioBoard?: unknown;
    readonly storyPlan?: unknown;
    readonly timeline?: unknown;
    readonly qualityCheck?: unknown;
    readonly storyboard?: string | undefined;
    readonly script?: string | undefined;
  } = {}
): VideoProjectSummary {
  const id = root.slice(`${VIDEO_DIRECTORY}/`.length);
  const projectFiles = files.filter((file) => file.path.startsWith(`${root}/`));
  const project = record(metadata.project);
  const manifest = record(metadata.runManifest);
  const settings = record(manifest?.settings);
  const assembly = record(metadata.assembly);
  const timeline = record(metadata.timeline);
  const timelineMeta = record(timeline?.meta);
  const timelineSources = record(timeline?.sources);

  const timelineFirstSource = timelineSources === undefined
    ? undefined
    : Object.values(timelineSources).map((raw) => referencedMedia(projectFiles, raw)).find((item) => item !== undefined);
  const source = referencedMedia(projectFiles, manifest?.source_video)
    ?? timelineFirstSource
    ?? projectFiles.find((file) => file.kind === "media" && file.path.startsWith(`${root}/sources/`) && file.mimeType?.startsWith("video/") === true);

  const previewFile = projectFiles.find((file) => file.kind === "media" && file.path.split("/").at(-1) === "preview.mp4");
  const legacyEditedFile = projectFiles.find((file) => file.kind === "media" && file.path.split("/").at(-1) === "edited_source.mp4");
  const edited = previewFile ?? legacyEditedFile;
  const editedKind: "preview" | "edited" | undefined = previewFile !== undefined ? "preview" : legacyEditedFile !== undefined ? "edited" : undefined;

  const finalCandidates = projectFiles.filter((file) => {
    const name = file.path.split("/").at(-1) ?? "";
    if (file.kind !== "media" || file.mimeType?.startsWith("video/") !== true) return false;
    if (name === "preview.mp4" || name === "edited_source.mp4") return false;
    return file.path.startsWith(`${root}/outputs/`)
      || file.path.startsWith(`${root}/work/out/`)
      || file.path.startsWith(`${root}/out/`)
      || name === "final.mp4"
      || /^recap_.+\.(?:mp4|mov|webm)$/iu.test(name);
  });
  const final = referencedMedia(projectFiles, assembly?.final_output)
    ?? finalCandidates.find((file) => file.path.split("/").at(-1) === "final.mp4")
    ?? finalCandidates.at(-1);

  const previews = [
    source === undefined ? undefined : previewAsset(source, "source", "原片"),
    edited === undefined ? undefined : previewAsset(edited, "edited", editedKind === "preview" ? "粗剪预览" : "剪后片", editedKind),
    final === undefined ? undefined : previewAsset(final, "final", "最终成片")
  ].filter((value): value is VideoPreviewAsset => value !== undefined);

  const names = new Set(projectFiles.map((file) => file.path.split("/").at(-1)));
  const cutMode = settings?.edit_mode === "cut" || names.has("clip_plan.json") || edited !== undefined;
  // The run manifest records --audio-mode (0.7.0: narration or source-mix); source-mix never writes
  // narration, so a cut goes straight from edited_source.mp4 to assembly and full has no pause at all.
  const narrated = (text(record(manifest?.audio)?.mode) ?? "narration") === "narration";
  let state: VideoProjectSummary["state"] = "not-started";
  let stage = "source";
  let stageLabel = source === undefined ? "等待导入视频" : "可以开始";
  let nextArtifact: string | undefined;
  if (final !== undefined) {
    state = "ready"; stage = "complete"; stageLabel = "成片已就绪";
  } else if (names.has("tts_meta.json") || names.has("measure.json")) {
    state = "working"; stage = "assemble"; stageLabel = "正在合成";
  } else if (names.has("timeline.json")) {
    state = "working"; stage = "assemble"; stageLabel = "已建时间线";
  } else if (names.has("narration.json") || names.has("EDIT_PLAN.md")) {
    state = "working"; stage = "voiceover"; stageLabel = "配音与合成";
  } else if (names.has("BRIEF.md") || names.has("MEDIA_NOTES.md")) {
    state = "working"; stage = "plan"; stageLabel = "方案与选镜";
  } else if (cutMode && edited !== undefined) {
    if (narrated) { state = "waiting"; stage = "narration"; stageLabel = "等待解说词"; nextArtifact = "narration.json"; }
    else { state = "working"; stage = "assemble"; stageLabel = "正在合成"; }
  } else if (cutMode && names.has("clip_plan.json")) {
    state = "working"; stage = "cut"; stageLabel = "正在剪辑";
  } else if (manifest !== undefined && !cutMode && !narrated) {
    state = "working"; stage = "assemble"; stageLabel = "正在合成";
  } else if (manifest !== undefined) {
    state = "waiting";
    stage = cutMode ? "clip-plan" : "narration";
    stageLabel = cutMode ? "等待剪辑计划" : "等待解说词";
    nextArtifact = cutMode ? "clip_plan.json" : "narration.json";
  }

  const artifacts = projectFiles.flatMap((file): VideoArtifactSummary[] => {
    const name = file.path.split("/").at(-1) ?? "";
    const meta = ARTIFACT_META[name];
    if (meta !== undefined) return [{ ...meta, path: file.path, version: file.version }];
    const extension = extname(name).toLocaleLowerCase();
    if (extension === ".srt") return [{ label: `SRT 字幕（${name}）`, kind: "subtitle", path: file.path, version: file.version }];
    if (extension === ".ass") return [{ label: `ASS 字幕（${name}）`, kind: "subtitle", path: file.path, version: file.version }];
    return [];
  }).sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));

  const narrationFiles = projectFiles.filter((file) => file.path.split("/").at(-1) === "narration.json");
  const narrationFile = narrationFiles.length === 1 ? narrationFiles[0] : undefined;
  const timelineFiles = projectFiles.filter((file) => file.path.split("/").at(-1) === "timeline.json");
  const timelineFile = timelineFiles.length === 1 ? timelineFiles[0] : undefined;
  const checkFiles = projectFiles.filter((file) => file.path.split("/").at(-1) === "check.json");
  const checkFile = checkFiles.length === 1 ? checkFiles[0] : undefined;

  const narrative = metadata.timeline === undefined
    && metadata.narration === undefined
    && metadata.validatedClips === undefined
    && metadata.visualAudioBoard === undefined
    && metadata.storyPlan === undefined
    ? undefined
    : projectVideoNarrative({
        timeline: metadata.timeline,
        resolveSourcePath: (raw) => referencedMedia(projectFiles, raw)?.path ?? raw,
        narration: metadata.narration,
        validatedClips: metadata.validatedClips,
        visualAudioBoard: metadata.visualAudioBoard,
        storyPlan: metadata.storyPlan,
        editMode: cutMode ? "cut" : settings?.edit_mode
      });

  const qualityCheck = parseVideoQualityCheck(metadata.qualityCheck, {
    clips: narrative?.clips,
    path: checkFile?.path,
    version: checkFile?.version
  });

  const title = text(project?.title)
    ?? markdownHeading(metadata.storyboard)
    ?? markdownHeading(metadata.script)
    ?? text(timelineMeta?.title)
    ?? id;

  return {
    id,
    root,
    title,
    state,
    stage,
    stageLabel,
    nextArtifact,
    editedKind,
    previews,
    artifacts,
    narrative,
    qualityCheck,
    narrationPath: narrationFile?.path,
    narrationVersion: narrationFile?.version,
    timelinePath: timelineFile?.path,
    timelineVersion: timelineFile?.version
  };
}
