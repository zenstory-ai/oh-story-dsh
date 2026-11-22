import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { VideoNarrativeProjection, VideoNarrativeSegment, VideoTimeRange, VideoTimelineClip } from "../video-narrative.js";
import type { VideoCheckItemStatus, VideoPreviewAsset, VideoQualityReviewHint } from "../video-project.js";
import type { WorkbenchMode } from "./file-activity.js";
import { CreativeCanvas, type CreativeCanvasState } from "./creative-canvas.js";
import type { GameDocumentEditor } from "./game-documents.js";
import type { GameWorkspaceFile } from "./game-workspace-types.js";
import { VideoDetails } from "./video-details.js";
import { VideoDocuments } from "./video-documents.js";
import { WorkbenchModeTabs } from "./workbench-mode-tabs.js";
import { WorkbenchSettingsButton } from "./workbench-settings-panel.js";
import { endpoint, handleTabKey } from "./workbench-ui.js";
import {
  videoCanvasModel,
  videoCreativeDocuments,
  videoDraftText,
  videoPreviewLabel,
  videoRange,
  videoSourceRange,
  videoSubtitleArtifact,
  videoTime,
  type VideoCanvasNode,
  type VideoProject,
  type VideoWorkspaceTab
} from "./video-workspace-model.js";

export type { VideoProject, VideoWorkspaceTab } from "./video-workspace-model.js";
export type { VideoPreviewAsset, VideoArtifactSummary, VideoQualityCheckSummary, VideoQualityReviewHint } from "../video-project.js";
export { VideoEnvironmentReport, type VideoPreflight } from "./video-environment.js";

const CREATE_PROJECT_VALUE = "__oh_video_create__";

const ROLE_RANK: Readonly<Record<VideoPreviewAsset["role"], number>> = {
  source: 0,
  edited: 1,
  final: 2
};

const CHECK_STATUS_LABEL: Readonly<Record<VideoCheckItemStatus, string>> = {
  pass: "通过",
  warn: "需复核",
  fail: "失败",
  skip: "跳过"
};

/** Observe a studio container width via ResizeObserver and emit `narrow` (`<= 800px`). */
export function observeStudioNarrow(
  element: { readonly clientWidth: number },
  onNarrow: (narrow: boolean) => void
): () => void {
  const measure = (): void => {
    const width = element.clientWidth;
    if (width > 0) onNarrow(width <= 800);
  };
  measure();
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const observer = new ResizeObserver(measure);
  observer.observe(element as Element);
  return () => { observer.disconnect(); };
}

export interface VideoSeekRequest {
  readonly role: VideoPreviewAsset["role"];
  readonly time: number;
  readonly range?: VideoTimeRange | undefined;
  readonly preserveNotice?: boolean | undefined;
  /** Clamp targets at or past `element.duration` slightly inside the tail (used for `check.json` review hints). */
  readonly clampToDuration?: boolean | undefined;
}

export interface VideoSeekOutcome {
  readonly status: "deferred" | "out-of-range" | "applied";
  readonly clearNotice: boolean;
  readonly notice?: string | undefined;
  readonly range?: VideoTimeRange | undefined;
}

/** Apply a seek to a `<video>` element while preserving switch-mismatch notices when requested. */
export function applyLoadedSeek(
  element: { currentTime: number; readonly duration: number; readonly readyState: number } | null,
  request: VideoSeekRequest
): VideoSeekOutcome {
  if (element === null || element.readyState === 0) {
    return { status: "deferred", clearNotice: false };
  }
  let targetTime = Math.max(0, request.time);
  if (Number.isFinite(element.duration) && targetTime >= element.duration) {
    if (request.clampToDuration === true && element.duration > 0) {
      targetTime = Math.max(0, element.duration - 0.25);
    } else {
      return { status: "out-of-range", clearNotice: false, notice: "这段文稿超出当前视频范围，可以先核对文稿或载入新版。" };
    }
  }
  element.currentTime = targetTime;
  let effectiveRange = request.range;
  if (effectiveRange !== undefined && request.clampToDuration === true && Number.isFinite(element.duration) && effectiveRange.end > element.duration) {
    const end = element.duration;
    effectiveRange = end > targetTime ? { ...effectiveRange, start: targetTime, end } : undefined;
  }
  return { status: "applied", clearNotice: request.preserveNotice !== true, range: effectiveRange };
}

/**
 * Resolve which output preview role and seek target a `check.json` v1 review hint should jump to.
 * Respects `qualityCheck.mediaRole` / `media`, clamps tail timestamps, and NEVER seeks raw `source`
 * with output-clock timestamps.
 */
export function resolveReviewHintSeek(
  project: Pick<VideoProject, "previews" | "qualityCheck">,
  loadedRole: VideoPreviewAsset["role"] | undefined,
  hint: VideoQualityReviewHint
): { readonly request: VideoSeekRequest } | { readonly notice: string } | undefined {
  if (hint.timestamp === undefined) return undefined;
  const hasFinal = project.previews.some((asset) => asset.role === "final");
  const hasEdited = project.previews.some((asset) => asset.role === "edited");
  const mediaRole = project.qualityCheck?.mediaRole;
  const matchedMediaRole = project.qualityCheck?.media === undefined
    ? undefined
    : project.previews.find((asset) => asset.role !== "source" && asset.path === project.qualityCheck?.media)?.role;

  let targetRole: "final" | "edited" | undefined;
  if (mediaRole === "final" && hasFinal) targetRole = "final";
  else if (mediaRole === "edited" && hasEdited) targetRole = "edited";
  else if (matchedMediaRole === "final" || matchedMediaRole === "edited") targetRole = matchedMediaRole;
  else if (loadedRole === "final" && hasFinal) targetRole = "final";
  else if (loadedRole === "edited" && hasEdited) targetRole = "edited";
  else if (hasFinal) targetRole = "final";
  else if (hasEdited) targetRole = "edited";

  if (targetRole === undefined) {
    return { notice: "暂无成片或粗剪预览，无法按质检时间戳跳转。" };
  }
  const hintRange = hint.endTimestamp !== undefined && hint.endTimestamp > hint.timestamp
    ? { start: hint.timestamp, end: hint.endTimestamp }
    : undefined;
  return {
    request: {
      role: targetRole,
      time: hint.timestamp,
      range: hintRange,
      clampToDuration: true
    }
  };
}

