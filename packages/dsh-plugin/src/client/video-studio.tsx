import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { VideoNarrativeProjection, VideoNarrativeSegment, VideoTimeRange } from "../video-narrative.js";
import type { VideoPreviewAsset } from "../video-project.js";
import type { WorkbenchMode } from "./file-activity.js";
import { CreativeCanvas, type CreativeCanvasState } from "./creative-canvas.js";
import type { GameDocumentEditor } from "./game-documents.js";
import type { GameWorkspaceFile } from "./game-workspace-types.js";
import { VideoDetails } from "./video-details.js";
import { VideoDocuments } from "./video-documents.js";
import { WorkbenchModeTabs } from "./workbench-mode-tabs.js";
import { endpoint, handleTabKey } from "./workbench-ui.js";
import { videoCanvasModel, videoCreativeDocuments, videoDraftText, videoSourceRange, videoRange, videoTime, type VideoCanvasNode, type VideoProject, type VideoWorkspaceTab } from "./video-workspace-model.js";

export type { VideoProject, VideoWorkspaceTab } from "./video-workspace-model.js";
export type { VideoPreviewAsset, VideoArtifactSummary } from "../video-project.js";
export { VideoEnvironmentReport, type VideoPreflight } from "./video-environment.js";

function preferredPreview(project: VideoProject): VideoPreviewAsset | undefined {
  return project.previews.find((item) => item.role === "final") ?? project.previews.find((item) => item.role === "edited") ?? project.previews.find((item) => item.role === "source");
}
function roleLabel(role: VideoPreviewAsset["role"]): string { return { source: "原片", edited: "剪后画面", final: "成片" }[role]; }
function mediaUrl(sessionId: string, asset: VideoPreviewAsset, revision = 0): string {
  return `${endpoint("media", sessionId, asset.path)}&version=${encodeURIComponent(asset.version)}&reload=${String(revision)}`;
}
function sameAsset(a: VideoPreviewAsset | undefined, b: VideoPreviewAsset | undefined): boolean { return a?.path === b?.path && a?.version === b?.version; }
function EmptyVideo({ project, onChat }: { readonly project?: VideoProject | undefined; readonly onChat: (prompt: string) => void }) {
  return <div className="oh-video-preview-empty"><span aria-hidden>▷</span><strong>{project === undefined ? "把这段故事，讲给更多人听" : "先看看原片，想想怎么讲"}</strong><p>在 Chat 中提供想处理的视频，一起讨论主线、解说和想保留的原声。</p><button type="button" onClick={() => { onChat(project === undefined ? "我想制作一段视频解说，请先和我讨论素材、观众和想讲的故事。" : `我想讨论《${project.title}》怎么讲，先看看已有素材和解说想法。`); }}>聊聊解说想法</button></div>;
}

interface VideoStudioProps {
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
  readonly onCollapse: () => void;
  readonly chatOpen: boolean;
  readonly onChatOpen: (visible: boolean) => void;
  readonly onContinueInChat: (prompt: string) => void;
  readonly editor: GameDocumentEditor;
  readonly canvasByProject: Readonly<Record<string, CreativeCanvasState>>;
  readonly onCanvasChange: (id: string, value: CreativeCanvasState) => void;
}

