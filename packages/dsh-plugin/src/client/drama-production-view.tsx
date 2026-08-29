import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { productionCompleteness, type DramaDocumentTarget, type DramaEpisodeProduction, type DramaProductionSection } from "./drama-production.js";
import { nativeBatchPrompt, nativeCompositionPrompt, nativeProductionPrompt } from "./production-prompts.js";
import { activeProductionJobId, createPendingJob, queuedItemForJob, reconcileProductionJobs, reconcileSequence, referencesForTarget, reorderSequence, sequenceIssues, selectedVersionForTarget, type CanvasPoint, type ProductionJob, type ProductionMediaVersion, type ProductionQueueEntry, type ProductionSequenceItem } from "./production-runtime.js";

interface Props {
  readonly production: DramaEpisodeProduction;
  readonly sessionRunning: boolean;
  readonly queue: readonly ProductionQueueEntry[];
  readonly section: DramaProductionSection;
  readonly selectedId: string | undefined;
  readonly jobs: readonly ProductionJob[];
  readonly versions: readonly ProductionMediaVersion[];
  readonly libraryVersions: readonly ProductionMediaVersion[];
  readonly selections: Readonly<Record<string, string>>;
  readonly manualReferences: Readonly<Record<string, readonly string[]>>;
  readonly sequence: readonly ProductionSequenceItem[];
  readonly canvas: Readonly<Record<string, CanvasPoint>>;
  readonly zoom: number;
  readonly onSectionChange: (section: DramaProductionSection) => void;
  readonly onSelect: (id: string | undefined) => void;
  readonly onNavigate: (target: DramaDocumentTarget) => void;
  readonly onJobsChange: (jobs: ProductionJob[]) => void;
  readonly onSelectionsChange: (selections: Record<string, string>) => void;
  readonly onManualReferencesChange: (references: Record<string, string[]>) => void;
  readonly onOpenMedia: (path: string) => void;
  readonly onSequenceChange: (sequence: ProductionSequenceItem[]) => void;
  readonly onCanvasChange: (canvas: Record<string, CanvasPoint>) => void;
  readonly onZoomChange: (zoom: number) => void;
  readonly onDispatchPrompt: (prompt: string) => Promise<void>;
  readonly onCancelTurn: () => Promise<void>;
  readonly onRemoveQueued: (itemId: string) => Promise<void>;
  readonly onRefresh: () => void;
}

const SECTION_LABELS: Readonly<Record<DramaProductionSection, string>> = { shots: "镜头", assets: "素材", tasks: "任务", sequence: "成片", canvas: "画布" };
const SECTION_ORDER = Object.keys(SECTION_LABELS) as DramaProductionSection[];
const STATUS_LABELS: Readonly<Record<ProductionJob["status"], string>> = { awaiting_confirmation: "等待确认", pending: "已提交", running: "DSH 执行中", dispatched_unknown: "待核对", succeeded: "已完成", failed: "失败", canceled: "已取消" };
const ASSET_KIND_LABEL = { character: "人物", scene: "场景", prop: "道具", state: "状态", unknown: "设定" } as const;
const JOB_KIND_LABEL = { image: "图片", video: "视频", composition: "成片" } as const;

function handleSectionKey(event: ReactKeyboardEvent<HTMLButtonElement>, current: DramaProductionSection, onChange: (section: DramaProductionSection) => void): void {
  const index = SECTION_ORDER.indexOf(current);
  const next = event.key === "Home" ? 0
    : event.key === "End" ? SECTION_ORDER.length - 1
      : event.key === "ArrowRight" ? (index + 1) % SECTION_ORDER.length
        : event.key === "ArrowLeft" ? (index - 1 + SECTION_ORDER.length) % SECTION_ORDER.length
          : undefined;
  if (next === undefined) return;
  event.preventDefault();
  onChange(SECTION_ORDER[next]!);
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
}

