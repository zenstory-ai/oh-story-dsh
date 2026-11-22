import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Type-only: erased from the browser bundle, but a modality added to the host registry
// without a label below becomes a type error instead of an unlabelled chip.
import type { DramaAdapterModality, DramaAdapterStatus } from "../drama-adapters.js";
import { productionCompleteness, targetDisplayName, type DramaDocumentTarget, type DramaEpisodeProduction, type DramaMusicPrompt, type DramaProductionSection, type DramaShot } from "./drama-production.js";
import { endpoint, handleTabKey } from "./workbench-ui.js";

export { targetDisplayName };
import type { CanvasViewport } from "./canvas-viewport.js";
import { isAudioMediaVersion, ProductionCanvas, type DramaMediaVersion } from "./production-canvas.js";
import { nativeBatchPrompt, nativeCompositionPrompt, nativeMusicProductionPrompt, nativeProductionPrompt, nativeVisualImagePromptRequest } from "./production-prompts.js";
import { activeProductionJobId, compositionInFlight, createPendingJob, mediaBelongsToEpisode, queuedItemForJob, reconcileProductionJobs, reconcileSequence, referencesForTarget, reorderSequence, sequenceIssues, sequenceSourceEligible, selectedVersionForTarget, type CanvasPoint, type ProductionJob, type ProductionMediaVersion, type ProductionQueueEntry, type ProductionSequenceItem } from "./production-runtime.js";

export type { DramaMediaVersion };

export interface DramaAdapterOptionalEnvStatus {
  readonly name: string;
  readonly label: string;
  readonly configured: boolean;
  readonly note: string;
}

export type DramaAdapterPreflightStatus = DramaAdapterStatus & {
  readonly optionalEnv?: readonly DramaAdapterOptionalEnvStatus[] | undefined;
};

/** Mirror of the host `/oh-story/drama-preflight` summary: presence only, never values. */
export interface DramaPreflight {
  readonly python: { readonly ok: boolean; readonly version?: string; readonly minimum: string };
  readonly adapterConfig: { readonly path: string; readonly generated: boolean; readonly ok: boolean };
  readonly adapters: readonly DramaAdapterPreflightStatus[];
}

interface Props {
  readonly sessionId: string;
  readonly production: DramaEpisodeProduction;
  readonly documents?: Readonly<Record<string, string>> | undefined;
  readonly sessionRunning: boolean;
  readonly queue: readonly ProductionQueueEntry[];
  readonly section: DramaProductionSection;
  readonly selectedId: string | undefined;
  readonly jobs: readonly ProductionJob[];
  readonly versions: readonly DramaMediaVersion[];
  readonly libraryVersions: readonly DramaMediaVersion[];
  readonly selections: Readonly<Record<string, string>>;
  readonly manualReferences: Readonly<Record<string, readonly string[]>>;
  readonly sequence: readonly ProductionSequenceItem[];
  readonly canvas: Readonly<Record<string, CanvasPoint>>;
  readonly viewport: CanvasViewport | undefined;
  readonly onSectionChange: (section: DramaProductionSection) => void;
  readonly onSelect: (id: string | undefined) => void;
  readonly onNavigate: (target: DramaDocumentTarget) => void;
  readonly onJobsChange: (jobs: ProductionJob[]) => void;
  readonly onSelectionsChange: (selections: Record<string, string>) => void;
  readonly onManualReferencesChange: (references: Record<string, string[]>) => void;
  readonly onOpenMedia: (path: string) => void;
  readonly onSequenceChange: (sequence: ProductionSequenceItem[]) => void;
  readonly onCanvasChange: (canvas: Record<string, CanvasPoint>) => void;
  readonly onViewportChange: (viewport: CanvasViewport) => void;
  readonly onContinueInChat?: ((targetId: string) => void) | undefined;
  readonly onDispatchPrompt: (prompt: string) => Promise<void>;
  readonly onCancelTurn: () => Promise<void>;
  readonly onRemoveQueued: (itemId: string) => Promise<void>;
  readonly onRefresh: () => void;
}

const SECTION_LABELS: Readonly<Record<DramaProductionSection, string>> = { shots: "镜头清单", assets: "素材", tasks: "生成记录", sequence: "成片", canvas: "画布" };
const PRIMARY_SECTIONS: readonly DramaProductionSection[] = ["canvas", "assets", "tasks", "sequence"];
const STATUS_LABELS: Readonly<Record<ProductionJob["status"], string>> = { awaiting_confirmation: "等待确认", pending: "排队中", running: "生成中", dispatched_unknown: "状态待确认", succeeded: "已完成", failed: "失败", canceled: "已取消" };
const ASSET_KIND_LABEL = { character: "人物", scene: "场景", prop: "道具", state: "状态", unknown: "设定" } as const;
const JOB_KIND_LABEL = { image: "图片", video: "视频", composition: "成片" } as const;
/** Where `short-drama-edit` renders the assembled cut, relative to the episode directory. */
const ASSEMBLED_CUT_PATH = "制作成果/成片/成片.mp4";
const INTERACTIVE_CARD_DESCENDANTS = "button, a, input, select, textarea, summary, video, audio";

function isVisualMediaVersion(version: DramaMediaVersion): version is ProductionMediaVersion {
  return !isAudioMediaVersion(version) && (version.kind === "image" || version.kind === "video");
}

function effectiveMediaKind(version: DramaMediaVersion): "image" | "video" | "audio" {
  if (isAudioMediaVersion(version)) return "audio";
  return version.kind === "image" ? "image" : "video";
}

function deduplicateVersions<T extends { readonly id: string }>(versions: readonly T[]): T[] {
  const seen = new Set<string>();
  return versions.filter((version) => {
    if (seen.has(version.id)) return false;
    seen.add(version.id);
    return true;
  });
}

export function versionsForShot(shot: DramaShot, versions: readonly DramaMediaVersion[]): DramaMediaVersion[] {
  return deduplicateVersions(versions.filter((version) => (
    version.targetId === shot.id
    || (shot.group !== undefined && version.targetId === shot.group.id)
    || (shot.motion !== undefined && version.targetId === shot.motion.id)
  )));
}

function selectShotVersion(
  shot: DramaShot,
  versions: readonly DramaMediaVersion[],
  selections: Readonly<Record<string, string>>,
  kind: "image" | "video"
): ProductionMediaVersion | undefined {
  const candidates = versionsForShot(shot, versions).filter((version): version is ProductionMediaVersion => isVisualMediaVersion(version) && version.kind === kind);
  const explicit = selections[shot.id]
    ?? (shot.group === undefined ? undefined : selections[shot.group.id])
    ?? (shot.motion === undefined ? undefined : selections[shot.motion.id]);
  return candidates.find((version) => version.id === explicit) ?? candidates.at(-1);
}