export function VideoStudio(props: VideoStudioProps) {
  const project = props.projects.find((item) => item.id === props.projectId) ?? props.projects[0];
  const [details, setDetails] = useState(false);
  const tabsId = useId();
  useEffect(() => { if (project !== undefined && project.id !== props.projectId) props.onProject(project.id); }, [props.onProject, project, props.projectId]);
  const tabs = ["preview", "canvas", "docs"] as const;
  const labels = { preview: "预览", canvas: "创作画布", docs: "文稿" };
  return <main id={props.paneId} className="oh-video-studio" role="tabpanel" aria-labelledby={props.labelledBy} hidden={props.hidden} data-chat-open={props.chatOpen}>
    <header className="oh-video-toolbar">
      <div className="oh-workbench-cluster"><WorkbenchModeTabs className="oh-video-mode-tabs" current="video" onSelect={props.onWorkbench} /><button className="oh-workbench-collapse" type="button" aria-label="收起创作工作台" onClick={props.onCollapse}>×</button></div>
      <label className="oh-video-project"><select aria-label="视频项目" value={project?.id ?? ""} disabled={project === undefined} onChange={(event) => { props.onProject(event.target.value); }}>{props.projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <div className="oh-video-tabs" role="tablist" aria-label="视频工作台">{tabs.map((item) => <button type="button" role="tab" key={item} id={`${tabsId}-${item}-tab`} aria-controls={`${tabsId}-${item}-panel`} aria-selected={props.tab === item} tabIndex={props.tab === item ? 0 : -1} onKeyDown={(event) => { handleTabKey(event, tabs, props.tab, props.onTab); }} onClick={() => { props.onTab(item); if (item === "canvas") props.onChatOpen(false); }}>{labels[item]}</button>)}</div>
      <div className="oh-video-workspace-actions"><button className="oh-video-chat-toggle" type="button" aria-pressed={props.chatOpen} onClick={() => { props.onChatOpen(!props.chatOpen); }}>Chat</button><button type="button" onClick={() => { setDetails(true); }}>制作详情</button></div>
    </header>
    {project === undefined ? <EmptyVideo onChat={props.onContinueInChat} /> : <VideoWorkspace key={project.id} {...props} project={project} tabsId={tabsId} />}
    {details && <VideoDetails key={project?.id ?? "empty"} sessionId={props.sessionId} project={project} onClose={() => { setDetails(false); }} />}
  </main>;
}

interface LoadedPreview { readonly asset: VideoPreviewAsset; readonly narrative?: VideoNarrativeProjection | undefined; readonly narrationPath?: string | undefined; readonly narrationVersion?: string | undefined }
interface SeekRequest { readonly role: VideoPreviewAsset["role"]; readonly time: number; readonly range?: VideoTimeRange | undefined }
function snapshot(project: VideoProject, asset: VideoPreviewAsset): LoadedPreview { return { asset, narrative: project.narrative, narrationPath: project.narrationPath, narrationVersion: project.narrationVersion }; }

function VideoWorkspace(props: VideoStudioProps & { readonly project: VideoProject; readonly tabsId: string }) {
  const { project, sessionId } = props;
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
  const acknowledgedRoles = useRef(new Set(project.previews.map((asset) => asset.role)));
  const discovered = [...project.previews].reverse().find((asset) => !acknowledgedRoles.current.has(asset.role) && asset.role !== "source");
  const video = useRef<HTMLVideoElement>(null);
  const roleTimes = useRef<Partial<Record<VideoPreviewAsset["role"], number>>>({});
  const scriptList = useRef<HTMLDivElement>(null);
  const scriptScrolledAt = useRef(0);
  const playerShell = useRef<HTMLDivElement>(null);
  const pendingSeek = useRef<SeekRequest>();
  const currentAsset = project.previews.find((asset) => asset.role === loaded?.asset.role);
  const pending = loaded !== undefined && currentAsset !== undefined && !sameAsset(loaded.asset, currentAsset);
  const loadedSegments = loaded?.narrative?.segments ?? [];
  const narrative = loaded?.narrative;
  const canvas = props.canvasByProject[project.id] ?? { positions: {} };
  const draftContent = project.narrationPath === undefined ? undefined : props.editor.buffers[project.narrationPath]?.content;
  const loadedDraft = loaded?.narrationPath === undefined ? undefined : props.editor.buffers[loaded.narrationPath]?.content;
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
  useEffect(() => { if (loaded === undefined && initial !== undefined) setLoaded(snapshot(project, initial)); }, [initial, loaded, project]);
  const load = (asset: VideoPreviewAsset, seek?: SeekRequest): void => {
    if (loaded !== undefined) roleTimes.current[loaded.asset.role] = video.current?.currentTime ?? currentTime;
    video.current?.pause();
    acknowledgedRoles.current.add(asset.role);
    pendingSeek.current = seek;
    setLoaded(snapshot(project, asset)); setReady(false); setError(false); setCurrentTime(0); setRange(seek?.range); setNotice(undefined); setRevision((value) => value + 1);
  };
  const seekLoaded = (request: SeekRequest): void => {
    const element = video.current;
    if (element === null || element.readyState === 0) { pendingSeek.current = request; return; }
    if (request.time >= element.duration) { setNotice("这段文稿超出当前视频范围，可以先核对文稿或载入新版。"); return; }
    element.currentTime = Math.max(0, request.time); setRange(request.range); setNotice(undefined);
  };
  const requestSeek = (request: SeekRequest): void => {
    const asset = project.previews.find((item) => item.role === request.role);
    if (asset === undefined) { setNotice("这份视频还没有准备好，先继续核对文稿。"); return; }
    props.onTab("preview"); setShowScript(false);
    if (loaded?.asset.role === request.role) seekLoaded(request);
    else load(asset, request);
  };
  const canSource = (segment: VideoNarrativeSegment): boolean => narrative?.authoredClock !== "unknown" && videoSourceRange(project, segment, props.files) !== undefined;
  const switchPreview = (asset: VideoPreviewAsset): void => {
    if (asset.role === loaded?.asset.role) return;
    const time = video.current?.currentTime ?? 0;
    let target = roleTimes.current[asset.role] ?? 0;
    let mapped = false;
    if (asset.role !== "source" && loaded?.asset.role !== "source") { target = time; mapped = true; }
    else if (asset.role === "source") {
      const paragraph = loadedSegments.find((item) => time >= item.output.start && time < item.output.end && canSource(item));
      const original = paragraph?.sourceRanges[0];
      if (paragraph !== undefined && original !== undefined) { target = original.start + (time - paragraph.output.start) * (original.end - original.start) / (paragraph.output.end - paragraph.output.start); mapped = true; }
    } else {
      const paragraph = loadedSegments.find((item) => canSource(item) && item.sourceRanges.some((span) => time >= span.start && time < span.end));
      const original = paragraph?.sourceRanges[0];
      if (paragraph !== undefined && original !== undefined) { target = paragraph.output.start + (time - original.start) * (paragraph.output.end - paragraph.output.start) / (original.end - original.start); mapped = true; }
    }
    load(asset, { role: asset.role, time: target });
    if (!mapped) setNotice(target > 0 ? "当前片段没有可靠对应，已回到这份视频上次的位置。" : "当前片段没有可靠对应，可以从这份视频开头核对。");
  };
  const canOutput = (segment: VideoNarrativeSegment): boolean => narrative?.authoredClock !== "unknown" && narrative !== undefined && (project.previews.some((asset) => asset.role !== "source") || canSource(segment));
  const locate = (segment: VideoNarrativeSegment, source = false): void => {
    setSelectedId(segment.id);
    if (source) { const original = segment.sourceRanges[0]; if (original !== undefined && canSource(segment)) requestSeek({ role: "source", time: original.start, range: original }); return; }
    const role = loaded?.asset.role === "edited" ? "edited" : project.previews.some((asset) => asset.role === "final") ? "final" : project.previews.some((asset) => asset.role === "edited") ? "edited" : "source";
    const span = role === "source" ? segment.sourceRanges[0] : segment.output;
    if (span !== undefined && canOutput(segment)) requestSeek({ role, time: span.start });
  };
  const openDocument = (path?: string): void => {
    const next = path ?? project.narrationPath ?? videoCreativeDocuments(project)[0]?.path;
    if (next !== undefined) props.editor.onSelect(next);
    props.editor.onMode("preview"); props.onTab("docs");
  };
  const discuss = (segment?: VideoNarrativeSegment): void => {
    video.current?.pause();
    const role = loaded?.asset.role;
    const context = segment === undefined ? `当前${role === undefined ? "预览" : roleLabel(role)} ${videoTime(currentTime)}` : `${segment.kind === "original" ? "原声" : "解说段落"}，输出 ${videoRange(segment.output)}${segment.sourceRanges.length === 0 ? "" : `；原片 ${segment.sourceRanges.map(videoRange).join("、")}`}\n文稿：${videoDraftText(segment, loadedDraft) ?? "保留原片声音"}`;
    props.onContinueInChat(`我想调整《${project.title}》的${context}。\n${loaded === undefined ? "" : `正在预览：${loaded.asset.path}，版本 ${loaded.asset.version}。\n`}请先讨论画面、解说与声音的修改思路。`);
  };
  const onNodeOpen = (node: VideoCanvasNode): void => {
    if (node.segment !== undefined) {
      if (project.narrative?.authoredClock === "unknown") { openDocument(); return; }
      props.onTab("preview");
      if (pending || (project.narrationVersion !== loaded?.narrationVersion && !loadedSegments.some((segment) => segment.id === node.segment?.id && segment.output.start === node.segment.output.start && segment.output.end === node.segment.output.end))) { setNotice("文稿或视频已有更新。先载入新版本，再核对这段内容；当前播放保持原样。"); return; }
      const existing = loadedSegments.find((segment) => segment.id === node.segment?.id);
      if (existing !== undefined) locate(existing, loaded?.asset.role === "source" && canSource(existing));
      else setNotice("先在文稿里核对这段的时间，再继续定位。");
    } else if (node.id === "source") requestSeek({ role: "source", time: 0 });
    else if (node.id === "preview") { const asset = preferredPreview(project); if (asset !== undefined && asset.role !== loaded?.asset.role) requestSeek({ role: asset.role, time: roleTimes.current[asset.role] ?? 0 }); else props.onTab("preview"); }
    else openDocument(node.path);
  };
  const downloadSubtitles = async (): Promise<void> => {
    const file = project.artifacts.find((item) => item.path.endsWith("/subtitles.srt"));
    if (file === undefined) return;
    setExporting(true);
    try {
      const response = await fetch(endpoint("file", sessionId, file.path));
      const payload = await response.json() as { readonly content?: string; readonly error?: string };
      if (!response.ok || payload.content === undefined) throw new Error(payload.error ?? "字幕暂时无法导出");
      const url = URL.createObjectURL(new Blob([payload.content], { type: "application/x-subrip;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `${project.title}.srt`; link.click(); globalThis.setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : String(reason)); }
    finally { setExporting(false); }
  };
  const renderSegment = (segment: VideoNarrativeSegment, index: number) => <article className="oh-video-script-segment" key={segment.id} data-segment-id={segment.id} data-selected={selectedId === segment.id} data-kind={segment.kind}>
    <button className="oh-video-segment-jump" type="button" disabled={!canOutput(segment)} onClick={() => { locate(segment); }}><span>{segment.kind === "original" ? "保留原声" : `解说 ${String((segment.index ?? index) + 1).padStart(2, "0")}`}<small>{narrative?.authoredClock === "unknown" ? "文稿时间" : "输出"} {videoRange(segment.output)}</small></span><p>{videoDraftText(segment, loadedDraft) ?? "听一听原片里值得留下的声音。"}{videoDraftText(segment, loadedDraft) !== segment.text && <small className="oh-video-draft-wording">改稿文案 · 配音未更新</small>}</p></button>
    <footer>{canSource(segment) ? <button type="button" onClick={() => { locate(segment, true); }}>原片 {videoRange(segment.sourceRanges[0]!)}</button> : <span>{segment.sourceRanges.length > 1 ? "对应多段原片" : "原片对应待核对"}</span>}<div>{segment.kind === "narration" && <button type="button" onClick={() => { openDocument(loaded?.narrationPath); props.editor.onMode("source"); }}>改稿</button>}<button type="button" aria-label={`讨论第 ${String(index + 1)} 段`} onClick={() => { discuss(segment); }}>Chat</button></div></footer>
  </article>;
  return <div className="oh-video-panels">
    <section role="tabpanel" id={`${props.tabsId}-preview-panel`} aria-labelledby={`${props.tabsId}-preview-tab`} hidden={props.tab !== "preview"}>
      <div className="oh-video-preview-layout" data-script-open={showScript} data-script-collapsed={scriptCollapsed || loaded === undefined}>
        <div className="oh-video-preview-main">
          {loaded === undefined ? <EmptyVideo project={project} onChat={props.onContinueInChat} /> : <div ref={playerShell} className="oh-video-preview-shell" data-state={error ? "error" : props.running ? "building" : ready ? "ready" : "loading"}>
            <div className="oh-video-stagebar"><div className="oh-video-version-tabs" role="tablist" aria-label="预览版本">{project.previews.map((asset) => <button type="button" role="tab" key={asset.role} aria-selected={asset.role === loaded.asset.role} tabIndex={asset.role === loaded.asset.role ? 0 : -1} onClick={() => { switchPreview(asset); }} onKeyDown={(event) => { handleTabKey(event, project.previews.map((item) => item.role), loaded.asset.role, (role) => { const next = project.previews.find((item) => item.role === role); if (next !== undefined) switchPreview(next); }); }}>{roleLabel(asset.role)}</button>)}</div><div className="oh-video-preview-actions"><button className="oh-video-context-action" type="button" aria-expanded={showScript || (!props.chatOpen && !scriptCollapsed && (playerShell.current?.closest(".oh-video-studio")?.clientWidth ?? 0) > 800)} onClick={() => { if (props.chatOpen || (playerShell.current?.closest(".oh-video-studio")?.clientWidth ?? 0) <= 800) setShowScript((value) => !value); else setScriptCollapsed((value) => !value); }}>解说稿</button><button className="oh-video-context-action" type="button" onClick={() => { discuss(); }}>讨论当前画面</button><a href={mediaUrl(sessionId, loaded.asset, revision)} download={`${project.title}-${roleLabel(loaded.asset.role)}.${loaded.asset.path.split(".").at(-1) ?? "mp4"}`}>导出视频</a><button type="button" aria-label="全屏预览" onClick={() => { void playerShell.current?.requestFullscreen().catch(() => { setNotice("当前环境暂不支持全屏，可以在新窗口打开视频。"); }); }}>⛶</button></div></div>
            <div className="oh-video-player-stage"><video key={`${loaded.asset.path}:${loaded.asset.version}:${String(revision)}`} ref={video} src={mediaUrl(sessionId, loaded.asset, revision)} controls preload="metadata" playsInline onLoadedMetadata={() => { setReady(true); setError(false); const request = pendingSeek.current; pendingSeek.current = undefined; if (request !== undefined) seekLoaded(request); }} onError={() => { setError(true); setReady(false); }} onTimeUpdate={() => { const element = video.current; if (element === null) return; setCurrentTime(element.currentTime); if (range !== undefined && element.currentTime >= range.end) { element.pause(); setRange(undefined); } if (loaded.asset.role !== "source") { const paragraph = loadedSegments.find((item) => element.currentTime >= item.output.start && element.currentTime < item.output.end); if (paragraph !== undefined) setSelectedId(paragraph.id); } else { const matches = loadedSegments.filter((item) => canSource(item) && item.sourceRanges.some((span) => element.currentTime >= span.start && element.currentTime < span.end)); if (matches.length === 1) setSelectedId(matches[0]?.id); } }} />{error && <div className="oh-video-media-error" role="alert"><strong>暂时无法播放这段视频</strong><button type="button" onClick={() => { load(loaded.asset); }}>重新读取视频</button><a href={mediaUrl(sessionId, loaded.asset, revision)} target="_blank" rel="noreferrer">在新窗口打开</a></div>}</div>
            <div role="status">{(props.running || range !== undefined) && <div className="oh-video-player-caption"><span>{range === undefined ? "" : `核对 ${videoRange(range)}`}</span><span>{props.running ? "正在继续制作 · 当前视频保留" : ""}</span></div>}</div>
          </div>}
          {loaded !== undefined && currentAsset === undefined && <p className="oh-video-notice" role="status">当前视频已从项目移除，已打开的画面保留；可以选择其他视频继续核对。</p>}
          {(pending || discovered !== undefined) && <div className="oh-video-version-notice" role="status"><div><strong>新版本已准备好</strong><span>当前视频保留，准备好后再载入。</span></div><button type="button" onClick={() => { const next = pending ? currentAsset : discovered; if (next !== undefined) load(next); }}>载入新版本</button></div>}
          {notice !== undefined && <p className="oh-video-notice" role="status">{notice}</p>}
        </div>
        {loaded !== undefined && <aside className="oh-video-script-panel" aria-label="分段解说稿"><header><h3>解说稿 <small>{loadedSegments.length > 0 ? `${String(loadedSegments.length)} 段` : ""}</small></h3><button type="button" aria-label="收起解说稿" onClick={() => { setShowScript(false); setScriptCollapsed(true); }}>×</button></header><div ref={scriptList} className="oh-video-segment-list" onWheel={() => { scriptScrolledAt.current = performance.now(); }} onTouchMove={() => { scriptScrolledAt.current = performance.now(); }}>{loadedSegments.length > 0 ? loadedSegments.map(renderSegment) : <div className="oh-video-script-empty"><button type="button" onClick={() => { props.onContinueInChat(`我想讨论《${project.title}》的解说方向，请先梳理主线和原声。`); }}>聊聊解说方向</button></div>}</div></aside>}
      </div>
    </section>
    <section role="tabpanel" id={`${props.tabsId}-canvas-panel`} aria-labelledby={`${props.tabsId}-canvas-tab`} hidden={props.tab !== "canvas"}><CreativeCanvas<VideoCanvasNode> nodes={canvasModel.nodes} edges={canvasModel.edges} state={canvas} onChange={(value) => { props.onCanvasChange(project.id, value); }} ariaLabel="视频创作无限画布" helpText="拖动空白处平移 · 滚轮缩放 · 双击打开内容" empty={{ title: "先从想讲的故事开始", description: "和 AI 讨论主线，已有文稿和媒体会出现在这里。", actionLabel: "聊聊解说想法", onAction: () => { props.onContinueInChat(`我想讨论《${project.title}》的故事主线和解说方向。`); } }} onOpen={onNodeOpen} onContinueInChat={(node) => { if (node.segment !== undefined) discuss(node.segment); else props.onContinueInChat(`我想继续调整《${project.title}》的「${node.title}」。${node.path === undefined ? "" : `内容：${node.path}。`}请先讨论思路。`); }} renderNodeMedia={(node) => { const asset = node.id === "source" ? project.previews.find((item) => item.role === "source") : node.id === "preview" ? preferredPreview(project) : undefined; return asset === undefined || props.tab !== "canvas" ? null : <video className="oh-video-canvas-thumbnail" src={mediaUrl(sessionId, asset)} preload="metadata" muted playsInline tabIndex={-1} aria-hidden />; }} renderNodeActions={(node) => <button type="button" onClick={() => { onNodeOpen(node); }}>{node.segment !== undefined ? project.narrative?.authoredClock === "unknown" ? "打开文稿" : "定位这段" : node.id === "source" ? "看原片" : node.id === "preview" ? "回到预览" : "打开文稿"}</button>} renderContextActions={(node) => <><button type="button" onClick={() => { onNodeOpen(node); }}>{node.segment === undefined ? "打开内容" : "定位这段"}</button>{node.segment !== undefined && <button type="button" onClick={() => { openDocument(); }}>打开文稿</button>}</>} /></section>
    <section role="tabpanel" id={`${props.tabsId}-docs-panel`} aria-labelledby={`${props.tabsId}-docs-tab`} hidden={props.tab !== "docs"}>{!props.hidden && props.tab === "docs" && <VideoDocuments project={project} editor={props.editor} onChat={props.onContinueInChat} />}<div className="oh-video-document-export">{project.artifacts.some((artifact) => artifact.path.endsWith("/subtitles.srt")) && <button type="button" disabled={exporting} onClick={() => { void downloadSubtitles(); }}>{exporting ? "正在导出…" : "导出项目字幕"}</button>}</div></section>
  </div>;
}