export function DramaProductionView(props: Props) {
  const [notice, setNotice] = useState<string>();
  const protocolErrors = props.production.diagnostics.filter((item) => item.severity === "error").length;
  const jobsRef = useRef(props.jobs);
  const commitJobs = useCallback((next: ProductionJob[]) => {
    jobsRef.current = next;
    props.onJobsChange(next);
  }, [props.onJobsChange]);
  useEffect(() => { jobsRef.current = props.jobs; }, [props.jobs]);

  useEffect(() => {
    const next = reconcileSequence(props.production.shots.map((shot) => shot.id), props.sequence, props.versions, props.selections);
    if (JSON.stringify(next) !== JSON.stringify(props.sequence)) props.onSequenceChange(next);
  }, [props.production.shots, props.selections, props.sequence, props.versions]);

  useEffect(() => {
    const next = reconcileProductionJobs(props.jobs, props.queue, props.sessionRunning, props.versions);
    if (JSON.stringify(next) !== JSON.stringify(props.jobs)) commitJobs(next);
  }, [commitJobs, props.jobs, props.queue, props.sessionRunning, props.versions]);

  const dispatchJob = async (job: ProductionJob, references: readonly ProductionMediaVersion[] = []) => {
    commitJobs([...jobsRef.current, { ...job, status: "awaiting_confirmation" }]);
    props.onSectionChange("tasks");
    try {
      await props.onDispatchPrompt(nativeProductionPrompt(props.production, job, references));
      setNotice(`${job.targetId} 正在准备完整预检；请在 Chat 查看并明确确认后再生产。`);
    } catch (error) {
      commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : String(error) } : item));
    }
  };

  const createJob = async (targetId: string, kind: "image" | "video", prompt: string) => {
    if (prompt.trim() === "") { setNotice(`${targetId} 没有可投产提示词。`); return; }
    const job = createPendingJob({ id: crypto.randomUUID(), targetId, kind, prompt });
    await dispatchJob(job, kind === "video" ? referencesForTarget(targetId, props.production, props.versions, props.selections, props.libraryVersions, props.manualReferences) : []);
  };

  const createBatch = async (kind: "image" | "video") => {
    const candidates = props.production.shots.flatMap((shot) => { const prompt = kind === "image" ? shot.keyframePrompt : shot.motion?.prompt; return prompt === undefined ? [] : [{ id: shot.id, prompt }]; });
    if (candidates.length === 0) { setNotice(kind === "image" ? "没有可投产的关键帧提示词。" : "没有可投产的视频提示词。"); return; }
    const job = createPendingJob({ id: crypto.randomUUID(), targetId: kind === "image" ? "BATCH-KEYFRAMES" : "BATCH-VIDEOS", kind, prompt: candidates.map((item) => `${item.id}\n${item.prompt}`).join("\n\n"), expectedOutputs: candidates.length });
    commitJobs([...jobsRef.current, { ...job, status: "awaiting_confirmation" }]); props.onSectionChange("tasks");
    try { await props.onDispatchPrompt(nativeBatchPrompt(props.production, job, candidates)); setNotice(`${String(candidates.length)} 个镜头正在准备同一批次预检；请在 Chat 核对后明确确认。`); }
    catch (error) { commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : String(error) } : item)); }
  };

  const dispatchComposition = async (job: ProductionJob) => {
    const versionById = new Map(props.versions.map((version) => [version.id, version]));
    const ordered = props.sequence.flatMap((item) => { const version = item.versionId === undefined ? undefined : versionById.get(item.versionId); return version === undefined ? [] : [version.path ?? version.url]; });
    commitJobs([...jobsRef.current, job]); props.onSectionChange("tasks");
    try { await props.onDispatchPrompt(nativeCompositionPrompt(props.production, job, ordered)); setNotice("成片任务已进入 DSH 原生队列；文件、FFmpeg 和写入继续受 DSH 权限与审批控制。"); }
    catch (error) { commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : String(error) } : item)); }
  };

  const cancelJob = async (job: ProductionJob) => {
    try { await props.onCancelTurn(); commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "canceled", progress: 0 } : item)); setNotice("已请求停止当前 DSH Turn；DSH Queue 中的其他任务会保留。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const removeQueuedJob = async (job: ProductionJob, itemId: string) => {
    try { await props.onRemoveQueued(itemId); commitJobs(jobsRef.current.map((item) => item.id === job.id ? { ...item, status: "canceled", progress: 0 } : item)); setNotice(`${job.targetId} 已从 DSH Queue 移除。`); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const composeSequence = () => { const issues = sequenceIssues(props.sequence, props.versions); if (issues.length > 0) { setNotice(issues[0]); return; } void dispatchComposition(createPendingJob({ id: crypto.randomUUID(), targetId: props.production.episodeDirectory, kind: "composition", prompt: "按成片顺序合成" })); };

  return <div className="oh-story-production">
    <div className="oh-story-production-bar"><div className="oh-story-production-tabs" role="tablist" aria-label="短剧生产视图">{SECTION_ORDER.map((item) => <button type="button" role="tab" tabIndex={props.section === item ? 0 : -1} aria-selected={props.section === item} key={item} onKeyDown={(event) => { handleSectionKey(event, item, props.onSectionChange); }} onClick={() => { props.onSectionChange(item); }}>{SECTION_LABELS[item]}</button>)}</div><div className="oh-story-production-meta"><span className="oh-story-production-summary">{props.production.shots.length} 镜 · {props.production.assets.length + props.production.visualAssets.length} 素材 · {props.jobs.filter((job) => job.status === "awaiting_confirmation" || job.status === "running" || job.status === "pending").length} 任务</span><button type="button" onClick={props.onRefresh}>刷新</button></div></div>
    {notice !== undefined && <div className="oh-story-production-notice" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={() => { setNotice(undefined); }}>×</button></div>}
    {props.production.diagnostics.length > 0 && <details className="oh-story-production-diagnostics"><summary>{protocolErrors > 0 ? `${String(protocolErrors)} 个协议错误` : `${String(props.production.diagnostics.length)} 个格式提醒`}</summary><ul>{props.production.diagnostics.slice(0, 8).map((item) => <li data-severity={item.severity} key={`${item.path}:${String(item.offset)}:${item.code}`}><button type="button" onClick={() => { props.onNavigate({ path: item.path, offset: item.offset, id: item.targetId ?? item.code }); }}>{item.path.split("/").at(-1)}:{item.line}</button><span>{item.message}</span></li>)}</ul>{props.production.diagnostics.length > 8 && <p>另有 {props.production.diagnostics.length - 8} 项，请按文档位置修复。</p>}</details>}
    {props.section === "shots" && <ShotBoard {...props} onCreateJob={createJob} onBatch={createBatch} />}
    {props.section === "assets" && <AssetBoard {...props} onCreateJob={createJob} />}
    {props.section === "tasks" && <TaskBoard jobs={props.jobs} queue={props.queue} sessionRunning={props.sessionRunning} onCancel={cancelJob} onRemoveQueued={removeQueuedJob} />}
    {props.section === "sequence" && <SequenceBoard {...props} onCompose={composeSequence} />}
    {props.section === "canvas" && <ProductionCanvas {...props} />}
  </div>;
}

function ShotBoard(props: Props & { readonly onCreateJob: (targetId: string, kind: "image" | "video", prompt: string) => Promise<void>; readonly onBatch: (kind: "image" | "video") => Promise<void> }) {
  const selectedRef = useScrollIntoView(props.selectedId);
  if (props.production.shots.length === 0) return <section className="oh-story-shot-board"><MissingDocument document={`${props.production.episodeDirectory}/分镜.md`} documentPaths={props.production.documentPaths} what="镜头" skill="/short-drama-storyboard" onNavigate={props.onNavigate} /></section>;
  return <section className="oh-story-shot-board"><div className="oh-story-production-actions"><button type="button" onClick={() => { void props.onBatch("image"); }}>准备批量关键帧</button><button type="button" onClick={() => { void props.onBatch("video"); }}>准备批量视频</button></div><div className="oh-story-shot-grid">{props.production.shots.map((shot) => {
    const completeness = productionCompleteness(shot); const versions = props.versions.filter((version) => version.targetId === shot.id); const selected = selectedVersionForTarget(shot.id, props.versions, props.selections, "image") ?? selectedVersionForTarget(shot.id, props.versions, props.selections, "video");
    return <article className="oh-story-shot-card" role="button" tabIndex={0} aria-pressed={props.selectedId === shot.id} aria-label={`选中镜头 ${shot.id} ${shot.title}`} ref={props.selectedId === shot.id ? selectedRef : undefined} data-selected={props.selectedId === shot.id || undefined} key={shot.id} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect(shot.id); } }} onClick={() => { props.onSelect(shot.id); }}>
      {selected === undefined ? <div className="oh-story-shot-placeholder"><strong>{shot.id.split("-").at(-1)}</strong><span>等待关键帧成果</span></div> : <MediaPreview version={selected} />}<header><button type="button" onClick={(event) => { event.stopPropagation(); props.onNavigate({ path: shot.path, offset: shot.offset, id: shot.id }); }}>{shot.id}</button><span>{shot.durationSeconds === undefined ? "—" : `${String(shot.durationSeconds)}s`}</span></header><h3>{shot.title}</h3>{shot.shotSpec !== undefined && <p>{shot.shotSpec}</p>}<dl><dt>起</dt><dd>{shot.start ?? "未填写"}</dd><dt>终</dt><dd>{shot.end ?? "未填写"}</dd></dl>
      <div className="oh-story-shot-status"><ReadinessBadge label="关键帧" ready={completeness.keyframe} /><ReadinessBadge label="运动" ready={completeness.motion} /><ReadinessBadge label="参考" ready={completeness.references} /><span>{versions.length} 版本</span></div><div className="oh-story-reference-links">{shot.source !== undefined && <ReferenceButton id={shot.source} production={props.production} onNavigate={props.onNavigate} />}{shot.references.map((id) => <ReferenceButton id={id} production={props.production} onNavigate={props.onNavigate} key={id} />)}</div>
      <div className="oh-story-card-actions">{shot.keyframePrompt !== undefined && <button type="button" onClick={(event) => { event.stopPropagation(); void props.onCreateJob(shot.id, "image", shot.keyframePrompt ?? ""); }}>准备关键帧</button>}{shot.motion?.prompt !== undefined && <button type="button" onClick={(event) => { event.stopPropagation(); void props.onCreateJob(shot.id, "video", shot.motion?.prompt ?? ""); }}>准备视频</button>}</div>{versions.length > 1 && <VersionStrip targetId={shot.id} versions={versions} selections={props.selections} onSelectionsChange={props.onSelectionsChange} />}
    </article>;
  })}</div></section>;
}