function clipMatchesSource(
  clip: VideoTimelineClip,
  project: Pick<VideoProject, "root">,
  source: VideoPreviewAsset,
  files: readonly GameWorkspaceFile[]
): boolean {
  const rawPath = clip.sourcePath ?? clip.source.sourcePath;
  if (rawPath !== undefined) {
    return source.path === rawPath || source.path === `${project.root}/${rawPath}`;
  }
  const sources = files.filter((file) => file.kind === "media" && file.path.startsWith(`${project.root}/sources/`));
  return clip.sourceId === undefined && sources.length === 1 && sources[0]?.path === source.path;
}

/**
 * Map playback time when switching between `source`, `edited`, and `final`.
 * Prefers `timeline.json` v3 `narrative.clips` (verified against `source.path`) for exact
 * output↔source mapping across pauses, non-narration cuts, and multi-clip spans, falling back
 * to `narrative.segments`.
 */
export function mapPreviewSwitchTime(input: {
  readonly project: Pick<VideoProject, "root" | "previews" | "narrative">;
  readonly files: readonly GameWorkspaceFile[];
  readonly narrative: VideoNarrativeProjection | undefined;
  readonly fromRole: VideoPreviewAsset["role"] | undefined;
  readonly toRole: VideoPreviewAsset["role"];
  readonly currentTime: number;
  readonly fallbackTime?: number | undefined;
}): { readonly time: number; readonly mapped: boolean } {
  const { project, files, narrative, fromRole, toRole, currentTime } = input;
  const fallback = input.fallbackTime ?? 0;
  if (toRole !== "source" && fromRole !== "source") {
    return { time: currentTime, mapped: true };
  }
  const source = project.previews.find((asset) => asset.role === "source");
  const clips = narrative?.clips;
  const segments = narrative?.segments ?? [];
  const projectWithLoadedNarrative = { ...project, narrative };
  const canMapSegment = (segment: VideoNarrativeSegment): boolean =>
    narrative?.authoredClock !== "unknown" && videoSourceRange(projectWithLoadedNarrative, segment, files) !== undefined;

  if (toRole === "source") {
    if (source !== undefined && narrative?.authoredClock !== "unknown" && clips !== undefined && clips.length > 0) {
      const clip = clips.find((item) =>
        currentTime >= item.output.start
        && currentTime < item.output.end
        && clipMatchesSource(item, project, source, files)
      );
      if (clip !== undefined && clip.output.end > clip.output.start) {
        const target = clip.source.start
          + ((currentTime - clip.output.start) * (clip.source.end - clip.source.start)) / (clip.output.end - clip.output.start);
        return { time: target, mapped: true };
      }
    }
    const paragraph = segments.find((item) =>
      currentTime >= item.output.start && currentTime < item.output.end && canMapSegment(item)
    );
    const original = paragraph?.sourceRanges[0];
    if (paragraph !== undefined && original !== undefined && paragraph.output.end > paragraph.output.start) {
      const target = original.start
        + ((currentTime - paragraph.output.start) * (original.end - original.start)) / (paragraph.output.end - paragraph.output.start);
      return { time: target, mapped: true };
    }
    return { time: fallback, mapped: false };
  }

  if (source !== undefined && narrative?.authoredClock !== "unknown" && clips !== undefined && clips.length > 0) {
    const clip = clips.find((item) =>
      currentTime >= item.source.start
      && currentTime < item.source.end
      && clipMatchesSource(item, project, source, files)
    );
    if (clip !== undefined && clip.source.end > clip.source.start) {
      const target = clip.output.start
        + ((currentTime - clip.source.start) * (clip.output.end - clip.output.start)) / (clip.source.end - clip.source.start);
      return { time: target, mapped: true };
    }
  }
  const paragraph = segments.find((item) =>
    canMapSegment(item) && item.sourceRanges.some((span) => currentTime >= span.start && currentTime < span.end)
  );
  const original = paragraph?.sourceRanges.find((span) => currentTime >= span.start && currentTime < span.end)
    ?? paragraph?.sourceRanges[0];
  if (paragraph !== undefined && original !== undefined && original.end > original.start) {
    const target = paragraph.output.start
      + ((currentTime - original.start) * (paragraph.output.end - paragraph.output.start)) / (original.end - original.start);
    return { time: target, mapped: true };
  }
  return { time: fallback, mapped: false };
}

