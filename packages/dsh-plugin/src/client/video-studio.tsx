import { useEffect, useId, useRef, useState } from "react";
import { workbenchLabel, type WorkbenchMode } from "./file-activity.js";
import { endpoint, handleTabKey } from "./workbench-ui.js";

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

export interface VideoProject {
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

interface FilePayload { readonly content: string }
interface VideoPreflight {
  readonly python: { readonly ok: boolean; readonly version?: string };
  readonly ffmpeg: { readonly ok: boolean; readonly subtitles: boolean };
  readonly ffprobe: { readonly ok: boolean };
  readonly credentials: { readonly mimo: boolean; readonly fish: boolean; readonly ttsProvider: string };
}

function preferredPreview(project: VideoProject): VideoPreviewAsset | undefined {
  return project.previews.find((item) => item.role === "final")
    ?? project.previews.find((item) => item.role === "edited")
    ?? project.previews.find((item) => item.role === "source");
}

function readableBytes(bytes: number): string {
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
  return `${(bytes / (1_024 * 1_024 * 1_024)).toFixed(2)} GB`;
}

function ActionIcon({ name }: { readonly name: "reload" | "fullscreen" | "external" }) {
  const paths = {
    reload: <><path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/></>,
    fullscreen: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></>,
    external: <><path d="M14 3h7v7M21 3l-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>
  };
  return <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function preferredArtifact(project: VideoProject): VideoArtifactSummary | undefined {
  return project.artifacts.find((item) => item.path.endsWith("final_qc.json"))
    ?? project.artifacts.find((item) => item.path.endsWith("assembly_qc.json"))
    ?? project.artifacts.find((item) => item.kind === "quality")
    ?? project.artifacts.at(-1);
}

function artifactKindLabel(kind: VideoArtifactSummary["kind"]): string {
  return { plan: "方案", script: "文稿", subtitle: "字幕", quality: "质检", manifest: "清单" }[kind];
}

function VideoPreview({ project, sessionId, running }: { readonly project: VideoProject; readonly sessionId: string; readonly running: boolean }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const initial = preferredPreview(project);
  const [role, setRole] = useState<VideoPreviewAsset["role"] | undefined>(initial?.role);
  const selected = project.previews.find((item) => item.role === role) ?? preferredPreview(project);
  const [loaded, setLoaded] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  if (selected === undefined || loaded === undefined) return <div className="oh-video-preview-empty">
    <span aria-hidden>▶</span>
    <strong>还没有可预览的视频</strong>
    <p>把原片导入 <code>video-recaps/&lt;项目&gt;/sources/</code>，然后在右侧 Chat 使用 <code>/video-recap</code>。剪后片和最终成片会自动出现在这里。</p>
    <div className="oh-video-prompt-example"><span>描述示例</span><q>把这段视频做成 3 分钟中文解说，保留关键原声，字幕烧进画面。</q></div>
  </div>;
  const pending = selected.path !== loaded.path || selected.version !== loaded.version;
  const load = (asset: VideoPreviewAsset): void => {
    setRole(asset.role);
    setLoaded(asset);
    setReady(false);
    setError(false);
    setRevision((value) => value + 1);
  };
  const runtimeState = error ? "视频载入失败 · 可重新载入"
    : running ? "Agent 正在更新项目 · 当前播放保持不变"
      : pending ? "新版本已就绪 · 由你决定何时载入"
        : ready ? `${loaded.label}已载入 · ${readableBytes(loaded.bytes)}` : "正在读取视频信息…";
  const mediaUrl = `${endpoint("media", sessionId, loaded.path)}&version=${encodeURIComponent(loaded.version)}&reload=${String(revision)}`;
  return <div ref={shellRef} className="oh-video-preview-shell" data-state={error ? "error" : running ? "building" : ready ? "ready" : "loading"}>
    <div className="oh-video-stagebar">
      <div className="oh-video-version-tabs" role="tablist" aria-label="预览版本">
        {project.previews.map((asset) => <button
          type="button"
          role="tab"
          key={asset.role}
          aria-selected={asset.role === selected.role}
          tabIndex={asset.role === selected.role ? 0 : -1}
          onKeyDown={(event) => { handleTabKey(event, project.previews.map((item) => item.role), selected.role, (next) => {
            const asset = project.previews.find((item) => item.role === next);
            if (asset !== undefined) load(asset);
          }); }}
          onClick={() => { load(asset); }}
        >{asset.label}</button>)}
      </div>
      <span className="oh-video-runtime-state" role="status" aria-live="polite"><i aria-hidden /><em>{runtimeState}</em></span>
      <div className="oh-video-preview-actions">
        {pending && <button type="button" onClick={() => { load(selected); }}>载入新版本</button>}
        <button type="button" title="重新载入" aria-label="重新载入视频" onClick={() => { load(loaded); }}><ActionIcon name="reload" /></button>
        <button type="button" title="全屏" aria-label="全屏预览" onClick={() => { void shellRef.current?.requestFullscreen(); }}><ActionIcon name="fullscreen" /></button>
        <a href={mediaUrl} target="_blank" rel="noreferrer" title="在新窗口打开" aria-label="在新窗口打开视频"><ActionIcon name="external" /></a>
      </div>
    </div>
    <div className="oh-video-player-stage">
      <video
        key={`${loaded.path}:${loaded.version}:${String(revision)}`}
        src={mediaUrl}
        controls
        preload="metadata"
        playsInline
        onLoadedMetadata={() => { setReady(true); setError(false); }}
        onError={() => { setError(true); setReady(false); }}
      />
    </div>
  </div>;
}

function VideoArtifacts({ project, sessionId }: { readonly project: VideoProject; readonly sessionId: string }) {
  const [selected, setSelected] = useState(preferredArtifact(project)?.path);
  const [content, setContent] = useState<string>();
  const [error, setError] = useState<string>();
  const [preflight, setPreflight] = useState<VideoPreflight | "failed">();
  useEffect(() => { setSelected(preferredArtifact(project)?.path); }, [project.id]);
  useEffect(() => {
    if (selected === undefined) { setContent(undefined); return; }
    const controller = new AbortController();
    setContent(undefined);
    setError(undefined);
    void fetch(endpoint("file", sessionId, selected), { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as FilePayload & { readonly error?: string };
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${String(response.status)}`);
        setContent(payload.content);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { controller.abort(); };
  }, [selected, sessionId]);
  const selectedArtifact = project.artifacts.find((item) => item.path === selected);
  return <div className="oh-video-artifacts">
    <aside aria-label="视频项目产物">
      <div className="oh-video-artifacts-heading"><strong>项目产物</strong><span>{project.artifacts.length}</span></div>
      <div className="oh-video-environment">
        <strong>运行环境</strong>
        {typeof preflight === "object" ? <>
          <span data-ready={preflight.python.ok || undefined}>Python {preflight.python.version ?? "未找到"}</span>
          <span data-ready={(preflight.ffmpeg.ok && preflight.ffmpeg.subtitles) || undefined}>ffmpeg {preflight.ffmpeg.subtitles ? "· libass" : "· 缺字幕滤镜"}</span>
          <span data-ready={preflight.ffprobe.ok || undefined}>ffprobe {preflight.ffprobe.ok ? "可用" : "未找到"}</span>
          <span data-ready={preflight.credentials.mimo || undefined}>MiMo Key {preflight.credentials.mimo ? "已配置" : "未配置"}</span>
          {preflight.credentials.ttsProvider === "fish"
            && <span data-ready={preflight.credentials.fish || undefined}>Fish Key {preflight.credentials.fish ? "已配置" : "未配置"}</span>}
          <em>DSH Host 进程环境；Agent 执行世界以 <code>video-recap --doctor</code> 为准。</em>
        </> : <button type="button" onClick={() => {
          void fetch(endpoint("video-preflight", sessionId)).then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
            setPreflight(await response.json() as VideoPreflight);
          }).catch(() => { setPreflight("failed"); });
        }}>{preflight === "failed" ? "环境检查失败 · 重试" : "检查环境"}</button>}
      </div>
      <nav>
        {project.artifacts.length === 0 && <p>流水线启动后，关键产物会出现在这里。</p>}
        {project.artifacts.map((artifact) => <button
          type="button"
          key={artifact.path}
          aria-current={artifact.path === selected ? "page" : undefined}
          onClick={() => { setSelected(artifact.path); }}
        ><span>{artifact.label}</span><small>{artifact.path.split("/").at(-1)}</small></button>)}
      </nav>
    </aside>
    <section>
      {selectedArtifact !== undefined && <header className="oh-video-artifact-header">
        <div><strong>{selectedArtifact.label}</strong><span>{selectedArtifact.path.split("/").at(-1)}</span></div>
        <em>{artifactKindLabel(selectedArtifact.kind)}</em>
      </header>}
      <div className="oh-video-artifact-content">{project.artifacts.length === 0 ? <div className="oh-video-artifacts-empty">故事方案、解说词、字幕和质检报告会按上游流水线写入这里。</div>
        : error !== undefined ? <div className="oh-story-error">{error}</div>
        : content === undefined ? <div className="oh-video-artifacts-empty">正在载入产物…</div>
          : <pre>{content}</pre>}</div>
    </section>
  </div>;
}

export function VideoStudio({
  sessionId,
  projects,
  running,
  projectId,
  tab,
  hidden,
  workbenches,
  paneId,
  labelledBy,
  onProject,
  onTab,
  onWorkbench,
  onCollapse
}: {
  readonly sessionId: string;
  readonly projects: readonly VideoProject[];
  readonly running: boolean;
  readonly projectId: string | undefined;
  readonly tab: "preview" | "artifacts";
  readonly hidden: boolean;
  readonly workbenches: readonly WorkbenchMode[];
  readonly paneId: string;
  readonly labelledBy: string;
  readonly onProject: (id: string) => void;
  readonly onTab: (tab: "preview" | "artifacts") => void;
  readonly onWorkbench: (mode: WorkbenchMode) => void;
  readonly onCollapse: () => void;
}) {
  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  const tabsId = useId();
  useEffect(() => { if (project !== undefined && project.id !== projectId) onProject(project.id); }, [onProject, project, projectId]);
  const tabs = ["preview", "artifacts"] as const;
  return <main id={paneId} className="oh-video-studio" role="tabpanel" aria-labelledby={labelledBy} hidden={hidden}>
    <header className="oh-video-toolbar">
      <div className="oh-workbench-cluster">
        <div className="oh-video-mode-tabs" role="tablist" aria-label="创作工作台">{workbenches.map((mode) => <button
          type="button" role="tab" key={mode} aria-selected={mode === "video"} tabIndex={mode === "video" ? 0 : -1}
          onKeyDown={(event) => { handleTabKey(event, workbenches, "video", onWorkbench); }} onClick={() => { onWorkbench(mode); }}
        >{workbenchLabel(mode)}</button>)}</div>
        <button className="oh-workbench-collapse" type="button" title="收起创作工作台" aria-label="收起创作工作台" onClick={onCollapse}>×</button>
      </div>
      <label className="oh-video-project"><span>视频项目</span><select aria-label="视频项目" value={project?.id ?? ""} disabled={project === undefined} onChange={(event) => { onProject(event.target.value); }}>
        {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      {project !== undefined && <span className="oh-video-stage" data-state={project.state}><i aria-hidden />{project.stageLabel}</span>}
      <div className="oh-video-tabs" role="tablist" aria-label="视频工作台">{tabs.map((item) => <button
        type="button" role="tab" key={item} id={`${tabsId}-${item}-tab`} aria-controls={`${tabsId}-${item}-panel`}
        aria-selected={tab === item} tabIndex={tab === item ? 0 : -1}
        onKeyDown={(event) => { handleTabKey(event, tabs, tab, onTab); }} onClick={() => { onTab(item); }}
      >{item === "preview" ? "预览" : "产物"}</button>)}</div>
    </header>
    {project === undefined ? <div className="oh-video-preview-empty"><span aria-hidden>▶</span><strong>还没有视频项目</strong><p>在右侧 Chat 告诉 Agent 要处理的视频；项目会创建在 <code>video-recaps/&lt;项目&gt;/</code>。</p></div> : <div className="oh-video-panels">
      <div role="tabpanel" id={`${tabsId}-preview-panel`} aria-labelledby={`${tabsId}-preview-tab`} hidden={tab !== "preview"}><VideoPreview key={project.id} project={project} sessionId={sessionId} running={running} /></div>
      <div role="tabpanel" id={`${tabsId}-artifacts-panel`} aria-labelledby={`${tabsId}-artifacts-tab`} hidden={tab !== "artifacts"}><VideoArtifacts project={project} sessionId={sessionId} /></div>
    </div>}
  </main>;
}