function AssetBoard(props: Props & { readonly onCreateJob: (targetId: string, kind: "image" | "video", prompt: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const assets = [...props.production.assets, ...props.production.visualAssets.filter((visual) => !props.production.assets.some((asset) => asset.title === visual.title))];
  const needle = query.trim().toLocaleLowerCase();
  const library = props.libraryVersions.filter((version) => (kind === "all" || version.kind === kind) && (needle === "" || `${version.targetId} ${version.path ?? ""}`.toLocaleLowerCase().includes(needle)));
  const selectedRef = useScrollIntoView(props.selectedId);
  const referenceTarget = props.selectedId?.startsWith("SHOT-") === true ? props.selectedId : undefined;
  const toggleReference = (versionId: string) => {
    if (referenceTarget === undefined) return;
    const current = props.manualReferences[referenceTarget] ?? [];
    const next = current.includes(versionId) ? current.filter((id) => id !== versionId) : [...current, versionId];
    const mutable = Object.fromEntries(Object.entries(props.manualReferences).map(([target, ids]) => [target, [...ids]]));
    props.onManualReferencesChange({ ...mutable, [referenceTarget]: next });
  };
  if (assets.length === 0 && props.libraryVersions.length === 0) return <section className="oh-story-assets"><MissingDocument document={`${props.production.episodeDirectory}/图片提示词.md`} documentPaths={props.production.documentPaths} what="素材" skill="/short-drama-image-prompts" onNavigate={props.onNavigate} /></section>;
  return <section className="oh-story-assets"><div className="oh-story-asset-grid">{assets.map((asset) => { const prompt = "prompt" in asset ? asset.prompt : asset.description; const versions = props.versions.filter((version) => version.targetId === asset.id); const selected = selectedVersionForTarget(asset.id, props.versions, props.selections, "image"); return <article className="oh-story-asset-card" ref={props.selectedId === asset.id ? selectedRef : undefined} data-selected={props.selectedId === asset.id || undefined} key={asset.id}>{selected === undefined ? <div className="oh-story-asset-placeholder">{asset.kind === "character" ? "人" : asset.kind === "scene" ? "景" : asset.kind === "prop" ? "物" : "设"}</div> : <MediaPreview version={selected} />}<div><small>{ASSET_KIND_LABEL[asset.kind]}</small><h3>{asset.title}</h3><button type="button" onClick={() => { props.onNavigate({ path: asset.path, offset: asset.offset, id: asset.id }); }}>{asset.id}</button></div>{prompt !== undefined && <p className="oh-story-asset-description">{prompt}</p>}<div className="oh-story-card-actions">{prompt !== undefined && <button type="button" onClick={() => { void props.onCreateJob(asset.id, "image", prompt); }}>准备素材</button>}</div>{versions.length > 0 && <VersionStrip targetId={asset.id} versions={versions} selections={props.selections} onSelectionsChange={props.onSelectionsChange} />}</article>; })}</div><div className="oh-story-media-library"><header><div><strong>项目媒体库</strong><span>{library.length}/{props.libraryVersions.length} 项 · 可跨集复用</span></div><div><input aria-label="搜索项目媒体" value={query} placeholder="搜索 ID 或路径" onChange={(event) => { setQuery(event.target.value); }} /><select aria-label="筛选媒体类型" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); }}><option value="all">全部</option><option value="image">图片</option><option value="video">视频</option></select></div></header>{referenceTarget === undefined && <p className="oh-story-projection-note">先在镜头页选中一个镜头，再回到这里把已有图片设为该镜头的额外参考。</p>}<div className="oh-story-media-library-grid">{library.map((version) => { const selected = referenceTarget !== undefined && (props.manualReferences[referenceTarget] ?? []).includes(version.id); return <article key={version.id}><MediaPreview version={version} /><strong>{version.targetId}</strong><span title={version.path}>{version.path}</span><footer>{version.path !== undefined && <button type="button" onClick={() => { props.onOpenMedia(version.path!); }}>打开文件</button>}{referenceTarget !== undefined && version.kind === "image" && <button type="button" aria-pressed={selected} aria-label={`${selected ? "取消" : "设为"} ${referenceTarget} 参考 ${version.targetId}`} onClick={() => { toggleReference(version.id); }}>{selected ? "已引用" : "作为参考"}</button>}</footer></article>; })}</div></div></section>;
}