export function VideoQualityCheckPanel({
  qualityCheck,
  initialOpen = false,
  onSeekHint,
  onDiscussHint
}: {
  readonly qualityCheck: NonNullable<VideoProject["qualityCheck"]>;
  readonly initialOpen?: boolean | undefined;
  readonly onSeekHint: (hint: VideoQualityReviewHint) => void;
  readonly onDiscussHint: (hint: VideoQualityReviewHint) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  return <section className="oh-video-qc-panel" aria-label="成片体检">
    <button
      type="button"
      className="oh-video-qc-toggle"
      aria-expanded={open}
      onClick={() => { setOpen((value) => !value); }}
    >
      <span className="oh-video-qc-pill" data-status={qualityCheck.status}>
        {qualityCheck.status === "pass" ? "通过" : qualityCheck.status === "warn" ? `需复核${qualityCheck.reviewHints.length > 0 ? ` · ${String(qualityCheck.reviewHints.length)}` : ""}` : "失败"}
      </span>
      <span className="oh-video-qc-summary">{qualityCheck.summary}</span>
      <span className="oh-video-qc-chevron" aria-hidden>{open ? "▴" : "▾"}</span>
    </button>
    {open && <div className="oh-video-qc-body">
      {qualityCheck.checks.length > 0 && <ul className="oh-video-qc-checks">
        {qualityCheck.checks.map((check) => <li key={check.key} data-status={check.status}>
          <span className="oh-video-qc-check-status">{CHECK_STATUS_LABEL[check.status]}</span>
          <strong>{check.label}</strong>
          {check.detail !== "" && <small>{check.detail}</small>}
        </li>)}
      </ul>}
      {qualityCheck.reviewHints.length > 0 && <ul className="oh-video-qc-hints">
        {qualityCheck.reviewHints.map((hint, index) => <li key={`${hint.check}-${hint.code}-${String(index)}`} className="oh-video-qc-hint" data-severity={hint.severity}>
          <div className="oh-video-qc-hint-copy">
            <span className="oh-video-qc-hint-badge" data-severity={hint.severity}>{hint.severity === "fail" ? "失败" : "待复核"}</span>
            <strong>{hint.label}</strong>
            <p>{hint.message}</p>
          </div>
          <div className="oh-video-qc-hint-actions">
            {hint.timestamp !== undefined && <button type="button" onClick={() => { onSeekHint(hint); }}>
              跳到 {hint.endTimestamp !== undefined ? videoRange({ start: hint.timestamp, end: hint.endTimestamp }) : videoTime(hint.timestamp)}
            </button>}
            <button type="button" onClick={() => { onDiscussHint(hint); }}>带到 Chat 讨论</button>
          </div>
        </li>)}
      </ul>}
    </div>}
  </section>;
}

/** Stable version key for a preview asset so regenerations are detected per role. */
export function previewAssetVersionKey(asset: Pick<VideoPreviewAsset, "path" | "version">): string {
  return `${asset.path}:${asset.version}`;
}

/** Record `asset` (and current versions of lower-tier roles) so loading `final` never later offers an older `edited`/`preview`. */
export function acknowledgePreviewVersion(
  acknowledged: Map<VideoPreviewAsset["role"], string>,
  previews: readonly VideoPreviewAsset[],
  asset: VideoPreviewAsset
): void {
  const rank = ROLE_RANK[asset.role];
  acknowledged.set(asset.role, previewAssetVersionKey(asset));
  for (const candidate of previews) {
    if (ROLE_RANK[candidate.role] <= rank) {
      acknowledged.set(candidate.role, previewAssetVersionKey(candidate));
    }
  }
}

/**
 * Find the highest-tier non-source preview with an unacknowledged `path:version` at or above the active role.
 * Never offers to downgrade from `final` (1080p) to `edited` (480p `preview.mp4`).
 */
export function discoverNewerPreview(
  previews: readonly VideoPreviewAsset[],
  loadedRole: VideoPreviewAsset["role"] | undefined,
  acknowledged: ReadonlyMap<VideoPreviewAsset["role"], string>
): VideoPreviewAsset | undefined {
  const currentRank = loadedRole === undefined ? -1 : ROLE_RANK[loadedRole];
  let best: VideoPreviewAsset | undefined;
  for (const asset of previews) {
    if (asset.role === "source") continue;
    if (acknowledged.get(asset.role) === previewAssetVersionKey(asset)) continue;
    if (ROLE_RANK[asset.role] < currentRank) continue;
    if (best === undefined || ROLE_RANK[asset.role] > ROLE_RANK[best.role]) {
      best = asset;
    }
  }
  return best;
}

function preferredPreview(project: VideoProject): VideoPreviewAsset | undefined {
  return project.previews.find((item) => item.role === "final") ?? project.previews.find((item) => item.role === "edited") ?? project.previews.find((item) => item.role === "source");
}

function mediaUrl(sessionId: string, asset: VideoPreviewAsset, revision = 0): string {
  return `${endpoint("media", sessionId, asset.path)}&version=${encodeURIComponent(asset.version)}&reload=${String(revision)}`;
}

function sameAsset(a: VideoPreviewAsset | undefined, b: VideoPreviewAsset | undefined): boolean {
  return a?.path === b?.path && a?.version === b?.version;
}

function EmptyVideo({ project, onChat }: { readonly project?: VideoProject | undefined; readonly onChat: (prompt: string) => void }) {
  return <div className="oh-video-preview-empty"><span aria-hidden>▷</span><strong>{project === undefined ? "把这段故事，讲给更多人听" : "先看看原片，想想怎么讲"}</strong><p>在 Chat 中提供想处理的视频，一起讨论主线、解说和想保留的原声。</p><button type="button" onClick={() => { onChat(project === undefined ? "我想制作一段视频解说，请先和我讨论素材、观众和想讲的故事。" : `我想讨论《${project.title}》怎么讲，先看看已有素材和解说想法。`); }}>聊聊解说想法</button></div>;
}

export interface VideoStudioProps {
  readonly sessionId: string;
  readonly projects: readonly VideoProject[];
  readonly files: readonly GameWorkspaceFile[];
  readonly running: boolean;
  readonly projectId: string | undefined;
  readonly tab: VideoWorkspaceTab;
  readonly hidden: boolean;
  readonly paneId: string;
  readonly labelledBy: string;
  readonly onProject: (id: string) => void;
  readonly onTab: (tab: VideoWorkspaceTab) => void;
  readonly onWorkbench: (mode: WorkbenchMode) => void;
  readonly workbenchModes?: readonly WorkbenchMode[] | undefined;
  readonly onWorkbenchSettings?: (() => void) | undefined;
  readonly onCollapse: () => void;
  readonly chatOpen: boolean;
  readonly onChatOpen: (visible: boolean) => void;
  readonly onContinueInChat: (prompt: string) => void;
  readonly editor: GameDocumentEditor;
  readonly canvasByProject: Readonly<Record<string, CreativeCanvasState>>;
  readonly onCanvasChange: (id: string, value: CreativeCanvasState) => void;
  readonly onRefresh?: (() => void) | undefined;
  readonly onCreateProject?: (() => void) | undefined;
  readonly fileReadError?: string | null | undefined;
  readonly onRetryRead?: (() => void) | undefined;
  readonly workspaceError?: string | null | undefined;
  readonly truncated?: boolean | undefined;
  readonly resolveImageSrc?: ((src: string) => string | undefined) | undefined;
}

export function VideoStudio(props: VideoStudioProps) {
  const creating = props.projectId === "";
  const project = creating
    ? undefined
    : props.projects.find((item) => item.id === props.projectId) ?? props.projects[0];
  const knownProjectIds = useRef<ReadonlySet<string>>(new Set(props.projects.map((item) => item.id)));
  const [details, setDetails] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const studioRef = useRef<HTMLElement>(null);
  const tabsId = useId();
  useEffect(() => {
    const currentIds = new Set(props.projects.map((item) => item.id));
    if (props.projectId === "") {
      const created = props.projects.find((item) => !knownProjectIds.current.has(item.id));
      if (created !== undefined) props.onProject(created.id);
    }
    knownProjectIds.current = currentIds;
  }, [props.onProject, props.projectId, props.projects]);
  useEffect(() => {
    if (project !== undefined && project.id !== props.projectId) props.onProject(project.id);
  }, [props.onProject, project, props.projectId]);
  useEffect(() => {
    const element = studioRef.current;
    if (element === null) return;
    return observeStudioNarrow(element, setNarrow);
  }, []);
  const tabs = ["preview", "canvas", "docs"] as const;
  const labels = { preview: "预览", canvas: "创作画布", docs: "文稿" };
  const detailsFileReadError = props.editor.selected === undefined ? undefined : props.fileReadError;
  return <main ref={studioRef} id={props.paneId} className="oh-video-studio" role="tabpanel" aria-labelledby={props.labelledBy} hidden={props.hidden} data-chat-open={props.chatOpen} data-narrow={narrow || undefined}>
    <header className="oh-video-toolbar">
      <div className="oh-workbench-cluster">
        <WorkbenchModeTabs className="oh-video-mode-tabs" current="video" modes={props.workbenchModes} onSelect={props.onWorkbench} />
        {props.onWorkbenchSettings !== undefined && <WorkbenchSettingsButton onClick={props.onWorkbenchSettings} />}
        <button className="oh-workbench-collapse" type="button" aria-label="收起创作工作台" onClick={props.onCollapse}>×</button>
      </div>
      <div className="oh-video-project-wrap">
        <label className="oh-video-project">
          <select
            aria-label="视频项目"
            value={project?.id ?? ""}
            disabled={project === undefined && props.projects.length === 0 && props.onCreateProject === undefined}
            onChange={(event) => {
              if (event.target.value === CREATE_PROJECT_VALUE) {
                props.onCreateProject?.();
                return;
              }
              props.onProject(event.target.value);
            }}
          >
            {project === undefined && (props.projects.length > 0 || props.onCreateProject !== undefined) && (
              <option value="" disabled>{creating ? "新建视频项目" : "选择视频项目"}</option>
            )}
            {props.projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            {props.onCreateProject !== undefined && <option value={CREATE_PROJECT_VALUE}>+ 新建视频项目</option>}
          </select>
        </label>
        {project !== undefined && project.stageLabel !== "" && <span className="oh-video-stage-pill" data-state={project.state} title={`当前制作阶段：${project.stageLabel}`}>{project.stageLabel}</span>}
      </div>
      <div className="oh-video-tabs" role="tablist" aria-label="视频工作台">{tabs.map((item) => <button type="button" role="tab" key={item} id={`${tabsId}-${item}-tab`} aria-controls={`${tabsId}-${item}-panel`} aria-selected={props.tab === item} tabIndex={props.tab === item ? 0 : -1} onKeyDown={(event) => { handleTabKey(event, tabs, props.tab, props.onTab); }} onClick={() => { props.onTab(item); if (item === "canvas") props.onChatOpen(false); }}>{labels[item]}</button>)}</div>
      <div className="oh-video-workspace-actions">
        <button className="oh-video-chat-toggle" type="button" aria-expanded={props.chatOpen} onClick={() => { props.onChatOpen(!props.chatOpen); }}>Chat</button>
        {props.onRefresh !== undefined && <button className="oh-video-refresh" type="button" aria-label="刷新视频项目" title="刷新视频项目" onClick={props.onRefresh}>↻</button>}
        <button className="oh-video-details-trigger" type="button" onClick={() => { setDetails(true); }}>制作详情{project?.qualityCheck !== undefined && project.qualityCheck.status !== "pass" && <i className="oh-video-details-dot" data-status={project.qualityCheck.status} aria-hidden />}</button>
      </div>
    </header>
    {props.workspaceError !== null && props.workspaceError !== undefined && props.workspaceError !== "" && (
      <div className="oh-story-error oh-video-workspace-error" role="alert">
        <span>{props.workspaceError}</span>
        {props.onRefresh !== undefined && <button type="button" onClick={props.onRefresh}>重试</button>}
      </div>
    )}
    {props.truncated === true && (
      <div className="oh-story-warning oh-story-truncated-banner" role="status">
        工作区文件数已达上限，部分文件未列出；请清理临时目录或刷新。
      </div>
    )}
    {project === undefined
      ? <EmptyVideo onChat={props.onContinueInChat} />
      : <VideoWorkspace key={project.id} {...props} project={project} tabsId={tabsId} narrow={narrow} detailsOpen={details} onCloseDetails={() => { setDetails(false); }} />}
    {project === undefined && details && <VideoDetails key="empty" sessionId={props.sessionId} project={undefined} fileReadError={detailsFileReadError} fileReadErrorPath={props.editor.selected} onRetryRead={props.onRetryRead} onClose={() => { setDetails(false); }} />}
  </main>;
}

interface LoadedPreview {
  readonly asset: VideoPreviewAsset;
  readonly narrative?: VideoNarrativeProjection | undefined;
  readonly narrationPath?: string | undefined;
  readonly narrationVersion?: string | undefined;
  readonly timelinePath?: string | undefined;
  readonly timelineVersion?: string | undefined;
}
function snapshot(project: VideoProject, asset: VideoPreviewAsset): LoadedPreview {
  return {
    asset,
    narrative: project.narrative,
    narrationPath: project.narrationPath,
    narrationVersion: project.narrationVersion,
    timelinePath: project.timelinePath,
    timelineVersion: project.timelineVersion
  };
}

function preferredDraftPath(input: {
  readonly timelinePath?: string | undefined;
  readonly narrationPath?: string | undefined;
  readonly narrative?: VideoNarrativeProjection | undefined;
}): string | undefined {
  if (input.timelinePath !== undefined && (input.narrative?.clips !== undefined || input.narrationPath === undefined)) {
    return input.timelinePath;
  }
  return input.narrationPath ?? input.timelinePath;
}

function VideoWorkspace(props: VideoStudioProps & {
  readonly project: VideoProject;
  readonly tabsId: string;
  readonly narrow: boolean;
  readonly detailsOpen: boolean;
  readonly onCloseDetails: () => void;
}) {
  const { project, sessionId, narrow } = props;
  const initial = preferredPreview(project);
  const [loaded, setLoaded] = useState<LoadedPreview | undefined>(() => initial === undefined ? undefined : snapshot(project, initial));
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [currentTime, setCurrentTime] = useState(0);
  const [showScript, setShowScript] = useState(false);
  const [scriptCollapsed, setScriptCollapsed] = useState(false);
  const [range, setRange] = useState<VideoTimeRange>();
  const [notice, setNotice] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const acknowledgedVersions = useRef<Map<VideoPreviewAsset["role"], string>>(new Map());
  const acknowledgedInitialized = useRef(false);
  if (!acknowledgedInitialized.current) {
    acknowledgedInitialized.current = true;
    for (const asset of project.previews) {
      acknowledgedVersions.current.set(asset.role, previewAssetVersionKey(asset));
    }
  }
  useEffect(() => {
    const activeRoles = new Set(project.previews.map((item) => item.role));
    for (const role of acknowledgedVersions.current.keys()) {
      if (!activeRoles.has(role)) acknowledgedVersions.current.delete(role);
    }
  }, [project.previews]);
  const discovered = discoverNewerPreview(project.previews, loaded?.asset.role, acknowledgedVersions.current);
  const video = useRef<HTMLVideoElement>(null);
  const roleTimes = useRef<Partial<Record<VideoPreviewAsset["role"], number>>>({});
  const scriptList = useRef<HTMLDivElement>(null);
  const scriptScrolledAt = useRef(0);
  const playerShell = useRef<HTMLDivElement>(null);
  const pendingSeek = useRef<VideoSeekRequest>();
  const currentAsset = project.previews.find((asset) => asset.role === loaded?.asset.role);
  const pending = loaded !== undefined && currentAsset !== undefined && !sameAsset(loaded.asset, currentAsset);
  const loadedSegments = loaded?.narrative?.segments ?? [];
  const narrative = loaded?.narrative;
  const canvas = props.canvasByProject[project.id] ?? { positions: {} };
  const activeDraftPath = preferredDraftPath(project);
  const loadedDraftPath = loaded === undefined ? undefined : preferredDraftPath(loaded);
  const draftContent = activeDraftPath === undefined ? undefined : props.editor.buffers[activeDraftPath]?.content;
  const loadedDraft = loadedDraftPath === undefined ? undefined : props.editor.buffers[loadedDraftPath]?.content;
  const canvasModel = useMemo(() => {
    const model = videoCanvasModel(project, project.narrative, props.files);
    return { ...model, nodes: model.nodes.map((node) => node.segment === undefined ? node : { ...node, excerpt: videoDraftText(node.segment, draftContent) }) };
  }, [project, draftContent, props.files]);
  const active = !props.hidden && props.tab === "preview";
  useEffect(() => {
    if (!active || selectedId === undefined || video.current?.paused !== false || performance.now() - scriptScrolledAt.current < 4000) return;
    const list = scriptList.current;
    const row = Array.from(list?.querySelectorAll<HTMLElement>("[data-segment-id]") ?? []).find((item) => item.dataset.segmentId === selectedId);
    if (list === null || row === undefined) return;
    const bounds = list.getBoundingClientRect(), rect = row.getBoundingClientRect();
    if (rect.top < bounds.top || rect.bottom > bounds.bottom) list.scrollTo({ top: list.scrollTop + rect.top - bounds.top - 12, behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [active, selectedId]);
  useEffect(() => { if (!active) { video.current?.pause(); setShowScript(false); } }, [active]);
  useEffect(() => { if (props.chatOpen) setShowScript(false); }, [props.chatOpen]);
  useEffect(() => { if (!showScript) return; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowScript(false); }; globalThis.addEventListener("keydown", escape); return () => { globalThis.removeEventListener("keydown", escape); }; }, [showScript]);
  useEffect(() => {
    if (loaded === undefined && initial !== undefined) {
      acknowledgePreviewVersion(acknowledgedVersions.current, project.previews, initial);
      setLoaded(snapshot(project, initial));
    }
  }, [initial, loaded, project]);

  const load = (asset: VideoPreviewAsset, seek?: VideoSeekRequest, nextNotice?: string): void => {
    if (loaded !== undefined) roleTimes.current[loaded.asset.role] = video.current?.currentTime ?? currentTime;
    video.current?.pause();
    acknowledgePreviewVersion(acknowledgedVersions.current, project.previews, asset);
    pendingSeek.current = seek;
    setLoaded(snapshot(project, asset));
    setReady(false);
    setError(false);
    setCurrentTime(0);
    setRange(seek?.range);
    setNotice(nextNotice);
    setRevision((value) => value + 1);
  };

  const seekLoaded = (request: VideoSeekRequest): void => {
    const outcome = applyLoadedSeek(video.current, request);
    if (outcome.status === "deferred") { pendingSeek.current = request; return; }
    if (outcome.status === "out-of-range") { setNotice(outcome.notice); return; }
    setRange(outcome.range);
    if (outcome.clearNotice) setNotice(undefined);
  };

  const requestSeek = (request: VideoSeekRequest): void => {
    const asset = project.previews.find((item) => item.role === request.role);
    if (asset === undefined) { setNotice("这份视频还没有准备好，先继续核对文稿。"); return; }
    props.onTab("preview");
    setShowScript(false);
    if (loaded?.asset.role === request.role) seekLoaded(request);
    else load(asset, request);
  };

  const canSource = (segment: VideoNarrativeSegment): boolean => narrative?.authoredClock !== "unknown" && videoSourceRange({ ...project, narrative }, segment, props.files) !== undefined;

  const switchPreview = (asset: VideoPreviewAsset): void => {
    if (asset.role === loaded?.asset.role) return;
    const time = video.current?.currentTime ?? 0;
    const { time: target, mapped } = mapPreviewSwitchTime({
      project,
      files: props.files,
      narrative,
      fromRole: loaded?.asset.role,
      toRole: asset.role,
      currentTime: time,
      fallbackTime: roleTimes.current[asset.role] ?? 0
    });
    const mismatchNotice = mapped
      ? undefined
      : target > 0
        ? "当前片段没有可靠对应，已回到这份视频上次的位置。"
        : "当前片段没有可靠对应，可以从这份视频开头核对。";
    load(asset, { role: asset.role, time: target, preserveNotice: !mapped }, mismatchNotice);
  };

  const canOutput = (segment: VideoNarrativeSegment): boolean => narrative?.authoredClock !== "unknown" && narrative !== undefined && (project.previews.some((asset) => asset.role !== "source") || canSource(segment));

  const locate = (segment: VideoNarrativeSegment, source = false): void => {
    setSelectedId(segment.id);
    if (source) {
      const original = segment.sourceRanges[0];
      if (original !== undefined && canSource(segment)) requestSeek({ role: "source", time: original.start, range: original });
      return;
    }
    const role = loaded?.asset.role === "edited" ? "edited" : project.previews.some((asset) => asset.role === "final") ? "final" : project.previews.some((asset) => asset.role === "edited") ? "edited" : "source";
    const span = role === "source" ? segment.sourceRanges[0] : segment.output;
    if (span !== undefined && canOutput(segment)) requestSeek({ role, time: span.start });
  };

  const seekReviewHint = (hint: VideoQualityReviewHint): void => {
    const resolved = resolveReviewHintSeek(project, loaded?.asset.role, hint);
    if (resolved === undefined) return;
    if ("notice" in resolved) {
      setNotice(resolved.notice);
      return;
    }
    requestSeek(resolved.request);
  };

  const discussReviewHint = (hint: VideoQualityReviewHint): void => {
    video.current?.pause();
    const timing = hint.timestamp === undefined
      ? ""
      : hint.endTimestamp !== undefined
        ? `（时间 ${videoRange({ start: hint.timestamp, end: hint.endTimestamp })}）`
        : `（时间 ${videoTime(hint.timestamp)}）`;
    const checkPath = project.qualityCheck?.path === undefined ? "" : `\n体检报告：${project.qualityCheck.path}`;
    props.onContinueInChat(`我想处理《${project.title}》成片体检里的「${hint.label}」${timing}：${hint.message}。${checkPath}\n请结合时间线与素材分析原因，并给出修改方案。`);
  };

  const openDocument = (path?: string): void => {
    const next = path ?? activeDraftPath ?? videoCreativeDocuments(project)[0]?.path;
    if (next !== undefined) props.editor.onSelect(next);
    props.editor.onMode("preview");
    props.onTab("docs");
  };

  const discuss = (segment?: VideoNarrativeSegment): void => {
    video.current?.pause();
    const context = segment === undefined
      ? `当前${loaded === undefined ? "预览" : videoPreviewLabel(loaded.asset)} ${videoTime(currentTime)}`
      : `${segment.kind === "original" ? "原声" : "解说段落"}，输出 ${videoRange(segment.output)}${segment.sourceRanges.length === 0 ? "" : `；原片 ${segment.sourceRanges.map(videoRange).join("、")}`}\n文稿：${videoDraftText(segment, loadedDraft) ?? "保留原片声音"}`;
    props.onContinueInChat(`我想调整《${project.title}》的${context}。\n${loaded === undefined ? "" : `正在预览：${loaded.asset.path}，版本 ${loaded.asset.version}。\n`}请先讨论画面、解说与声音的修改思路。`);
  };

  const onNodeOpen = (node: VideoCanvasNode): void => {
    if (node.segment !== undefined) {
      if (project.narrative?.authoredClock === "unknown") { openDocument(); return; }
      props.onTab("preview");
      const scriptVersionChanged = project.narrationVersion !== loaded?.narrationVersion
        || project.timelineVersion !== loaded?.timelineVersion;
      if (pending || (scriptVersionChanged && !loadedSegments.some((segment) => segment.id === node.segment?.id && segment.output.start === node.segment.output.start && segment.output.end === node.segment.output.end))) { setNotice("文稿或视频已有更新。先载入新版本，再核对这段内容；当前播放保持原样。"); return; }
      const existing = loadedSegments.find((segment) => segment.id === node.segment?.id);
      if (existing !== undefined) locate(existing, loaded?.asset.role === "source" && canSource(existing));
      else setNotice("先在文稿里核对这段的时间，再继续定位。");
    } else if (node.id === "source") requestSeek({ role: "source", time: 0 });
    else if (node.id === "preview") { const asset = preferredPreview(project); if (asset !== undefined && asset.role !== loaded?.asset.role) requestSeek({ role: asset.role, time: roleTimes.current[asset.role] ?? 0 }); else props.onTab("preview"); }
    else openDocument(node.path);
  };

  const subtitleArtifact = videoSubtitleArtifact(project);
  const downloadSubtitles = async (): Promise<void> => {
    if (subtitleArtifact === undefined) return;
    setExporting(true);
    try {
      const response = await fetch(endpoint("file", sessionId, subtitleArtifact.path));
      let payload: { readonly content?: string; readonly error?: string } | undefined;
      try {
        payload = await response.json() as { readonly content?: string; readonly error?: string };
      } catch {
        payload = undefined;
      }
      if (!response.ok || payload?.content === undefined) throw new Error(payload?.error ?? "字幕暂时无法导出");
      const url = URL.createObjectURL(new Blob([payload.content], { type: "application/x-subrip;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `${project.title}.srt`; link.click(); globalThis.setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : String(reason)); }
    finally { setExporting(false); }
  };

  const qualityCheck = project.qualityCheck;
  const scriptExpanded = showScript || (!props.chatOpen && !scriptCollapsed && !narrow);
  const detailsFileReadError = props.editor.selected === undefined ? undefined : props.fileReadError;

  const renderSegment = (segment: VideoNarrativeSegment, index: number) => {
    const firstSource = segment.sourceRanges[0];
    return <article className="oh-video-script-segment" key={segment.id} data-segment-id={segment.id} data-selected={selectedId === segment.id} data-kind={segment.kind}>
      <button className="oh-video-segment-jump" type="button" disabled={!canOutput(segment)} onClick={() => { locate(segment); }}><span>{segment.kind === "original" ? "保留原声" : `解说 ${String((segment.index ?? index) + 1).padStart(2, "0")}`}<small>{narrative?.authoredClock === "unknown" ? "文稿时间" : "输出"} {videoRange(segment.output)}</small></span><p>{videoDraftText(segment, loadedDraft) ?? "听一听原片里值得留下的声音。"}{videoDraftText(segment, loadedDraft) !== segment.text && <small className="oh-video-draft-wording">改稿文案 · 配音未更新</small>}</p></button>
      <footer>{canSource(segment) && firstSource !== undefined ? <button type="button" onClick={() => { locate(segment, true); }}>原片 {videoRange(firstSource)}</button> : <span>{segment.sourceRanges.length > 1 ? "对应多段原片" : "原片对应待核对"}</span>}<div>{segment.kind === "narration" && <button type="button" onClick={() => { openDocument(loadedDraftPath ?? activeDraftPath); props.editor.onMode("source"); }}>改稿</button>}<button type="button" aria-label={`讨论第 ${String(index + 1)} 段`} onClick={() => { discuss(segment); }}>Chat</button></div></footer>
    </article>;
  };

  const nextUpdateAsset = discovered ?? (pending ? currentAsset : undefined);

  return <div className="oh-video-panels">
    <section role="tabpanel" id={`${props.tabsId}-preview-panel`} aria-labelledby={`${props.tabsId}-preview-tab`} hidden={props.tab !== "preview"}>
      <div className="oh-video-preview-layout" data-script-open={showScript} data-script-collapsed={scriptCollapsed || loaded === undefined}>
        <div className="oh-video-preview-main">
          {loaded === undefined ? <EmptyVideo project={project} onChat={props.onContinueInChat} /> : <div ref={playerShell} className="oh-video-preview-shell" data-state={error ? "error" : props.running ? "building" : ready ? "ready" : "loading"}>
            <div className="oh-video-stagebar">
              <div className="oh-video-version-tabs" role="tablist" aria-label="预览版本">
                {project.previews.map((asset) => {
                  const previewTitle = asset.role === "source"
                    ? "查看原始素材视频"
                    : asset.role === "final"
                      ? "查看已合音与字幕的最终成片"
                      : "查看已剪辑的画面预览";
                  return <button type="button" role="tab" key={asset.role} title={previewTitle} aria-selected={asset.role === loaded.asset.role} tabIndex={asset.role === loaded.asset.role ? 0 : -1} onClick={() => { switchPreview(asset); }} onKeyDown={(event) => { handleTabKey(event, project.previews.map((item) => item.role), loaded.asset.role, (role) => { const next = project.previews.find((item) => item.role === role); if (next !== undefined) switchPreview(next); }); }}>{videoPreviewLabel(asset)}</button>;
                })}
              </div>
              <div className="oh-video-preview-actions">
                <button className="oh-video-context-action" type="button" aria-expanded={scriptExpanded} onClick={() => { if (props.chatOpen || narrow) setShowScript((value) => !value); else setScriptCollapsed((value) => !value); }}>解说稿</button>
                <button className="oh-video-context-action" type="button" onClick={() => { discuss(); }}>讨论当前画面</button>
                <a href={mediaUrl(sessionId, loaded.asset, revision)} download={`${project.title}-${videoPreviewLabel(loaded.asset)}.${loaded.asset.path.split(".").at(-1) ?? "mp4"}`}>导出视频</a>
                <button type="button" aria-label="全屏预览" onClick={() => { void playerShell.current?.requestFullscreen().catch(() => { setNotice("当前环境暂不支持全屏，可以在新窗口打开视频。"); }); }}>⛶</button>
              </div>
            </div>
            <div className="oh-video-player-stage">
              <video
                key={`${loaded.asset.path}:${loaded.asset.version}:${String(revision)}`}
                ref={video}
                src={mediaUrl(sessionId, loaded.asset, revision)}
                controls
                preload="metadata"
                playsInline
                onLoadedMetadata={() => {
                  setReady(true);
                  setError(false);
                  const request = pendingSeek.current;
                  pendingSeek.current = undefined;
                  if (request !== undefined) seekLoaded(request);
                }}
                onError={() => { setError(true); setReady(false); }}
                onTimeUpdate={() => {
                  const element = video.current;
                  if (element === null) return;
                  setCurrentTime(element.currentTime);
                  if (range !== undefined && element.currentTime >= range.end) { element.pause(); setRange(undefined); }
                  if (loaded.asset.role !== "source") {
                    const paragraph = loadedSegments.find((item) => element.currentTime >= item.output.start && element.currentTime < item.output.end);
                    if (paragraph !== undefined) setSelectedId(paragraph.id);
                  } else {
                    const matches = loadedSegments.filter((item) => canSource(item) && item.sourceRanges.some((span) => element.currentTime >= span.start && element.currentTime < span.end));
                    if (matches.length === 1) setSelectedId(matches[0]?.id);
                  }
                }}
              />
              {error && <div className="oh-video-media-error" role="alert"><strong>暂时无法播放这段视频</strong><button type="button" onClick={() => { load(loaded.asset); }}>重新读取视频</button><a href={mediaUrl(sessionId, loaded.asset, revision)} target="_blank" rel="noreferrer">在新窗口打开</a></div>}
            </div>
            <div role="status">{(props.running || range !== undefined) && <div className="oh-video-player-caption"><span>{range === undefined ? "" : `核对 ${videoRange(range)}`}</span><span>{props.running ? "正在继续制作 · 当前视频保留" : ""}</span></div>}</div>
          </div>}
          {qualityCheck !== undefined && <VideoQualityCheckPanel key={`${project.id}:${qualityCheck.version ?? qualityCheck.status}`} qualityCheck={qualityCheck} initialOpen={qualityCheck.status === "fail"} onSeekHint={seekReviewHint} onDiscussHint={discussReviewHint} />}
          {loaded !== undefined && currentAsset === undefined && <p className="oh-video-notice" role="status">当前视频已从项目移除，已打开的画面保留；可以选择其他视频继续核对。</p>}
          {nextUpdateAsset !== undefined && <div className="oh-video-version-notice" role="status"><div><strong>新版本已准备好</strong><span>当前视频保留，准备好后再载入。</span></div><button type="button" onClick={() => { load(nextUpdateAsset); }}>载入新版本</button></div>}
          {notice !== undefined && <div className="oh-video-notice-row" role="status"><p className="oh-video-notice">{notice}</p><button type="button" aria-label="关闭提示" onClick={() => { setNotice(undefined); }}>×</button></div>}
        </div>
        {loaded !== undefined && <aside className="oh-video-script-panel" aria-label="分段解说稿"><header><h3>解说稿 <small>{loadedSegments.length > 0 ? `${String(loadedSegments.length)} 段` : ""}</small></h3><button type="button" aria-label="收起解说稿" onClick={() => { setShowScript(false); setScriptCollapsed(true); }}>×</button></header><div ref={scriptList} className="oh-video-segment-list" onWheel={() => { scriptScrolledAt.current = performance.now(); }} onTouchMove={() => { scriptScrolledAt.current = performance.now(); }}>{loadedSegments.length > 0 ? loadedSegments.map(renderSegment) : <div className="oh-video-script-empty"><button type="button" onClick={() => { props.onContinueInChat(`我想讨论《${project.title}》的解说方向，请先梳理主线和原声。`); }}>聊聊解说方向</button></div>}</div></aside>}
      </div>
    </section>
    <section role="tabpanel" id={`${props.tabsId}-canvas-panel`} aria-labelledby={`${props.tabsId}-canvas-tab`} hidden={props.tab !== "canvas"}><CreativeCanvas<VideoCanvasNode> nodes={canvasModel.nodes} edges={canvasModel.edges} state={canvas} onChange={(value) => { props.onCanvasChange(project.id, value); }} ariaLabel="视频创作无限画布" helpText="拖动空白处平移 · 滚轮缩放 · 双击打开内容" empty={{ title: "先从想讲的故事开始", description: "和 AI 讨论主线，已有文稿和媒体会出现在这里。", actionLabel: "聊聊解说想法", onAction: () => { props.onContinueInChat(`我想讨论《${project.title}》的故事主线和解说方向。`); } }} onOpen={onNodeOpen} onContinueInChat={(node) => { if (node.segment !== undefined) discuss(node.segment); else props.onContinueInChat(`我想继续调整《${project.title}》的「${node.title}」。${node.path === undefined ? "" : `内容：${node.path}。`}请先讨论思路。`); }} renderNodeMedia={(node) => { const asset = node.id === "source" ? project.previews.find((item) => item.role === "source") : node.id === "preview" ? preferredPreview(project) : undefined; return asset === undefined || props.tab !== "canvas" ? null : <video className="oh-video-canvas-thumbnail" src={mediaUrl(sessionId, asset)} preload="metadata" muted playsInline tabIndex={-1} aria-hidden />; }} renderNodeActions={(node) => <button type="button" onClick={() => { onNodeOpen(node); }}>{node.segment !== undefined ? project.narrative?.authoredClock === "unknown" ? "打开文稿" : "定位这段" : node.id === "source" ? "看原片" : node.id === "preview" ? "回到预览" : "打开文稿"}</button>} renderContextActions={(node) => <><button type="button" onClick={() => { onNodeOpen(node); }}>{node.segment === undefined ? "打开内容" : "定位这段"}</button>{node.segment !== undefined && <button type="button" onClick={() => { openDocument(); }}>打开文稿</button>}</>} /></section>
    <section role="tabpanel" id={`${props.tabsId}-docs-panel`} aria-labelledby={`${props.tabsId}-docs-tab`} hidden={props.tab !== "docs"}>{!props.hidden && props.tab === "docs" && <VideoDocuments project={project} editor={props.editor} onChat={props.onContinueInChat} fileReadError={props.fileReadError} onRetryRead={props.onRetryRead} resolveImageSrc={props.resolveImageSrc} />}<div className="oh-video-document-export">{subtitleArtifact !== undefined && <button type="button" disabled={exporting} onClick={() => { void downloadSubtitles(); }}>{exporting ? "正在导出…" : "导出项目字幕"}</button>}</div></section>
    {props.detailsOpen && <VideoDetails key={project.id} sessionId={sessionId} project={project} fileReadError={detailsFileReadError} fileReadErrorPath={props.editor.selected} onRetryRead={props.onRetryRead} onSeekHint={seekReviewHint} onDiscussHint={discussReviewHint} onClose={props.onCloseDetails} />}
  </div>;
}