/** Expand GROUP-* and MOTION-* video versions onto their member shots so sequence reconciliation and composition recognise multi-shot outputs. */
function expandVisualVersionsForShots(
  production: DramaEpisodeProduction,
  versions: readonly DramaMediaVersion[]
): ProductionMediaVersion[] {
  const visuals = versions.filter(isVisualMediaVersion);
  const groupMembers = new Map<string, readonly string[]>(
    production.groups.map((group) => [group.id, group.memberShotIds] as const)
  );
  const motionShots = new Map<string, string>(
    production.motions.flatMap((motion) => motion.shotId === undefined ? [] : [[motion.id, motion.shotId] as const])
  );
  const seen = new Set(visuals.map((version) => `${version.id}::${version.targetId}`));
  const expanded: ProductionMediaVersion[] = [...visuals];
  for (const version of visuals) {
    if (version.kind !== "video") continue;
    const motionShot = motionShots.get(version.targetId);
    if (motionShot !== undefined) {
      const key = `${version.id}::${motionShot}`;
      if (!seen.has(key)) {
        seen.add(key);
        expanded.push({ ...version, targetId: motionShot });
      }
    }
    const members = groupMembers.get(version.targetId);
    if (members === undefined) continue;
    for (const shotId of members) {
      const key = `${version.id}::${shotId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      expanded.push({ ...version, targetId: shotId });
    }
  }
  return expanded;
}

export function findAssembledCut(
  versions: readonly DramaMediaVersion[],
  libraryVersions: readonly DramaMediaVersion[] | undefined,
  episodeDirectory: string | undefined
): DramaMediaVersion | undefined {
  if (episodeDirectory === undefined) return undefined;
  const exactPath = `${episodeDirectory}/${ASSEMBLED_CUT_PATH}`;
  const editDirPrefix = `${episodeDirectory}/制作成果/成片/`;
  const all = [...(libraryVersions ?? []), ...versions].filter((version) => !isAudioMediaVersion(version) && version.kind === "video");
  const exact = all.findLast((version) => version.path === exactPath);
  if (exact !== undefined) return exact;
  return all.findLast((version) => {
    if (version.path === undefined || !mediaBelongsToEpisode(version.path, episodeDirectory)) return false;
    if (version.path.startsWith(editDirPrefix)) {
      const remainder = version.path.slice(editDirPrefix.length);
      return !remainder.includes("/") && /\.mp4$/iu.test(remainder);
    }
    return /(?:^|\/)成片-[^/]+\.mp4$/iu.test(version.path);
  });
}

export function compositionSources(
  production: DramaEpisodeProduction,
  sequence: readonly ProductionSequenceItem[],
  versions: readonly DramaMediaVersion[]
) {
  const visualVersions = versions.filter(isVisualMediaVersion);
  const versionById = new Map(visualVersions.map((version) => [version.id, version]));
  const shotById = new Map(production.shots.map((shot) => [shot.id, shot]));
  return sequence.flatMap((item) => {
    const version = item.versionId === undefined ? undefined : versionById.get(item.versionId);
    const path = version?.path;
    if (version === undefined || path === undefined) return [];
    const shot = shotById.get(item.shotId);
    const sourceId = version.kind === "video"
      ? version.targetId.startsWith("GROUP-")
        ? version.targetId
        : shot?.group !== undefined && version.path?.toLocaleUpperCase().includes(shot.group.id) === true
          ? shot.group.id
          : shot?.motion?.id ?? item.shotId
      : version.targetId.startsWith("IMG-") ? version.targetId : item.shotId;
    return [{ shotId: item.shotId, sourceId, kind: version.kind, path, durationSeconds: shot?.durationSeconds }];
  });
}

export interface DramaPipelineStep {
  readonly id: "screenplay" | "assets" | "keyframes" | "videos" | "cut";
  readonly label: string;
  readonly done: boolean;
  readonly ready?: number | undefined;
  readonly total?: number | undefined;
  readonly screenplayPath?: string | undefined;
  readonly section?: DramaProductionSection | undefined;
}

/** Glanceable non-blocking episode progress pills computed from real documents and outputs. */
export function dramaPipelineProgress(
  production: DramaEpisodeProduction,
  documents: Readonly<Record<string, string>> | undefined,
  versions: readonly DramaMediaVersion[],
  libraryVersions: readonly DramaMediaVersion[] | undefined
): readonly DramaPipelineStep[] {
  const screenplayPath = production.documentPaths.find((path) => path.endsWith("/剧本.md"))
    ?? production.documentPaths.find((path) => /\/screenplay\.md$/iu.test(path))
    ?? `${production.episodeDirectory}/剧本.md`;
  const screenplayText = documents?.[screenplayPath]?.trim();
  const hasScreenplay = (screenplayText !== undefined && screenplayText !== "")
    || production.documentPaths.includes(screenplayPath);

  const allAssets = [
    ...production.assets,
    ...production.visualAssets.filter((visual) => !production.assets.some((asset) => asset.title === visual.title))
  ];
  const totalAssets = allAssets.length;
  const readyAssets = allAssets.filter((asset) =>
    versions.some((version) => version.targetId === asset.id && isVisualMediaVersion(version))
  ).length;

  const totalShots = production.shots.length;
  const readyKeyframes = production.shots.filter((shot) =>
    versionsForShot(shot, versions).some((version) => isVisualMediaVersion(version) && version.kind === "image")
  ).length;
  const readyVideos = production.shots.filter((shot) =>
    versionsForShot(shot, versions).some((version) => isVisualMediaVersion(version) && version.kind === "video")
  ).length;

  const assembledCut = findAssembledCut(versions, libraryVersions, production.episodeDirectory);

  return [
    { id: "screenplay", label: "剧本", done: hasScreenplay, screenplayPath },
    {
      id: "assets",
      label: totalAssets > 0 ? `设定 ${String(readyAssets)}/${String(totalAssets)}` : "设定",
      done: totalAssets > 0 && readyAssets === totalAssets,
      ready: readyAssets,
      total: totalAssets,
      section: "assets"
    },
    {
      id: "keyframes",
      label: totalShots > 0 ? `关键帧 ${String(readyKeyframes)}/${String(totalShots)}` : "关键帧",
      done: totalShots > 0 && readyKeyframes === totalShots,
      ready: readyKeyframes,
      total: totalShots,
      section: "shots"
    },
    {
      id: "videos",
      label: totalShots > 0 ? `视频 ${String(readyVideos)}/${String(totalShots)}` : "视频",
      done: totalShots > 0 && readyVideos === totalShots,
      ready: readyVideos,
      total: totalShots,
      section: "shots"
    },
    { id: "cut", label: "成片", done: assembledCut !== undefined, section: "sequence" }
  ];
}

export function productionCanvasAvailable(production: DramaEpisodeProduction, documents: Readonly<Record<string, string>> | undefined): boolean {
  const screenplay = documents?.[`${production.episodeDirectory}/剧本.md`]?.trim();
  return production.shots.length + production.assets.length + production.visualAssets.length > 0 || (screenplay !== undefined && screenplay !== "");
}

const MODALITY_LABEL: Readonly<Record<DramaAdapterModality, string>> = { image: "图片", video: "视频", tts: "语音", music: "音乐" };

function missingModelEnvVars(adapter: DramaAdapterPreflightStatus): readonly DramaAdapterOptionalEnvStatus[] {
  return (adapter.optionalEnv ?? []).filter((item) => !item.configured && /MODEL/u.test(item.name));
}

/**
 * DeepSeek writes the prompts; the pictures, videos, speech and music come from
 * provider APIs that the produce Skill calls. Nothing in the conversation says so,
 * and the keys live in the host environment, so the 生产 view states it up front —
 * as one compact status pill per concern, with the detail one click away.
 */
export function ProductionStatus({ sessionId, diagnostics, onNavigate, onSectionChange, pipeline, initialPreflight, initialOpen = false }: {
  readonly sessionId: string;
  readonly diagnostics: DramaEpisodeProduction["diagnostics"];
  readonly onNavigate: (target: DramaDocumentTarget) => void;
  readonly onSectionChange?: ((section: DramaProductionSection) => void) | undefined;
  readonly pipeline?: readonly DramaPipelineStep[] | undefined;
  readonly initialPreflight?: DramaPreflight | "failed" | undefined;
  readonly initialOpen?: boolean | undefined;
}) {
  const [preflight, setPreflight] = useState<DramaPreflight | "failed" | undefined>(initialPreflight);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(initialOpen);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const statusRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { clearTimeout(copyTimerRef.current); }, []);

  // The summary is host-wide (the route ignores sessionId); the id only keeps
  // the URL shape shared with every other workbench endpoint.
  useEffect(() => {
    if (initialPreflight !== undefined && attempt === 0) return;
    const controller = new AbortController();
    void fetch(endpoint("drama-preflight", sessionId), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        const summary = await response.json() as DramaPreflight;
        if (!controller.signal.aborted) setPreflight(summary);
      })
      .catch(() => { if (!controller.signal.aborted) setPreflight("failed"); });
    return () => { controller.abort(); };
  }, [attempt, initialPreflight, sessionId]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onPointerDown = (event: PointerEvent) => {
      if (statusRef.current !== null && event.target instanceof Node && !statusRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const copyAdapterPath = (path: string) => {
    clearTimeout(copyTimerRef.current);
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      setCopyState("failed");
      copyTimerRef.current = setTimeout(() => { setCopyState("idle"); }, 2000);
      return;
    }
    void clipboard.writeText(path)
      .then(() => {
        setCopyState("copied");
        copyTimerRef.current = setTimeout(() => { setCopyState("idle"); }, 1500);
      })
      .catch(() => {
        setCopyState("failed");
        copyTimerRef.current = setTimeout(() => { setCopyState("idle"); }, 2000);
      });
  };

  const configured = typeof preflight === "object"
    ? preflight.adapters.filter((adapter) => adapter.configured && missingModelEnvVars(adapter).length === 0).length
    : 0;
  const anyConfigured = typeof preflight === "object" ? preflight.adapters.some((adapter) => adapter.configured) : false;
  const total = typeof preflight === "object" ? preflight.adapters.length : 0;
  const environmentTone = typeof preflight !== "object"
    ? "neutral"
    : !preflight.python.ok || !preflight.adapterConfig.ok
      ? "error"
      : total > 0 && configured === total ? "ready" : anyConfigured ? "partial" : "idle";
  const protocolErrors = diagnostics.filter((item) => item.severity === "error").length;
  const adapterFile = typeof preflight === "object" ? preflight.adapterConfig.path.split(/[\\/]/u).at(-1) : undefined;
  const detailTone = protocolErrors > 0 ? "error" : diagnostics.length > 0 ? "warning" : environmentTone;
  const detailSummary = preflight === "failed" ? "检查失败"
    : protocolErrors > 0 ? `${String(protocolErrors)} 项需要处理`
      : diagnostics.length > 0 ? `${String(diagnostics.length)} 项提醒`
        : typeof preflight !== "object" ? "检查中…"
          : !preflight.python.ok || !preflight.adapterConfig.ok ? "需要配置"
            : total > 0 && configured === total ? "制作就绪"
              : anyConfigured ? "部分能力可用" : "未配置媒体 API";
  return <div ref={statusRef} className="oh-story-production-status">
    <div className="oh-story-status-pills">
      <button ref={triggerRef} type="button" className="oh-story-status-pill" data-tone={detailTone} aria-expanded={open} aria-controls="oh-story-production-details" onClick={() => { setOpen((current) => !current); }}>
        <i aria-hidden="true" />制作详情<em>{detailSummary}</em><b aria-hidden="true" />
      </button>
      {pipeline !== undefined && pipeline.length > 0 && <div className="oh-story-pipeline-strip" role="group" aria-label="本集制作进度">
        {pipeline.map((step) => <button
          key={step.id}
          type="button"
          className="oh-story-pipeline-pill"
          data-step={step.id}
          data-done={step.done || undefined}
          onClick={() => {
            if (step.screenplayPath !== undefined) {
              onNavigate({ path: step.screenplayPath, offset: 0, id: step.screenplayPath });
            } else if (step.section !== undefined) {
              onSectionChange?.(step.section);
            }
          }}
        >{step.label}</button>)}
      </div>}
    </div>
    {open && <div id="oh-story-production-details" className="oh-story-production-details" role="region" aria-label="制作详情面板">
      {preflight === "failed" && <section className="oh-story-status-panel" aria-label="制作环境检查失败"><p>暂时无法检查制作能力。你仍可整理画布和素材，生成前请重新检查。</p><button type="button" onClick={() => { setPreflight(undefined); setAttempt((value) => value + 1); }}>重新检查</button></section>}
      {typeof preflight === "object" && <section className="oh-story-status-panel" id="oh-story-production-environment" aria-label="媒体生成环境详情">
        <ul className="oh-story-provider-list">
          <li data-ready={preflight.python.ok || undefined} data-error={!preflight.python.ok || undefined}><i aria-hidden="true" /><span>运行</span><strong>Python</strong><small>{preflight.python.ok ? preflight.python.version : `${preflight.python.version ?? "未找到"} · 短剧脚本需要 ${preflight.python.minimum}+`}</small></li>
          {preflight.adapters.map((adapter) => {
            const optionalEnv = adapter.optionalEnv ?? [];
            const missingModels = missingModelEnvVars(adapter);
            const needsModel = adapter.configured && missingModels.length > 0;
            return <li key={adapter.name} data-ready={(adapter.configured && !needsModel) || undefined} data-partial={needsModel || undefined}>
              <i aria-hidden="true" /><span>{MODALITY_LABEL[adapter.modality]}</span><strong>{adapter.label}</strong>
              {!adapter.configured
                ? <small>缺 {adapter.missing.map((name) => <code key={name}>{name}</code>)}</small>
                : needsModel
                  ? <small>需指定模型或设置 {missingModels.map((item) => <code key={item.name}>{item.name}</code>)}</small>
                  : <small>已配置</small>}
              {optionalEnv.length > 0 && <div className="oh-story-provider-optional-env">
                {optionalEnv.map((envItem) => <span key={envItem.name} className="oh-story-provider-env-item" data-configured={envItem.configured || undefined}>
                  <code>{envItem.name}</code>
                  <em>{envItem.label} · {envItem.configured ? "已设置" : "未设置"}</em>
                  {envItem.note !== "" && <small>{envItem.note}</small>}
                </span>)}
              </div>}
            </li>;
          })}
        </ul>
        <p>DeepSeek 只负责写剧本、分镜和提示词，图片、视频、语音与配乐由上方供应商接口生成。请在启动 DSH 前通过宿主机环境变量配置所需 Key{!anyConfigured ? "（当前均未配置，调用外部接口前会先停下提醒）" : ""}，变量说明见 README「媒体 API」一节。</p>
        <footer>
          <span>Adapter 配置{preflight.adapterConfig.generated ? "（自动登记）" : "（自定义）"}{preflight.adapterConfig.ok ? "" : " · 写入失败"}</span>
          <code title={preflight.adapterConfig.path}>{adapterFile}</code>
          <button type="button" onClick={() => { copyAdapterPath(preflight.adapterConfig.path); }}>{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制路径"}</button>
        </footer>
      </section>}
      {diagnostics.length > 0 && <section className="oh-story-status-panel oh-story-production-diagnostics" id="oh-story-production-diagnostics" aria-label="文档格式提醒">
        <ul>{diagnostics.slice(0, 8).map((item) => <li data-severity={item.severity} key={`${item.path}:${String(item.offset)}:${item.code}`}>
          <button type="button" onClick={() => { onNavigate({ path: item.path, offset: item.offset, id: item.targetId ?? item.code }); }}>{item.path.split("/").at(-1)}<span>:{item.line}</span></button>
          <span>{item.message}</span>
        </li>)}</ul>
        {diagnostics.length > 8 && <p>另有 {diagnostics.length - 8} 项，请按文档位置修复。</p>}
      </section>}
    </div>}
  </div>;
}

export function batchProductionCandidates(
  production: DramaEpisodeProduction,
  kind: "image" | "video"
): Array<{ readonly id: string; readonly prompt: string }> {
  if (kind === "image") {
    return production.shots.flatMap((shot) => shot.keyframePrompt === undefined ? [] : [{ id: shot.id, prompt: shot.keyframePrompt }]);
  }
  const seen = new Set<string>();
  const items: Array<{ readonly id: string; readonly prompt: string }> = [];
  for (const shot of production.shots) {
    const candidate = shot.group?.prompt !== undefined
      ? { id: shot.group.id, prompt: shot.group.prompt }
      : shot.motion?.prompt !== undefined
        ? { id: shot.motion.id, prompt: shot.motion.prompt }
        : undefined;
    if (candidate === undefined || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    items.push(candidate);
  }
  return items;
}

export function DramaProductionView(props: Props) {
  const [notice, setNotice] = useState<string>();
  const jobsRef = useRef(props.jobs);
  const commitJobs = useCallback((next: ProductionJob[]) => {
    jobsRef.current = next;
    props.onJobsChange(next);
  }, [props.onJobsChange]);
  useEffect(() => { jobsRef.current = props.jobs; }, [props.jobs]);

  const visualVersions = useMemo(
    () => expandVisualVersionsForShots(props.production, props.versions),
    [props.production, props.versions]
  );
  const visualLibraryVersions = useMemo(
    () => props.libraryVersions.filter(isVisualMediaVersion),
    [props.libraryVersions]
  );

  useEffect(() => {
    const next = reconcileSequence(props.production.shots.map((shot) => shot.id), props.sequence, visualVersions, props.selections, props.production.episodeDirectory);
    if (JSON.stringify(next) !== JSON.stringify(props.sequence)) props.onSequenceChange(next);
  }, [props.production.shots, props.selections, props.sequence, visualVersions]);

  useEffect(() => {
    const next = reconcileProductionJobs(props.jobs, props.queue, props.sessionRunning, visualVersions);
    if (JSON.stringify(next) !== JSON.stringify(props.jobs)) commitJobs(next);
  }, [commitJobs, props.jobs, props.queue, props.sessionRunning, visualVersions]);

  const dispatchJob = async (job: ProductionJob, references: readonly ProductionMediaVersion[] = []) => {
    commitJobs([...jobsRef.current, { ...job, status: "awaiting_confirmation" }]);
    if (props.section !== "canvas") props.onSectionChange("tasks");
    try {
      await props.onDispatchPrompt(nativeProductionPrompt(props.production, job, references));
      setNotice(`${targetDisplayName(props.production, job.targetId)} 正在准备；请在 Chat 核对后确认。`);
    } catch (error) {
      commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : String(error) } : item));
    }
  };

  const createJob = async (targetId: string, kind: "image" | "video", prompt: string) => {
    if (prompt.trim() === "") { setNotice(`${targetId} 没有可投产提示词。`); return; }
    const job = createPendingJob({ id: crypto.randomUUID(), targetId, kind, prompt });
    await dispatchJob(job, kind === "video" ? referencesForTarget(targetId, props.production, visualVersions, props.selections, visualLibraryVersions, props.manualReferences) : []);
  };

  const writeImagePromptsForVisual = async (visual: { readonly id: string; readonly title: string; readonly path?: string | undefined }) => {
    try {
      await props.onDispatchPrompt(nativeVisualImagePromptRequest(props.production, visual));
      setNotice(`已带「${visual.title}」进入 Chat 编写图片提示词（IMG-*）。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const prepareMusic = async (music: DramaMusicPrompt) => {
    try {
      await props.onDispatchPrompt(nativeMusicProductionPrompt(props.production, music));
      setNotice(`配乐「${music.title}」正在准备预览；请在 Chat 核对后确认。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const createBatch = async (kind: "image" | "video") => {
    const candidates = batchProductionCandidates(props.production, kind);
    if (candidates.length === 0) { setNotice(kind === "image" ? "没有可投产的关键帧提示词。" : "没有可投产的视频提示词。"); return; }
    const job = createPendingJob({ id: crypto.randomUUID(), targetId: kind === "image" ? "BATCH-KEYFRAMES" : "BATCH-VIDEOS", kind, prompt: candidates.map((item) => `${item.id}\n${item.prompt}`).join("\n\n"), expectedOutputs: candidates.length });
    commitJobs([...jobsRef.current, { ...job, status: "awaiting_confirmation" }]); props.onSectionChange("tasks");
    try { await props.onDispatchPrompt(nativeBatchPrompt(props.production, job, candidates)); setNotice(`${String(candidates.length)} 个镜头正在准备同一批次预检；请在 Chat 核对后明确确认。`); }
    catch (error) { commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : String(error) } : item)); }
  };

  const dispatchComposition = async (job: ProductionJob) => {
    const ordered = compositionSources(props.production, props.sequence, visualVersions);
    commitJobs([...jobsRef.current, job]); props.onSectionChange("tasks");
    try { await props.onDispatchPrompt(nativeCompositionPrompt(props.production, job, ordered)); setNotice("成片任务已提交；涉及文件、渲染和写入的操作仍会按右侧对话中的确认流程执行。"); }
    catch (error) { commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : String(error) } : item)); }
  };

  const cancelJob = async (job: ProductionJob) => {
    try { await props.onCancelTurn(); commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "canceled", progress: 0 } : item)); setNotice("已请求停止当前生成；队列中的其他任务会保留。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const removeQueuedJob = async (job: ProductionJob, itemId: string) => {
    try { await props.onRemoveQueued(itemId); commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "canceled", progress: 0 } : item)); setNotice(`${job.targetId} 已从 DSH Queue 移除。`); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const composeSequence = () => {
    const issues = sequenceIssues(props.sequence, visualVersions, props.production.episodeDirectory);
    if (issues.length > 0) { setNotice(issues[0]); return; }
    // short-drama-edit renders to this fixed path, so the job correlates on the deliverable
    // rather than on a job id in the filename, and ignores a cut that was already there.
    const outputPath = `${props.production.episodeDirectory}/${ASSEMBLED_CUT_PATH}`;
    void dispatchComposition(createPendingJob({
      id: crypto.randomUUID(),
      targetId: props.production.episodeDirectory,
      kind: "composition",
      prompt: "按成片顺序合成",
      outputPath,
      supersededOutputIds: props.libraryVersions.flatMap((version) => version.path === outputPath ? [version.id] : [])
    }));
  };

  const activeJobs = props.jobs.filter((job) => job.status === "awaiting_confirmation" || job.status === "running" || job.status === "pending").length;
  const canvasAvailable = productionCanvasAvailable(props.production, props.documents);
  const pipeline = useMemo(
    () => dramaPipelineProgress(props.production, props.documents, props.versions, props.libraryVersions),
    [props.production, props.documents, props.versions, props.libraryVersions]
  );
  return <div className="oh-story-production">
    <div className="oh-story-production-bar"><div className="oh-story-production-tabs" role="tablist" aria-label="短剧生产视图">{PRIMARY_SECTIONS.map((item) => <button type="button" role="tab" tabIndex={props.section === item || (props.section === "shots" && item === "canvas") ? 0 : -1} aria-selected={props.section === item} key={item} onKeyDown={(event) => { handleTabKey(event, PRIMARY_SECTIONS, item, props.onSectionChange); }} onClick={() => { props.onSectionChange(item); }}>{SECTION_LABELS[item]}</button>)}</div><div className="oh-story-production-meta"><span className="oh-story-production-summary">{props.production.shots.length} 个镜头 · {props.production.assets.length + props.production.visualAssets.length + props.production.music.length} 项素材{activeJobs > 0 ? ` · ${String(activeJobs)} 项制作中` : ""}</span><button type="button" className="oh-story-shot-list-trigger" aria-pressed={props.section === "shots"} onClick={() => { props.onSectionChange("shots"); }}>镜头清单</button><button type="button" onClick={props.onRefresh}>刷新</button></div></div>
    <ProductionStatus sessionId={props.sessionId} diagnostics={props.production.diagnostics} onNavigate={props.onNavigate} onSectionChange={props.onSectionChange} pipeline={pipeline} />
    {notice !== undefined && <div className="oh-story-production-notice" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={() => { setNotice(undefined); }}>×</button></div>}
    {props.section === "shots" && <ShotBoard {...props} onCreateJob={createJob} onBatch={createBatch} />}
    {props.section === "assets" && <AssetBoard {...props} onCreateJob={createJob} onWriteImagePrompts={writeImagePromptsForVisual} onPrepareMusic={prepareMusic} />}
    {props.section === "tasks" && <TaskBoard production={props.production} jobs={props.jobs} queue={props.queue} sessionRunning={props.sessionRunning} onCancel={cancelJob} onRemoveQueued={removeQueuedJob} />}
    {props.section === "sequence" && <SequenceBoard {...props} versions={visualVersions} production={props.production} episodeDirectory={props.production.episodeDirectory} onCompose={composeSequence} />}
    {props.section === "canvas" && (canvasAvailable
      ? <ProductionCanvas key={props.production.episodeDirectory} production={props.production} documents={props.documents} selectedId={props.selectedId} canvas={props.canvas} viewport={props.viewport} versions={props.versions} jobs={props.jobs} selections={props.selections} onSelectionsChange={props.onSelectionsChange} onPrepare={createJob} onWriteImagePrompts={(node) => writeImagePromptsForVisual({ id: node.id, title: node.title, path: node.target?.path })} onOpenMedia={props.onOpenMedia} onContinueInChat={props.onContinueInChat} onSelect={props.onSelect} onNavigate={props.onNavigate} onCanvasChange={props.onCanvasChange} onViewportChange={props.onViewportChange} />
      : <section className="oh-story-canvas-shell" aria-label="短剧素材与镜头关系画布"><MissingDocument document={`${props.production.episodeDirectory}/分镜.md`} documentPaths={props.production.documentPaths} what="关系" skill="/short-drama-storyboard" onNavigate={props.onNavigate} onDiscuss={props.onContinueInChat === undefined ? undefined : () => { props.onContinueInChat?.(props.production.episodeDirectory); }} /></section>)}
  </div>;
}

function ShotBoard(props: Props & { readonly onCreateJob: (targetId: string, kind: "image" | "video", prompt: string) => Promise<void>; readonly onBatch: (kind: "image" | "video") => Promise<void> }) {
  const selectedRef = useScrollIntoView(props.selectedId);
  if (props.production.shots.length === 0) return <section className="oh-story-shot-board"><MissingDocument document={`${props.production.episodeDirectory}/分镜.md`} documentPaths={props.production.documentPaths} what="镜头" skill="/short-drama-storyboard" onNavigate={props.onNavigate} onDiscuss={props.onContinueInChat === undefined ? undefined : () => { props.onContinueInChat?.(props.production.episodeDirectory); }} /></section>;
  return <section className="oh-story-shot-board"><div className="oh-story-production-actions"><button type="button" onClick={() => { void props.onBatch("image"); }}>准备批量关键帧</button><button type="button" onClick={() => { void props.onBatch("video"); }}>准备批量视频</button></div><div className="oh-story-shot-grid">{props.production.shots.map((shot) => {
    const completeness = productionCompleteness(shot);
    const versions = versionsForShot(shot, props.versions);
    const selectedImage = selectShotVersion(shot, props.versions, props.selections, "image");
    const selectedVideo = selectShotVersion(shot, props.versions, props.selections, "video");
    const selected = selectedVideo ?? selectedImage;
    const videoPrompt = shot.group?.prompt ?? shot.motion?.prompt;
    const videoTargetId = shot.group?.prompt !== undefined
      ? shot.group.id
      : shot.motion?.prompt !== undefined
        ? shot.motion.id
        : shot.group?.id ?? shot.motion?.id ?? shot.id;
    return <article
      className="oh-story-shot-card"
      role="group"
      tabIndex={0}
      aria-label={`镜头 ${shot.title}`}
      ref={props.selectedId === shot.id ? selectedRef : undefined}
      data-selected={props.selectedId === shot.id || undefined}
      key={shot.id}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect(shot.id);
        }
      }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest(INTERACTIVE_CARD_DESCENDANTS) !== null) return;
        props.onSelect(shot.id);
      }}
    >
      {selected === undefined ? <div className="oh-story-shot-placeholder"><strong>{shot.title}</strong><span>还没有画面</span></div> : <MediaPreview version={selected} />}<header><h3>{shot.title}</h3><span>{shot.durationSeconds === undefined ? "时长待定" : `${String(shot.durationSeconds)} 秒`}</span></header>{shot.shotSpec !== undefined && <p>{shot.shotSpec}</p>}<dl><dt>起</dt><dd>{shot.start ?? "未填写"}</dd><dt>终</dt><dd>{shot.end ?? "未填写"}</dd></dl>
      <div className="oh-story-shot-status"><MediaStatusBadge label="关键帧" ready={selectedImage !== undefined} /><MediaStatusBadge label="视频" ready={selectedVideo !== undefined} /><span>{versions.length === 0 ? "暂无成果" : `${String(versions.length)} 个版本`}</span></div><div className="oh-story-reference-links">{shot.sceneIds.length > 0 ? shot.sceneIds.map((sceneId) => <ReferenceButton key={sceneId} id={sceneId} production={props.production} onNavigate={props.onNavigate} />) : shot.source !== undefined && <ReferenceButton id={shot.source} production={props.production} onNavigate={props.onNavigate} />}{shot.references.map((id) => <ReferenceButton id={id} production={props.production} onNavigate={props.onNavigate} key={id} />)}{shot.group !== undefined && <ReferenceButton id={shot.group.id} production={props.production} onNavigate={props.onNavigate} />}</div>
      <div className="oh-story-card-actions">{shot.keyframePrompt !== undefined && <button type="button" onClick={(event) => { event.stopPropagation(); void props.onCreateJob(shot.id, "image", shot.keyframePrompt ?? ""); }}>准备关键帧</button>}{videoPrompt !== undefined && <button type="button" onClick={(event) => { event.stopPropagation(); void props.onCreateJob(videoTargetId, "video", videoPrompt); }}>准备视频</button>}</div>{versions.length > 1 && <VersionStrip targetId={shot.id} versions={versions} selections={props.selections} onSelectionsChange={props.onSelectionsChange} />}<details className="oh-story-card-details" onClick={(event) => { event.stopPropagation(); }}><summary>制作详情</summary><p>{shot.id}{shot.group === undefined ? "" : ` · ${shot.group.id}`}</p><p>关键帧提示词{completeness.keyframe ? "已备" : "待补"} · 运动提示词{completeness.motion ? "已备" : "待补"} · 参考{completeness.references ? "已关联" : "待补"}</p><button type="button" onClick={() => { props.onNavigate({ path: shot.path, offset: shot.offset, id: shot.id }); }}>查看原文</button></details>
    </article>;
  })}</div></section>;
}

function AssetBoard(props: Props & {
  readonly onCreateJob: (targetId: string, kind: "image" | "video", prompt: string) => Promise<void>;
  readonly onWriteImagePrompts: (visual: { readonly id: string; readonly title: string; readonly path?: string | undefined }) => Promise<void>;
  readonly onPrepareMusic: (music: DramaMusicPrompt) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "video" | "audio">("all");
  const assets = [...props.production.assets, ...props.production.visualAssets.filter((visual) => !props.production.assets.some((asset) => asset.title === visual.title))];
  const musicItems = props.production.music;
  const needle = query.trim().toLocaleLowerCase();
  const library = props.libraryVersions.filter((version) => (kind === "all" || effectiveMediaKind(version) === kind) && (needle === "" || `${targetDisplayName(props.production, version.targetId)} ${version.targetId} ${version.path ?? ""}`.toLocaleLowerCase().includes(needle)));
  const selectedRef = useScrollIntoView(props.selectedId);
  const referenceTarget = props.selectedId?.startsWith("SHOT-") === true ? props.selectedId : undefined;
  const toggleReference = (versionId: string) => {
    if (referenceTarget === undefined) return;
    const current = props.manualReferences[referenceTarget] ?? [];
    const next = current.includes(versionId) ? current.filter((id) => id !== versionId) : [...current, versionId];
    const mutable = Object.fromEntries(Object.entries(props.manualReferences).map(([target, ids]) => [target, [...ids]]));
    props.onManualReferencesChange({ ...mutable, [referenceTarget]: next });
  };
  if (assets.length === 0 && musicItems.length === 0 && props.libraryVersions.length === 0) return <section className="oh-story-assets"><MissingDocument document={`${props.production.episodeDirectory}/图片提示词.md`} documentPaths={props.production.documentPaths} what="素材" skill="/short-drama-image-prompts" onNavigate={props.onNavigate} onDiscuss={props.onContinueInChat === undefined ? undefined : () => { props.onContinueInChat?.(props.production.episodeDirectory); }} /></section>;
  return <section className="oh-story-assets">
    <div className="oh-story-asset-grid">{assets.map((asset) => {
      const unresolvedVisual = "stableId" in asset;
      const prompt = unresolvedVisual ? undefined : asset.prompt;
      const description = unresolvedVisual ? asset.description.split("\n").find((line) => line.trim() !== "") : asset.purpose ?? asset.reference;
      const versions = props.versions.filter((version) => version.targetId === asset.id);
      const visualAssetVersions = versions.filter(isVisualMediaVersion);
      const selected = selectedVersionForTarget(asset.id, visualAssetVersions, props.selections, "image");
      return <article
        className="oh-story-asset-card"
        role="group"
        tabIndex={0}
        aria-label={`素材 ${asset.title}`}
        ref={props.selectedId === asset.id ? selectedRef : undefined}
        data-selected={props.selectedId === asset.id || undefined}
        key={asset.id}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onSelect(asset.id);
          }
        }}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest(INTERACTIVE_CARD_DESCENDANTS) !== null) return;
          props.onSelect(asset.id);
        }}
      >
        <div className="oh-story-asset-media" data-kind={asset.kind}>{selected === undefined ? <div className="oh-story-asset-placeholder" aria-hidden="true">{asset.kind === "character" ? "人" : asset.kind === "scene" ? "景" : asset.kind === "prop" ? "物" : "设"}</div> : <MediaPreview version={selected} />}<small>{ASSET_KIND_LABEL[asset.kind]}</small></div>
        <div className="oh-story-asset-head"><h3>{asset.title}</h3><span className="oh-story-status-chip" data-status={selected !== undefined ? "ready" : unresolvedVisual ? "warning" : "idle"}><i aria-hidden />{selected !== undefined ? "已生成" : unresolvedVisual ? "待写提示词" : "待生成"}</span></div>
        <p className="oh-story-asset-description">{description ?? `${ASSET_KIND_LABEL[asset.kind]}参考素材`}</p>
        <div className="oh-story-card-actions">{unresolvedVisual
          ? <button type="button" onClick={() => { void props.onWriteImagePrompts(asset); }}>去写图片提示词</button>
          : prompt !== undefined && <button type="button" onClick={() => { void props.onCreateJob(asset.id, "image", prompt); }}>准备素材</button>}</div>
        {versions.length > 0 && <VersionStrip targetId={asset.id} versions={versions} selections={props.selections} onSelectionsChange={props.onSelectionsChange} />}
        <details className="oh-story-card-details"><summary>制作详情</summary><p>{asset.id}</p><button type="button" onClick={() => { props.onNavigate({ path: asset.path, offset: asset.offset, id: asset.id }); }}>查看原文</button></details>
      </article>;
    })}{musicItems.map((music) => {
      const versions = props.versions.filter((version) => version.targetId === music.id);
      const selected = versions.find((version) => version.id === props.selections[music.id]) ?? versions.at(-1);
      return <article
        className="oh-story-asset-card oh-story-music-card"
        role="group"
        tabIndex={0}
        aria-label={`配乐 ${music.title}`}
        ref={props.selectedId === music.id ? selectedRef : undefined}
        data-selected={props.selectedId === music.id || undefined}
        key={music.id}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onSelect(music.id);
          }
        }}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest(INTERACTIVE_CARD_DESCENDANTS) !== null) return;
          props.onSelect(music.id);
        }}
      >
        <div className="oh-story-asset-media" data-kind="music">{selected === undefined ? <div className="oh-story-asset-placeholder" aria-hidden="true">乐</div> : <MediaPreview version={selected} />}<small>配乐</small></div>
        <div className="oh-story-asset-head"><h3>{music.title}</h3><span className="oh-story-status-chip" data-status={selected === undefined ? "idle" : "ready"}><i aria-hidden />{selected === undefined ? "待生成" : "已生成"}</span></div>
        <p className="oh-story-asset-description">{music.purpose ?? music.mood ?? music.range ?? "成片配乐素材"}</p>
        <div className="oh-story-card-actions">{music.prompt !== undefined && <button type="button" onClick={() => { void props.onPrepareMusic(music); }}>准备素材</button>}</div>
        {versions.length > 1 && <VersionStrip targetId={music.id} versions={versions} selections={props.selections} onSelectionsChange={props.onSelectionsChange} />}
        <details className="oh-story-card-details"><summary>制作详情</summary><p>{music.id}</p>{music.range !== undefined && <p>区间：{music.range}</p>}<button type="button" onClick={() => { props.onNavigate({ path: music.path, offset: music.offset, id: music.id }); }}>查看原文</button></details>
      </article>;
    })}</div>
    <div className="oh-story-media-library"><header><div><strong>项目媒体库</strong><span>{library.length}/{props.libraryVersions.length} 项 · 可跨集复用</span></div><div><input aria-label="搜索项目媒体" value={query} placeholder="搜索名称或文件" onChange={(event) => { setQuery(event.target.value); }} /><select aria-label="筛选媒体类型" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); }}><option value="all">全部</option><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option></select></div></header>
      <p className="oh-story-projection-note">{referenceTarget === undefined ? "先在镜头清单里选中一个镜头，再到这里把已有图片设为补充参考。" : `可把下面的图片设为「${targetDisplayName(props.production, referenceTarget)}」的补充参考。`}补充参考只提示 Agent 核对；写进来源条目的「输入参考图」后才会送进生产。</p>
      <div className="oh-story-media-library-grid">{library.map((version) => { const selected = referenceTarget !== undefined && (props.manualReferences[referenceTarget] ?? []).includes(version.id); return <article key={version.id}><MediaPreview version={version} /><strong>{targetDisplayName(props.production, version.targetId)}</strong><details><summary>文件详情</summary><span title={version.path}>{version.path}</span></details><footer>{version.path !== undefined && <button type="button" onClick={() => { props.onOpenMedia(version.path!); }}>打开文件</button>}{referenceTarget !== undefined && effectiveMediaKind(version) === "image" && <button type="button" aria-pressed={selected} aria-label={`${selected ? "取消" : "设为"} ${targetDisplayName(props.production, referenceTarget)} 的参考`} title="提示 Agent 核对；写进「输入参考图」后才会送进生产" onClick={() => { toggleReference(version.id); }}>{selected ? "已设补充参考" : "设为补充参考"}</button>}</footer></article>; })}</div>
    </div>
  </section>;
}

function TaskBoard({ production, jobs, queue, sessionRunning, onCancel, onRemoveQueued }: {
  readonly production: DramaEpisodeProduction;
  readonly jobs: readonly ProductionJob[];
  readonly queue: readonly ProductionQueueEntry[];
  readonly sessionRunning: boolean;
  readonly onCancel: (job: ProductionJob) => Promise<void>;
  readonly onRemoveQueued: (job: ProductionJob, itemId: string) => Promise<void>;
}) {
  const activeJobId = activeProductionJobId(jobs, queue, sessionRunning);
  return <section className="oh-story-task-board">
    <p className="oh-story-board-hint">这里跟踪图片、视频与成片任务。每项都会先给出预览，再由你在右侧对话中确认；语音和音乐也在右侧对话中完成。</p>
    {jobs.length === 0 ? <div className="oh-story-production-empty"><strong>还没有生成记录</strong><p>从画布、镜头清单或素材页准备画面，确认后的任务会出现在这里。</p></div> : [...jobs].reverse().map((job) => {
      const queued = queuedItemForJob(job.id, queue);
      const displayStatus = queued === undefined ? STATUS_LABELS[job.status] : "生成队列";
      return <article key={job.id} data-job-id={job.id} data-status={job.status}><header><strong>{targetDisplayName(production, job.targetId)}</strong><span>{JOB_KIND_LABEL[job.kind]}</span><span>{displayStatus}</span></header><div className="oh-story-task-progress"><i style={{ width: `${String(job.progress)}%` }} /></div><details><summary>制作详情</summary><p>{job.targetId}</p><p>任务：{job.id}</p><p>{job.prompt}</p></details>{job.expectedOutputs > 1 && <small>{job.completedOutputs}/{job.expectedOutputs} 项成果</small>}{job.error !== undefined && <div className="oh-story-error">{job.error}</div>}{job.output !== undefined && <MediaPreview version={job.output} />}<footer>{queued !== undefined && (job.status === "awaiting_confirmation" || job.status === "pending" || job.status === "running") && <button type="button" onClick={() => { void onRemoveQueued(job, queued.id); }}>从生成队列移除</button>}{activeJobId === job.id && <button type="button" onClick={() => { void onCancel(job); }}>停止当前生成</button>}</footer></article>;
    })}
  </section>;
}

export function SequenceBoard(props: Pick<Props, "jobs" | "sequence" | "versions" | "onSequenceChange"> & {
  readonly libraryVersions?: readonly DramaMediaVersion[] | undefined;
  readonly onOpenMedia?: ((path: string) => void) | undefined;
  readonly production?: DramaEpisodeProduction;
  readonly episodeDirectory?: string;
  readonly onCompose: () => void;
}) {
  const composing = compositionInFlight(props.jobs);
  const scopedVersions = props.versions.filter((version): version is ProductionMediaVersion => isVisualMediaVersion(version) && (props.episodeDirectory === undefined || mediaBelongsToEpisode(version.path, props.episodeDirectory)));
  const assembledCut = findAssembledCut(props.versions, props.libraryVersions, props.episodeDirectory);
  const issues = sequenceIssues(props.sequence, scopedVersions, props.episodeDirectory); const versionById = new Map(scopedVersions.map((version) => [version.id, version])); const move = (index: number, delta: number) => { const source = props.sequence[index]; const target = props.sequence[index + delta]; if (source !== undefined && target !== undefined) props.onSequenceChange(reorderSequence(props.sequence, index, index + delta)); };
  const chooseSource = (shotId: string, sourceVersionId: string) => {
    props.onSequenceChange(props.sequence.map((item) => item.shotId !== shotId
      ? item
      : sourceVersionId === "" ? { shotId: item.shotId, versionId: item.versionId } : { ...item, sourceVersionId, versionId: sourceVersionId }));
  };
  return <section className="oh-story-sequence">
    {assembledCut !== undefined && <div className="oh-story-sequence-cut" aria-label="已合成成片预览">
      <header className="oh-story-sequence-cut-head">
        <div><strong>最新成片</strong><span>{assembledCut.path?.split("/").at(-1) ?? "成片.mp4"}</span></div>
        {assembledCut.path !== undefined && props.onOpenMedia !== undefined && <button type="button" onClick={() => { props.onOpenMedia?.(assembledCut.path!); }}>打开文件</button>}
      </header>
      <video className="oh-story-sequence-cut-player" src={assembledCut.url} controls preload="metadata" />
    </div>}
    <div className="oh-story-sequence-summary"><strong>{props.sequence.length} 个镜头</strong><span>{props.sequence.length === 0 ? "还没有镜头" : composing ? "成片任务进行中" : issues.length === 0 ? "已可合成" : `${String(issues.length)} 个阻塞项`}</span><button type="button" disabled={composing || issues.length > 0 || props.sequence.length < 2} onClick={props.onCompose}>合成成片</button></div>
    {issues.length > 0 && <ul className="oh-story-sequence-issues">{issues.slice(0, 3).map((issue) => <li key={issue}>{issue}</li>)}{issues.length > 3 && <li>另有 {issues.length - 3} 个阻塞项，请在下方镜头行补齐素材。</li>}</ul>}
    <ol>{props.sequence.map((item, index) => { const version = item.versionId === undefined ? undefined : versionById.get(item.versionId); const choices = scopedVersions.filter((candidate) => candidate.path !== undefined && sequenceSourceEligible(item.shotId, candidate)); const explicitMissing = item.sourceVersionId !== undefined && !choices.some((choice) => choice.id === item.sourceVersionId); const shotName = targetDisplayName(props.production, item.shotId); return <li key={item.shotId}><span>{String(index + 1).padStart(2, "0")}</span>{version === undefined ? <div className="oh-story-sequence-missing">缺少素材</div> : <MediaPreview version={version} interactive={false} />}<div className="oh-story-sequence-main"><strong title={item.shotId}>{shotName}</strong><select aria-label={`选择 ${shotName} 成片素材`} value={item.sourceVersionId ?? ""} onChange={(event) => { chooseSource(item.shotId, event.target.value); }}><option value="">自动（视频优先）</option>{explicitMissing && <option value={item.sourceVersionId} disabled>已选素材不可用</option>}{choices.map((choice) => <option value={choice.id} key={choice.id}>{targetDisplayName(props.production, choice.targetId)} · {choice.kind === "video" ? "视频" : "静帧"} · {choice.path?.split("/").at(-1)}</option>)}</select></div><div className="oh-story-sequence-move"><button type="button" aria-label={`上移 ${shotName}`} disabled={index === 0} onClick={() => { move(index, -1); }}>↑</button><button type="button" aria-label={`下移 ${shotName}`} disabled={index === props.sequence.length - 1} onClick={() => { move(index, 1); }}>↓</button></div></li>; })}</ol>
  </section>;
}

/** Scroll the card an Agent focus_target selected into view; without it the tab switches but the card stays off-screen. */
function useScrollIntoView(selectedId: string | undefined) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest" }); }, [selectedId]);
  return ref;
}

function MediaStatusBadge({ label, ready }: { readonly label: string; readonly ready: boolean }) {
  return <span data-ready={ready} aria-label={`${label}${ready ? "已生成" : "待生成"}`}><i aria-hidden="true">{ready ? "✓" : "—"}</i>{label}{ready ? "已生成" : "待生成"}</span>;
}

function MissingDocument({ document, documentPaths, what, skill, onNavigate, onDiscuss }: {
  readonly document: string;
  readonly documentPaths: readonly string[];
  readonly what: string;
  readonly skill: string;
  readonly onNavigate: (target: DramaDocumentTarget) => void;
  readonly onDiscuss?: (() => void) | undefined;
}) {
  const present = documentPaths.includes(document);
  return <div className="oh-story-production-empty">
    <strong>还没有可展示的{what}</strong>
    <p>{present
      ? `${document.split("/").at(-1) ?? document} 已存在，但还没有整理出可展示条目。可以先打开文稿核对标题格式。`
      : `本集还没有「${document.split("/").at(-1) ?? document}」。在 Chat 里使用 ${skill} 整理好后，这里会自动出现。`}</p>
    {present
      ? <button type="button" onClick={() => { onNavigate({ path: document, offset: 0, id: document }); }}>打开 {document.split("/").at(-1)}</button>
      : onDiscuss !== undefined && <button type="button" onClick={onDiscuss}>去 Chat 整理{what}</button>}
  </div>;
}

function ReferenceButton({ id, production, onNavigate }: { readonly id: string; readonly production: DramaEpisodeProduction; readonly onNavigate: (target: DramaDocumentTarget) => void }) { const target = production.targets.get(id); const name = targetDisplayName(production, id); return <button type="button" title={id} disabled={target === undefined} onClick={(event) => { event.stopPropagation(); if (target !== undefined) onNavigate(target); }}>{name === id ? "关联原文" : name}</button>; }
function MediaPreview({ version, interactive = true }: { readonly version: DramaMediaVersion; readonly interactive?: boolean }) {
  if (isAudioMediaVersion(version)) {
    return <audio className="oh-story-media-preview oh-story-audio-preview" src={version.url} controls={interactive} preload="metadata" />;
  }
  return version.kind === "image" ? <img className="oh-story-media-preview" src={version.url} alt={version.targetId} loading="lazy" /> : <video className="oh-story-media-preview" src={version.url} controls={interactive} muted={!interactive} preload="metadata" />;
}
function VersionStrip({ targetId, versions, selections, onSelectionsChange }: { readonly targetId: string; readonly versions: readonly DramaMediaVersion[]; readonly selections: Readonly<Record<string, string>>; readonly onSelectionsChange: (value: Record<string, string>) => void }) { const selected = versions.find((version) => version.id === selections[targetId])?.id ?? versions.at(-1)?.id; return <div className="oh-story-version-strip" aria-label={`${targetId} 成果版本`}>{versions.map((version, index) => <button type="button" aria-pressed={version.id === selected} aria-label={`选择 ${targetId} 版本 ${String(index + 1)}`} data-selected={version.id === selected || undefined} key={version.id} onClick={(event) => { event.stopPropagation(); onSelectionsChange({ ...selections, [targetId]: version.id }); }}><MediaPreview version={version} interactive={false} /><span>V{String(index + 1)}</span></button>)}</div>; }