function TaskBoard({ jobs, queue, sessionRunning, onCancel, onRemoveQueued }: {
  readonly jobs: readonly ProductionJob[];
  readonly queue: readonly ProductionQueueEntry[];
  readonly sessionRunning: boolean;
  readonly onCancel: (job: ProductionJob) => Promise<void>;
  readonly onRemoveQueued: (job: ProductionJob, itemId: string) => Promise<void>;
}) {
  const activeJobId = activeProductionJobId(jobs, queue, sessionRunning);
  return <section className="oh-story-task-board">
    <div className="oh-story-projection-note">图片与视频先预检、后确认。内置契约支持 GPT Image 2 / Seedance；实际账号、模型与可用性由当前 DSH 运行环境决定。</div>
    {jobs.length === 0 ? <div className="oh-story-production-empty">还没有生产任务。可从镜头或素材页提交单个或批量任务。</div> : [...jobs].reverse().map((job) => {
      const queued = queuedItemForJob(job.id, queue);
      const displayStatus = queued === undefined ? STATUS_LABELS[job.status] : "DSH Queue";
      return <article key={job.id} data-job-id={job.id} data-status={job.status}><header><strong title={job.targetId}>{job.targetId}</strong><span>{JOB_KIND_LABEL[job.kind]}</span><span>{displayStatus}</span></header><div className="oh-story-task-progress"><i style={{ width: `${String(job.progress)}%` }} /></div><details><summary>查看投产提示词</summary><p>{job.prompt}</p></details>{job.expectedOutputs > 1 && <small>{job.completedOutputs}/{job.expectedOutputs} 项成果</small>}{job.error !== undefined && <div className="oh-story-error">{job.error}</div>}{job.output !== undefined && <MediaPreview version={job.output} />}<footer>{queued !== undefined && (job.status === "awaiting_confirmation" || job.status === "pending" || job.status === "running") && <button type="button" onClick={() => { void onRemoveQueued(job, queued.id); }}>从 DSH Queue 移除</button>}{activeJobId === job.id && <button type="button" onClick={() => { void onCancel(job); }}>停止当前 DSH Turn</button>}</footer></article>;
    })}
  </section>;
}

function SequenceBoard(props: Props & { readonly onCompose: () => void }) {
  const issues = sequenceIssues(props.sequence, props.versions); const versionById = new Map(props.versions.map((version) => [version.id, version])); const move = (index: number, delta: number) => { const source = props.sequence[index]; const target = props.sequence[index + delta]; if (source !== undefined && target !== undefined) props.onSequenceChange(reorderSequence(props.sequence, index, index + delta)); };
  return <section className="oh-story-sequence"><div className="oh-story-sequence-summary"><strong>{props.sequence.length} 个镜头</strong><span>{props.sequence.length === 0 ? "还没有镜头" : issues.length === 0 ? "已可合成" : `${String(issues.length)} 个阻塞项`}</span><button type="button" disabled={issues.length > 0 || props.sequence.length < 2} onClick={props.onCompose}>合成成片</button></div>{issues.length > 0 && <ul className="oh-story-sequence-issues">{issues.slice(0, 3).map((issue) => <li key={issue}>{issue}</li>)}{issues.length > 3 && <li>另有 {issues.length - 3} 个阻塞项，请在下方镜头行补齐视频。</li>}</ul>}<ol>{props.sequence.map((item, index) => { const version = item.versionId === undefined ? undefined : versionById.get(item.versionId); return <li key={item.shotId}><span>{String(index + 1).padStart(2, "0")}</span>{version === undefined ? <div className="oh-story-sequence-missing">缺少视频</div> : <MediaPreview version={version} interactive={false} />}<strong>{item.shotId}</strong><div><button type="button" aria-label={`上移 ${item.shotId}`} disabled={index === 0} onClick={() => { move(index, -1); }}>↑</button><button type="button" aria-label={`下移 ${item.shotId}`} disabled={index === props.sequence.length - 1} onClick={() => { move(index, 1); }}>↓</button></div></li>; })}</ol></section>;
}

function ProductionCanvas(props: Props) {
  const nodes = useMemo(() => { const sourceAssets = [...props.production.assets, ...props.production.visualAssets]; const assets = sourceAssets.map((asset, index) => ({ id: asset.id, label: asset.title, type: "asset", initial: { x: 80, y: 80 + index * 150 } })); const shots = props.production.shots.map((shot, index) => ({ id: shot.id, label: shot.title, type: "shot", initial: { x: 640, y: 80 + index * 180 } })); return [...assets, ...shots]; }, [props.production.assets, props.production.shots, props.production.visualAssets]);
  const positions = Object.fromEntries(nodes.map((node) => [node.id, props.canvas[node.id] ?? node.initial]));
  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => { event.currentTarget.setPointerCapture(event.pointerId); const origin = positions[id] ?? { x: 0, y: 0 }; const start = { x: event.clientX, y: event.clientY }; const move = (moveEvent: PointerEvent) => { props.onCanvasChange({ ...props.canvas, [id]: { x: origin.x + (moveEvent.clientX - start.x) / props.zoom, y: origin.y + (moveEvent.clientY - start.y) / props.zoom } }); }; const end = () => { globalThis.removeEventListener("pointermove", move); globalThis.removeEventListener("pointerup", end); }; globalThis.addEventListener("pointermove", move); globalThis.addEventListener("pointerup", end); };
  const moveNode = (id: string, x: number, y: number) => { const origin = positions[id] ?? { x: 0, y: 0 }; props.onCanvasChange({ ...props.canvas, [id]: { x: origin.x + x, y: origin.y + y } }); };
  const connections = props.production.shots.flatMap((shot) => shot.references.map((reference) => [reference, shot.id] as const));
  if (nodes.length === 0) return <section className="oh-story-canvas-shell" aria-label="短剧素材与镜头关系画布"><MissingDocument document={`${props.production.episodeDirectory}/分镜.md`} documentPaths={props.production.documentPaths} what="关系" skill="/short-drama-storyboard" onNavigate={props.onNavigate} /></section>;
  return <section className="oh-story-canvas-shell" aria-label="短剧素材与镜头关系画布"><div className="oh-story-projection-note">文档关系 · 布局仅保存在当前 DSH Session</div><div className="oh-story-canvas-controls"><button type="button" aria-label="缩小画布" onClick={() => { props.onZoomChange(Math.max(.5, props.zoom - .1)); }}>−</button><span>{Math.round(props.zoom * 100)}%</span><button type="button" aria-label="放大画布" onClick={() => { props.onZoomChange(Math.min(1.8, props.zoom + .1)); }}>＋</button><button type="button" onClick={() => { props.onCanvasChange({}); props.onZoomChange(.65); }}>复位</button></div><div className="oh-story-canvas-viewport"><div className="oh-story-canvas" style={{ transform: `scale(${String(props.zoom)})` }}><svg aria-hidden="true">{connections.map(([from, to]) => { const a = positions[from]; const b = positions[to]; if (a === undefined || b === undefined) return null; return <path key={`${from}:${to}`} data-active={to === props.selectedId || undefined} d={`M ${String(a.x + 180)} ${String(a.y + 50)} C ${String(a.x + 360)} ${String(a.y + 50)}, ${String(b.x - 180)} ${String(b.y + 50)}, ${String(b.x)} ${String(b.y + 50)}`} />; })}</svg>{nodes.map((node) => <article key={node.id} tabIndex={0} aria-label={`${node.type === "asset" ? "素材" : "镜头"} ${node.label}`} data-node-type={node.type} data-selected={node.id === props.selectedId || undefined} style={{ left: positions[node.id]?.x, top: positions[node.id]?.y }} onKeyDown={(event) => { const step = event.shiftKey ? 40 : 10; const delta: readonly [number, number] | undefined = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : undefined; if (delta !== undefined) { event.preventDefault(); moveNode(node.id, delta[0], delta[1]); } }} onPointerDown={(event) => { startDrag(event, node.id); }} onDoubleClick={() => { const target = props.production.targets.get(node.id); if (target !== undefined) props.onNavigate(target); }}><small>{node.type === "asset" ? "素材" : "镜头"}</small><strong>{node.label}</strong><span>{node.id}</span></article>)}</div></div></section>;
}

/** Scroll the card an Agent focus_target selected into view; without it the tab switches but the card stays off-screen. */
function useScrollIntoView(selectedId: string | undefined) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest" }); }, [selectedId]);
  return ref;
}

function ReadinessBadge({ label, ready }: { readonly label: string; readonly ready: boolean }) {
  return <span data-ready={ready} aria-label={`${label}${ready ? "已备" : "待补"}`}><i aria-hidden="true">{ready ? "✓" : "—"}</i>{label}</span>;
}

function MissingDocument({ document, documentPaths, what, skill, onNavigate }: {
  readonly document: string;
  readonly documentPaths: readonly string[];
  readonly what: string;
  readonly skill: string;
  readonly onNavigate: (target: DramaDocumentTarget) => void;
}) {
  const present = documentPaths.includes(document);
  return <div className="oh-story-production-empty">
    <strong>还没有可投影的{what}。</strong>
    <p>{present
      ? `${document} 已存在，但没有解析出条目。请检查二级标题是否为稳定的 ID 形式。`
      : `本集还没有 ${document}。在右侧 Chat 用 ${skill} 写好这份文档后，这里会自动出现。`}</p>
    {present && <button type="button" onClick={() => { onNavigate({ path: document, offset: 0, id: document }); }}>打开 {document.split("/").at(-1)}</button>}
  </div>;
}

function ReferenceButton({ id, production, onNavigate }: { readonly id: string; readonly production: DramaEpisodeProduction; readonly onNavigate: (target: DramaDocumentTarget) => void }) { const target = production.targets.get(id); return <button type="button" disabled={target === undefined} onClick={(event) => { event.stopPropagation(); if (target !== undefined) onNavigate(target); }}>{id}</button>; }
function MediaPreview({ version, interactive = true }: { readonly version: ProductionMediaVersion; readonly interactive?: boolean }) { return version.kind === "image" ? <img className="oh-story-media-preview" src={version.url} alt={version.targetId} loading="lazy" /> : <video className="oh-story-media-preview" src={version.url} controls={interactive} muted={!interactive} preload="metadata" />; }
function VersionStrip({ targetId, versions, selections, onSelectionsChange }: { readonly targetId: string; readonly versions: readonly ProductionMediaVersion[]; readonly selections: Readonly<Record<string, string>>; readonly onSelectionsChange: (value: Record<string, string>) => void }) { const selected = selectedVersionForTarget(targetId, versions, selections)?.id; return <div className="oh-story-version-strip" aria-label={`${targetId} 成果版本`}>{versions.map((version, index) => <button type="button" aria-pressed={version.id === selected} aria-label={`选择 ${targetId} 版本 ${String(index + 1)}`} data-selected={version.id === selected || undefined} key={version.id} onClick={(event) => { event.stopPropagation(); onSelectionsChange({ ...selections, [targetId]: version.id }); }}><MediaPreview version={version} interactive={false} /><span>V{String(index + 1)}</span></button>)}</div>; }
