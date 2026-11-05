import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import { defineStore } from "@deepseek-ai/dsh-client-store";
import type { IConversation, PartialAssistant, RunningToolCall } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { PropsRenderSlots, PropsRuntime, PropsStore } from "@deepseek-ai/dsh-client-ui-slots";
import type { ToolCallViewProps } from "@deepseek-ai/dsh-client-ui-tool/client";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  creativeRelativePath,
  fileMutations,
  latestSettledMutation,
  latestSettledMutationTurn,
  mutatingCallIds,
  openTurn,
  initialWorkbenchMode,
  preferredWorkbenchFile,
  previewMutation,
  sameUndispatchedCalls,
  SHORT_STORY_FILES,
  streamingAssistant,
  undispatchedCalls,
  workbenchLabel,
  workbenchModeForPath,
  type UndispatchedCall,
  type WorkbenchMode
} from "./file-activity.js";
import { buildFileTree, type FileTreeNode } from "./file-tree.js";
import { JsonlPreview } from "./jsonl-preview.js";
import { MarkdownPreview } from "./markdown-preview.js";
import {
  creatorDocumentPaths,
  episodeDirectoryForPath,
  isCreatorDocumentPath,
  parseEpisodeProduction,
  type DramaDocumentTarget,
  type DramaProductionSection
} from "./drama-production.js";
import { DramaProductionView } from "./drama-production-view.js";
import type { CanvasViewport } from "./canvas-viewport.js";
import { productionCanvasNodes } from "./production-canvas-model.js";
import { createPendingJob, type
  CanvasPoint,
  mediaTargetFromPath,
  productionQueueFromInbox,
  type ProductionJob,
  type ProductionMediaVersion,
  type ProductionQueueEntry,
  type ProductionSequenceItem
} from "./production-runtime.js";
import { settledProductionIntents, type SettledProductionIntent } from "./production-intents.js";
import { OH_STORY_PRODUCTION_TOOL_NAME } from "../production-intent.js";
import { VideoStudio, type VideoProject, type VideoWorkspaceTab } from "./video-studio.js";
import {
  hasCreativeProject,
  readWorkbenchPreference,
  resolveWorkbenchOpen,
  workbenchPreferenceStorage,
  writeWorkbenchPreference,
  type WorkbenchPreference
} from "./workbench-presence.js";
import { GameCanvas } from "./game-canvas.js";
import { gameCreativeDocuments } from "./game-canvas-model.js";
import { GameDocuments, type GameDocumentEditor } from "./game-documents.js";
import { EMPTY_GAME_CANVAS, type GameCanvasState, type GameProject, type GameWorkspaceTab } from "./game-workspace-types.js";
import { videoCreativeDocuments } from "./video-workspace-model.js";
import videoStudioStyles from "./video-studio.css?inline";
import gameCanvasStyles from "./game-canvas.css?inline";
import { gamePreviewStatus, previewUrls } from "./game-preview-state.js";
import { focusChatContext } from "./chat-context.js";
import { WorkbenchModeTabs } from "./workbench-mode-tabs.js";
import { endpoint, handleTabKey } from "./workbench-ui.js";
import styles from "./plugin.css?inline";

export const name = "oh-story";
export const inject = ["slots", "sessions", "conversation"];

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "oh-story.workspace": { kind: "single"; scope: "session" };
  }
}

interface WorkspaceFile {
  readonly path: string;
  readonly bytes: number;
  readonly version: string;
  readonly kind: "text" | "media";
  readonly mimeType?: string | undefined;
}
interface WorkspacePayload {
  readonly cwd: string;
  readonly files: readonly WorkspaceFile[];
  readonly games: readonly GameProject[];
  readonly videos: readonly VideoProject[];
  readonly shortDrama: Record<string, unknown> | null;
  readonly metadataErrors: readonly string[];
  readonly mode: "dsh-session";
}
interface FilePayload {
  readonly path: string;
  readonly content: string;
  readonly bytes: number;
  readonly version: string;
}
interface FileBuffer {
  readonly content: string;
  readonly saved: string;
  readonly source: "disk" | "human" | "agent";
  readonly version: string;
  readonly saving?: boolean | undefined;
  readonly error?: string | undefined;
  readonly missing?: boolean | undefined;
  readonly conflict?: {
    readonly message: string;
    readonly theirs?: string | undefined;
    readonly theirsVersion?: string | undefined;
  } | undefined;
}

interface WorkbenchMemory {
  buffers: Record<string, FileBuffer>;
  workbenchPreference: WorkbenchPreference | undefined;
  editorMode: "preview" | "source" | "production";
  dramaPane: "canvas" | "documents";
  dramaFilesOpen: boolean;
  dramaChatOpen: boolean;
  dramaEpisode: string | undefined;
  expanded: Record<string, boolean>;
  selected: string | undefined;
  workbench: WorkbenchMode;
  gameTab: GameWorkspaceTab;
  gameChatOpen: boolean;
  gameCanvas: Record<string, GameCanvasState>;
  gameProjectId: string | undefined;
  gamePane: "studio" | "chat";
  videoTab: VideoWorkspaceTab;
  videoChatOpen: boolean;
  videoCanvas: Record<string, GameCanvasState>;
  videoProjectId: string | undefined;
  videoPane: "studio" | "chat";
  productionSection: DramaProductionSection;
  productionSelectedIds: Record<string, string | undefined>;
  productionJobs: Record<string, ProductionJob[]>;
  productionSelections: Record<string, Record<string, string>>;
  productionReferences: Record<string, Record<string, string[]>>;
  productionSequence: Record<string, ProductionSequenceItem[]>;
  productionCanvas: Record<string, Record<string, CanvasPoint>>;
  productionViewport: Record<string, CanvasViewport>;
  productionIntentCalls: Record<string, boolean>;
  /** Latest settled Agent write the workbench has already followed or taken as history. */
  settledMutation: string | undefined;
  /** False only in a Store instance the plugin has not restored this Session's memory into yet. */
  hydrated: boolean;
}

type Update<T> = T | ((current: T) => T);

function applyUpdate<T>(current: T, update: Update<T>): T {
  return typeof update === "function" ? (update as (value: T) => T)(current) : update;
}

/**
 * DSH 0.1.7 binds session-scoped Store instances to the Session binding's generation and drops
 * them when that generation is released or rebound, which a Session switch is enough to do, and
 * a mounted slot can be handed a fresh instance. The workbench keeps unsaved drafts, production
 * jobs and layout in its Store, and those lived for the page before, so the plugin holds its own
 * page-lifetime copy and restores it into every fresh instance.
 */
const workbenchMemoryBySession = new Map<string, WorkbenchMemory>();

const NO_UNDISPATCHED_CALLS: readonly UndispatchedCall[] = [];

function createWorkbenchStore() {
  return defineStore({
    init: (): WorkbenchMemory => ({
      buffers: {},
      workbenchPreference: undefined,
      editorMode: "preview",
      dramaPane: "canvas",
      dramaFilesOpen: false,
      dramaChatOpen: false,
      dramaEpisode: undefined,
      expanded: {},
      selected: undefined,
      workbench: "story",
      gameTab: "preview",
      gameChatOpen: true,
      gameCanvas: {},
      gameProjectId: undefined,
      gamePane: "studio",
      videoTab: "preview",
      videoChatOpen: false,
      videoCanvas: {},
      videoProjectId: undefined,
      videoPane: "studio",
      productionSection: "canvas",
      productionSelectedIds: {},
      productionJobs: {},
      productionSelections: {},
      productionReferences: {},
      productionSequence: {},
      productionCanvas: {},
      productionViewport: {},
      productionIntentCalls: {},
      settledMutation: undefined,
      hydrated: false
    }),
    actions: {
      restore: (draft, memory: WorkbenchMemory | undefined) => {
        if (memory !== undefined) {
          Object.assign(draft, memory);
          // A save in flight belonged to the dropped instance; its completion never lands here.
          draft.buffers = Object.fromEntries(Object.entries(memory.buffers).map(([path, buffer]) => [path, { ...buffer, saving: undefined }]));
        }
        draft.hydrated = true;
      },
      setSettledMutation: (draft, value: string | undefined) => {
        draft.settledMutation = value;
      },
      setBuffers: (draft, update: Update<Record<string, FileBuffer>>) => {
        draft.buffers = applyUpdate(draft.buffers, update);
      },
      setWorkbenchPreference: (draft, update: Update<WorkbenchPreference | undefined>) => {
        draft.workbenchPreference = applyUpdate(draft.workbenchPreference, update);
      },
      setEditorMode: (draft, update: Update<WorkbenchMemory["editorMode"]>) => {
        draft.editorMode = applyUpdate(draft.editorMode, update);
      },
      setDramaPane: (draft, pane: WorkbenchMemory["dramaPane"]) => { draft.dramaPane = pane; },
      setDramaFilesOpen: (draft, open: boolean) => { draft.dramaFilesOpen = open; },
      setDramaChatOpen: (draft, open: boolean) => { draft.dramaChatOpen = open; },
      setDramaEpisode: (draft, episode: string | undefined) => { draft.dramaEpisode = episode; },
      setExpanded: (draft, update: Update<Record<string, boolean>>) => {
        draft.expanded = applyUpdate(draft.expanded, update);
      },
      setSelected: (draft, update: Update<string | undefined>) => {
        draft.selected = applyUpdate(draft.selected, update);
      },
      setWorkbench: (draft, update: Update<WorkbenchMode>) => {
        draft.workbench = applyUpdate(draft.workbench, update);
      },
      setGameTab: (draft, update: Update<WorkbenchMemory["gameTab"]>) => {
        draft.gameTab = applyUpdate(draft.gameTab, update);
      },
      setGameChatOpen: (draft, open: boolean) => { draft.gameChatOpen = open; },
      setGameCanvas: (draft, update: Update<WorkbenchMemory["gameCanvas"]>) => { draft.gameCanvas = applyUpdate(draft.gameCanvas, update); },
      setGameProjectId: (draft, update: Update<string | undefined>) => {
        draft.gameProjectId = applyUpdate(draft.gameProjectId, update);
      },
      setGamePane: (draft, update: Update<WorkbenchMemory["gamePane"]>) => {
        draft.gamePane = applyUpdate(draft.gamePane, update);
      },
      setVideoTab: (draft, update: Update<WorkbenchMemory["videoTab"]>) => {
        draft.videoTab = applyUpdate(draft.videoTab, update);
      },
      setVideoChatOpen: (draft, open: boolean) => { draft.videoChatOpen = open; },
      setVideoCanvas: (draft, update: Update<WorkbenchMemory["videoCanvas"]>) => { draft.videoCanvas = applyUpdate(draft.videoCanvas, update); },
      setVideoProjectId: (draft, update: Update<string | undefined>) => {
        draft.videoProjectId = applyUpdate(draft.videoProjectId, update);
      },
      setVideoPane: (draft, update: Update<WorkbenchMemory["videoPane"]>) => {
        draft.videoPane = applyUpdate(draft.videoPane, update);
      },
      setProductionSection: (draft, update: Update<DramaProductionSection>) => {
        draft.productionSection = applyUpdate(draft.productionSection, update);
      },
      setProductionSelectedIds: (draft, update: Update<Record<string, string | undefined>>) => {
        draft.productionSelectedIds = applyUpdate(draft.productionSelectedIds, update);
      },
      setProductionJobs: (draft, update: Update<Record<string, ProductionJob[]>>) => {
        draft.productionJobs = applyUpdate(draft.productionJobs, update);
      },
      setProductionSelections: (draft, update: Update<Record<string, Record<string, string>>>) => {
        draft.productionSelections = applyUpdate(draft.productionSelections, update);
      },
      setProductionReferences: (draft, update: Update<Record<string, Record<string, string[]>>>) => {
        draft.productionReferences = applyUpdate(draft.productionReferences, update);
      },
      setProductionSequence: (draft, update: Update<Record<string, ProductionSequenceItem[]>>) => {
        draft.productionSequence = applyUpdate(draft.productionSequence, update);
      },
      setProductionCanvas: (draft, update: Update<Record<string, Record<string, CanvasPoint>>>) => {
        draft.productionCanvas = applyUpdate(draft.productionCanvas, update);
      },
      setProductionViewport: (draft, update: Update<Record<string, CanvasViewport>>) => {
        draft.productionViewport = applyUpdate(draft.productionViewport, update);
      },
      setProductionIntentCalls: (draft, update: Update<Record<string, boolean>>) => {
        draft.productionIntentCalls = applyUpdate(draft.productionIntentCalls, update);
      }
    }
  });
}

class WorkspaceRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const GROUP_ORDER: Readonly<Record<WorkbenchMode, readonly string[]>> = {
  story: ["短篇", "正文", "大纲", "设定", "追踪", "对标", "参考资料"],
  drama: ["项目", "输入", "项目开发", "设定集", "剧集", "审查", "创作者决策", "交付"],
  game: ["game-adaptations"],
  video: ["video-recaps"]
};

const EDITOR_MODES = ["preview", "source", "production"] as const;

function groupForPath(path: string): string {
  if (path === "short-drama.json") return "项目";
  if (SHORT_STORY_FILES.has(path)) return "短篇";
  return path.split("/", 1)[0] ?? "其他";
}

async function json<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { readonly error?: string };
  if (!response.ok) throw new WorkspaceRequestError(response.status, value.error ?? `HTTP ${String(response.status)}`);
  return value;
}

function FileTreeNodes({
  nodes,
  depth,
  expanded,
  selected,
  activityPath,
  onToggle,
  onSelect
}: {
  readonly nodes: readonly FileTreeNode[];
  readonly depth: number;
  readonly expanded: Readonly<Record<string, boolean>>;
  readonly selected: string | undefined;
  readonly activityPath: string | undefined;
  readonly onToggle: (path: string, open: boolean) => void;
  readonly onSelect: (path: string) => void;
}) {
  return <>{nodes.map((node) => {
    if (node.kind === "file") return <button
      type="button"
      key={node.path}
      style={{ "--oh-story-indent": `${String(depth * 14)}px` } as CSSProperties}
      title={node.path}
      aria-label={node.path}
      data-file-path={node.path}
      data-agent-target={node.path === activityPath || undefined}
      aria-current={node.path === selected ? "page" : undefined}
      onClick={() => { onSelect(node.path); }}
    >{node.name}</button>;
    const open = selected?.startsWith(`${node.path}/`) === true || expanded[node.path] === true;
    return <details className="oh-story-file-folder" key={node.path} open={open} onToggle={(event) => { onToggle(node.path, event.currentTarget.open); }}>
      <summary style={{ "--oh-story-indent": `${String(depth * 14)}px` } as CSSProperties} title={node.path}>{node.name}<span>{node.fileCount}</span></summary>
      <FileTreeNodes
        nodes={node.children}
        depth={depth + 1}
        expanded={expanded}
        selected={selected}
        activityPath={activityPath}
        onToggle={onToggle}
        onSelect={onSelect}
      />
    </details>;
  })}</>;
}

/** How often the workspace is re-listed while the Session runs; see {@link useWorkspace}. */
const LIVE_WORKSPACE_REFRESH_MS = 4_000;

function useWorkspace(sessionId: string, live: boolean): {
  readonly workspace: WorkspacePayload | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly reload: () => void;
} {
  const [version, setVersion] = useState(0);
  const [workspace, setWorkspace] = useState<WorkspacePayload>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const listed = useRef<string | undefined>(undefined);
  const inFlight = useRef<AbortController | undefined>(undefined);
  const reload = useCallback(() => {
    setLoading(true);
    setVersion((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    inFlight.current = controller;
    void fetch(endpoint("workspace", sessionId), { signal: controller.signal })
      .then((response) => json<WorkspacePayload>(response))
      .then((payload) => {
        // Cleared only on success: a quiet refresh that fails again must not blink the error away.
        setError(undefined);
        // An unchanged listing keeps the same object, so a quiet refresh re-renders nothing.
        const text = JSON.stringify(payload);
        if (text === listed.current) return;
        listed.current = text;
        setWorkspace(payload);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        // An aborted request settles after its successor started; only the owner clears the flag.
        if (inFlight.current === controller) inFlight.current = undefined;
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => { controller.abort(); };
  }, [sessionId, version]);
  // Writes by Role subagents, background jobs and scripts happen outside this Session's own tool
  // calls, so nothing here settles until the whole run ends (a Role can write for ten minutes).
  // While the Session runs, re-list the workspace quietly so new files reach the tree.
  useEffect(() => {
    if (!live) return;
    const timer = globalThis.setInterval(() => {
      if (inFlight.current !== undefined || globalThis.document.visibilityState === "hidden") return;
      setVersion((value) => value + 1);
    }, LIVE_WORKSPACE_REFRESH_MS);
    return () => { globalThis.clearInterval(timer); };
  }, [live]);
  return { workspace, error, loading, reload };
}

/**
 * An iframe fires `load`, not `error`, when a navigation commits an HTTP error response, so the
 * frame's own events cannot tell a working preview from the route's JSON error body. Probe the
 * same build out of band (on the page's own origin, see previewUrls) and report a non-OK or
 * non-HTML answer as a real failure.
 */
function PreviewProbe({ href, onResult }: { readonly href: string; readonly onResult: (href: string, result: "ok" | "failed") => void }) {
  // Hold the callback in a ref so an inline arrow from the caller cannot re-trigger the probe.
  const resultRef = useRef(onResult);
  useEffect(() => { resultRef.current = onResult; }, [onResult]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(href, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const type = response.headers.get("content-type") ?? "";
        resultRef.current(href, response.ok && type.includes("text/html") ? "ok" : "failed");
      })
      .catch(() => { if (!controller.signal.aborted) resultRef.current(href, "failed"); });
    return () => { controller.abort(); };
  }, [href]);
  return null;
}

function GamePreview({ project, building, onDiscuss }: { readonly project: GameProject; readonly building: boolean; readonly onDiscuss: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFullscreenFocus = useRef(false);
  const [focused, setFocused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [probe, setProbe] = useState<{ readonly href: string; readonly result: "ok" | "failed" }>();
  const [revision, setRevision] = useState(0);
  const lastPlayable = useRef<GameProject>(project);
  if (project.previewReady) lastPlayable.current = project;
  const [acceptedVersion, setLoadedVersion] = useState<string | undefined>(project.previewReady ? project.previewVersion : undefined);
  const loadedVersion = acceptedVersion ?? project.previewVersion;
  useEffect(() => {
    if (project.previewReady && acceptedVersion === undefined) setLoadedVersion(project.previewVersion);
  }, [acceptedVersion, project.previewReady, project.previewVersion]);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  useEffect(() => {
    const document = shellRef.current?.ownerDocument;
    if (document === undefined) return;
    const restore = (): void => {
      if (document.fullscreenElement !== null || !restoreFullscreenFocus.current) return;
      restoreFullscreenFocus.current = false;
      fullscreenButtonRef.current?.focus();
    };
    document.addEventListener("fullscreenchange", restore);
    return () => { document.removeEventListener("fullscreenchange", restore); };
  }, []);
  const playable = lastPlayable.current;
  if (!playable.previewReady || playable.previewUrl === undefined) return <div className="oh-game-preview-empty">
    <span aria-hidden>◫</span>
    <strong>还没有可试玩版本</strong>
    <p>故事已经有了轮廓。可以继续完善创作设定，也可以先做一小段能玩的体验。</p>
    <button type="button" onClick={onDiscuss}>和 AI 做一段试玩</button>
    <div className="oh-game-prompt-example"><span>描述示例</span><q>把《作品名》改编成网页互动游戏，目标玩家是……，核心玩法是……，希望整体风格……</q></div>
  </div>;
  const preview = previewUrls(playable.previewUrl, loadedVersion, revision, globalThis.location.origin);
  const pending = project.previewReady && project.previewVersion !== loadedVersion;
  /** Accept the newer build the creator just chose. */
  const reload = (): void => {
    setLoaded(false);
    setLoadError(false);
    setLoadedVersion(project.previewVersion);
    setRevision((value) => value + 1);
  };
  /** Re-run the build the creator already accepted; never silently adopt a newer one. */
  const refresh = (): void => {
    setLoaded(false);
    setLoadError(false);
    setRevision((value) => value + 1);
  };
  const status = gamePreviewStatus({
    frameLoaded: loaded,
    frameError: loadError,
    // A result for an earlier URL describes a build the frame no longer shows.
    probe: probe?.href === preview.probeHref ? probe.result : "pending",
    building,
    pending,
    isolated: preview.isolated
  });
  const runtimeState = status.label;
  const fullscreen = (): void => {
    const shell = shellRef.current;
    if (shell === null) return;
    restoreFullscreenFocus.current = true;
    void shell.requestFullscreen().catch(() => { restoreFullscreenFocus.current = false; });
  };
  return <div ref={shellRef} className="oh-game-preview-shell" data-state={status.tone} data-device={device} data-update={pending && !building ? "pending" : undefined}>
    {pending && !building && <div className="oh-game-new-version" role="status"><div><strong>新的试玩版本已准备好</strong><span>可以先玩完这里，再选择载入更新。</span></div><button type="button" onClick={reload}>载入新版本</button></div>}
    <div className="oh-game-preview-status">
      <span className="oh-game-runtime-state" role="status" aria-live="polite" title={runtimeState}><i aria-hidden /><em>{runtimeState}</em></span>
      {/* In the status bar, not over the stage: a game's own corner controls stay visible. */}
      <span className="oh-game-focus-hint" data-focused={focused || undefined}>{focused ? "游戏正在接收键鼠输入" : "点击画面进入试玩"}</span>
      <div>
        <button type="button" className="oh-game-device" aria-label="桌面预览" aria-pressed={device === "desktop"} onClick={() => { setDevice("desktop"); }}><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><rect x="2" y="3" width="16" height="11" rx="1" /><path d="M10 14v3M6 17h8" /></svg></button>
        <button type="button" className="oh-game-device" aria-label="手机预览" aria-pressed={device === "phone"} onClick={() => { setDevice("phone"); }}><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><rect x="6" y="2" width="8" height="16" rx="1" /><path d="M9 15h2" /></svg></button>
        <button className="oh-game-reload" type="button" disabled={pending || building || !project.previewReady} title={pending ? "请通过载入新版本更新试玩" : undefined} onClick={refresh} aria-label="重新载入游戏"><span aria-hidden>↻</span><b>刷新</b></button>
        <button ref={fullscreenButtonRef} type="button" onClick={fullscreen}>全屏试玩</button>
      </div>
    </div>
    <PreviewProbe href={preview.probeHref} onResult={(href, result) => { setProbe({ href, result }); }} />
    <iframe
      key={`${project.id}:${loadedVersion}:${String(revision)}`}
      src={preview.href}
      title={`《${project.title}》可试玩预览`}
      sandbox={preview.isolated
        ? "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
        : "allow-scripts allow-forms allow-modals allow-downloads"}
      allow="autoplay; fullscreen; gamepad"
      allowFullScreen
      referrerPolicy="no-referrer"
      onLoad={() => { setLoaded(true); }}
      onError={() => { setLoaded(false); setLoadError(true); }}
      onFocus={() => { setFocused(true); }}
      onBlur={() => { setFocused(false); }}
    />
  </div>;
}

function GameStudio({ workspace, building, gameTab, gameProjectId, hidden, onGameTab, onGameProject, paneId, labelledBy, onWorkbench, onCollapse, editor, canvasByProject, onCanvasChange, chatOpen, onChatOpen, onContinueInChat }: {
  readonly workspace: WorkspacePayload;
  readonly building: boolean;
  readonly gameTab: GameWorkspaceTab;
  readonly gameProjectId: string | undefined;
  readonly hidden: boolean;
  readonly onGameTab: (tab: GameWorkspaceTab) => void;
  readonly onGameProject: (id: string) => void;
  readonly paneId: string;
  readonly labelledBy: string;
  readonly onWorkbench: (mode: WorkbenchMode) => void;
  readonly onCollapse: () => void;
  readonly editor: GameDocumentEditor;
  readonly canvasByProject: Readonly<Record<string, GameCanvasState>>;
  readonly onCanvasChange: (projectId: string, value: GameCanvasState) => void;
  readonly chatOpen: boolean;
  readonly onChatOpen: (open: boolean) => void;
  readonly onContinueInChat: (prompt: string) => void;
}) {
  const project = gameProjectId === "" ? undefined : workspace.games.find((item) => item.id === gameProjectId) ?? workspace.games[0];
  const studioRef = useRef<HTMLElement>(null);
  const tabsId = useId();
  useLayoutEffect(() => {
    const studio = studioRef.current;
    if (studio === null) return;
    // Below this width the workbench tabs no longer fit beside the 制作/对话 switch.
    const measure = () => { studio.toggleAttribute("data-oh-game-narrow", studio.clientWidth <= 340); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(studio);
    return () => { observer.disconnect(); };
  }, []);
  useEffect(() => { if (project !== undefined && project.id !== gameProjectId) onGameProject(project.id); }, [gameProjectId, onGameProject, project]);
  useEffect(() => {
    if (hidden || project === undefined || gameTab !== "design" || editor.selected?.startsWith(`${project.root}/`) === true) return;
    const first = gameCreativeDocuments(project, workspace.files)[0]?.path;
    if (first !== undefined) editor.onSelect(first);
  }, [editor.selected, gameTab, hidden, project?.id, workspace.files]);
  const selectTab = (tab: GameWorkspaceTab) => {
    onGameTab(tab);
    if (tab === "canvas") onChatOpen(false);
    if (tab === "design" && project !== undefined && editor.selected?.startsWith(`${project.root}/`) !== true) {
      const first = gameCreativeDocuments(project, workspace.files)[0]?.path;
      if (first !== undefined) editor.onSelect(first);
    }
  };
  const documents = Object.fromEntries(Object.entries(editor.buffers).filter(([, value]) => value.missing !== true).map(([path, value]) => [path, value.content]));
  const canvasDocumentsReady = project === undefined || gameCreativeDocuments(project, workspace.files).every(({ path }) => editor.buffers[path] !== undefined || editor.errors[path] !== undefined);
  const tabLabels = { preview: "试玩", canvas: "创作画布", design: "文稿" } as const;
  const tabs = ["preview", "canvas", "design"] as const;
  return <main ref={studioRef} id={paneId} className="oh-game-studio" role="tabpanel" aria-labelledby={labelledBy} hidden={hidden}>
    <header className="oh-game-toolbar">
      <div className="oh-workbench-cluster"><WorkbenchModeTabs className="oh-game-mode-tabs" current="game" onSelect={onWorkbench} /><button className="oh-workbench-collapse" type="button" title="收起创作工作台" aria-label="收起创作工作台" onClick={onCollapse}>×</button></div>
      <label className="oh-game-project" title="切换项目将重新载入试玩"><span>游戏项目</span><select aria-label="游戏项目；切换将重新载入试玩" value={project?.id ?? ""} onChange={(event) => { onGameProject(event.target.value); }}><option value="">新建游戏想法</option>{workspace.games.length > 0 && <optgroup label="我的项目">{workspace.games.map((item) => <option value={item.id} key={item.id}>{`我的项目 · ${item.title}`}</option>)}</optgroup>}</select></label>
      <div className="oh-game-tabs" role="tablist" aria-label="游戏工作台">{tabs.map((tab) => <button key={tab} type="button" role="tab" tabIndex={gameTab === tab ? 0 : -1} aria-selected={gameTab === tab} id={`${tabsId}-${tab}-tab`} aria-controls={`${tabsId}-${tab}-panel`} onKeyDown={(event) => { handleTabKey(event, tabs, gameTab, selectTab); }} onClick={() => { selectTab(tab); }}>{tabLabels[tab]}</button>)}</div>
      <div className="oh-game-toolbar-actions"><button type="button" className="oh-game-chat-toggle" aria-label={chatOpen ? "收起原生 Chat" : "展开原生 Chat"} aria-expanded={chatOpen} onClick={() => { onChatOpen(!chatOpen); }}>Chat</button></div>
    </header>
    {project === undefined ? <div className="oh-game-create-empty"><span aria-hidden>◫</span><small>一个故事，可以有很多种玩法</small><h2>把你的故事，变成能玩的世界。</h2><p>带来一部小说、一个人物，或者一个刚冒出来的念头。<br />先聊聊你希望玩家经历什么。</p><div><button type="button" onClick={() => { onContinueInChat("我想做一段可以选择结局的故事，先聊聊玩家会经历什么。"); }}>一段可以选择的故事</button><button type="button" onClick={() => { onContinueInChat("我想围绕小说里的人物做一款轻策略游戏，先和我讨论核心玩法。"); }}>围绕人物的轻策略</button><button type="button" onClick={() => { onContinueInChat("我想把小说里的地点做成可以探索的世界，先讨论可玩的体验。"); }}>可以探索的世界</button></div><button type="button" className="oh-game-primary" onClick={() => { onContinueInChat("我有一个游戏想法，想先聊聊故事和玩家的体验。"); }}>和 AI 讨论游戏想法</button></div>
      : <div className="oh-game-panels">
        <div className="oh-game-panel oh-game-play-panel" role="tabpanel" id={`${tabsId}-preview-panel`} aria-labelledby={`${tabsId}-preview-tab`} hidden={gameTab !== "preview"}>
          <GamePreview key={project.id} project={project} building={building} onDiscuss={() => { onContinueInChat(`先把「${project.title}」做成一小段可以玩的体验，请先和我核对故事、玩法和范围。`); }} />
        </div>
        <div className="oh-game-panel" role="tabpanel" id={`${tabsId}-canvas-panel`} aria-labelledby={`${tabsId}-canvas-tab`} hidden={gameTab !== "canvas"}>{canvasDocumentsReady ? <GameCanvas key={project.id} project={project} files={workspace.files} documents={documents} state={canvasByProject[project.id] ?? EMPTY_GAME_CANVAS} onChange={(value) => { onCanvasChange(project.id, value); }} onOpenDocument={(path) => { editor.onSelect(path); onGameTab("design"); editor.onMode("preview"); }} onContinueInChat={(title, path) => { onContinueInChat(`我想继续讨论「${title}」。${path === undefined ? "" : `文稿：${path}`} 请先和我讨论玩家体验，不直接开始制作。`); }} onPlay={() => { onGameTab("preview"); }} /> : <div className="oh-game-design-empty" role="status">正在整理创作画布…</div>}</div>
        <div className="oh-game-panel" role="tabpanel" id={`${tabsId}-design-panel`} aria-labelledby={`${tabsId}-design-tab`} hidden={gameTab !== "design"}><GameDocuments project={project} files={workspace.files} editor={editor} onChat={onContinueInChat} /></div>
      </div>}
  </main>;
}

function CreativeWorkbench({
  sessionId,
  runningCalls,
  partial,
  undispatched,
  settledMutation,
  settledMutationTurn,
  liveTurn,
  sessionRunning,
  productionQueue,
  productionIntents,
  sendProductionPrompt,
  focusProductionChat,
  cancelProduction,
  removeQueuedProduction,
  workspace,
  error,
  workspaceLoading,
  reload,
  open,
  creativeProject,
  welcome,
  useStore,
  actions
}: {
  readonly sessionId: string;
  readonly runningCalls: readonly RunningToolCall[];
  readonly partial: PartialAssistant | null;
  readonly undispatched: readonly UndispatchedCall[];
  readonly settledMutation: string | undefined;
  /** Turn of {@link settledMutation}; only a write from a Turn this mount saw open is followed. */
  readonly settledMutationTurn: number | undefined;
  /** The Session's last Turn while it is open. */
  readonly liveTurn: number | undefined;
  readonly sessionRunning: boolean;
  readonly productionQueue: readonly ProductionQueueEntry[];
  readonly productionIntents: readonly SettledProductionIntent[];
  readonly workspace: WorkspacePayload | undefined;
  readonly error: string | undefined;
  readonly workspaceLoading: boolean;
  readonly reload: () => void;
  readonly open: boolean;
  readonly creativeProject: boolean;
  /** A blank Session over a workspace without creative work: the first thing a fresh DSH shows. */
  readonly welcome: boolean;
} & Pick<WorkbenchSlotProps, "useStore" | "actions" | "sendProductionPrompt" | "focusProductionChat" | "cancelProduction" | "removeQueuedProduction">) {
  const activities = useMemo(
    () => fileMutations(runningCalls, partial, undispatched),
    [partial, runningCalls, undispatched]
  );
  const normalizedActivities = useMemo(() => activities.flatMap((activity) => {
    const path = creativeRelativePath(activity.path, workspace?.cwd);
    return path === undefined ? [] : [{ activity, path }];
  }), [activities, workspace?.cwd]);
  const primaryActivity = normalizedActivities.at(-1);
  const activityPaths = useMemo(() => new Set(normalizedActivities.map((value) => value.path)), [normalizedActivities]);
  const latestActivityPaths = useRef(activityPaths);
  latestActivityPaths.current = activityPaths;
  const settledPath = settledMutation === undefined
    ? undefined
    : creativeRelativePath(settledMutation.slice(settledMutation.indexOf("\0") + 1), workspace?.cwd);
  const activity = primaryActivity?.activity;
  const activityPath = primaryActivity?.path;
  const workbench = useStore((memory) => memory.workbench);
  const setWorkbench = actions.setWorkbench;
  const gameTab = useStore((memory) => memory.gameTab);
  const gameChatOpen = useStore((memory) => memory.gameChatOpen);
  const gameCanvasByProject = useStore((memory) => memory.gameCanvas);
  const setGameTab = actions.setGameTab;
  const gameProjectId = useStore((memory) => memory.gameProjectId);
  const setGameProjectId = actions.setGameProjectId;
  const gamePane = useStore((memory) => memory.gamePane);
  const setGamePane = actions.setGamePane;
  const videoTab = useStore((memory) => memory.videoTab);
  const setVideoTab = actions.setVideoTab;
  const videoProjectId = useStore((memory) => memory.videoProjectId);
  const setVideoProjectId = actions.setVideoProjectId;
  const videoChatOpen = useStore((memory) => memory.videoChatOpen);
  const videoPane = useStore((memory) => memory.videoPane);
  const setVideoPane = actions.setVideoPane;
  const videoCanvasByProject = useStore((memory) => memory.videoCanvas);
  const dramaPane = useStore((memory) => memory.dramaPane);
  const dramaFilesOpen = useStore((memory) => memory.dramaFilesOpen);
  const dramaChatOpen = useStore((memory) => memory.dramaChatOpen);
  const dramaEpisode = useStore((memory) => memory.dramaEpisode);
  const dramaCanvasActive = workbench === "drama" && dramaPane === "canvas";
  const selected = useStore((memory) => memory.selected);
  const setSelected = actions.setSelected;
  const buffers = useStore((memory) => memory.buffers);
  const setBuffers = actions.setBuffers;
  const buffersRef = useRef<Record<string, FileBuffer>>({});
  const expanded = useStore((memory) => memory.expanded);
  const setExpanded = actions.setExpanded;
  const [manualChatContext, setManualChatContext] = useState<string>();
  const [contextCopyStatus, setContextCopyStatus] = useState<string>();
  const [gameLoadAttempt, setGameLoadAttempt] = useState(0);
  const [gameReadErrors, setGameReadErrors] = useState<Readonly<Record<string, string>>>({});
  const activeGame = gameProjectId === "" ? undefined : workspace?.games.find((project) => project.id === gameProjectId) ?? workspace?.games[0];
  const gameDocuments = useMemo(() => activeGame === undefined ? [] : gameCreativeDocuments(activeGame, workspace?.files ?? []), [activeGame, workspace?.files]);
  const activeVideo = workspace?.videos.find((project) => project.id === videoProjectId) ?? workspace?.videos[0];
  const videoDocuments = useMemo(() => activeVideo === undefined ? [] : videoCreativeDocuments(activeVideo), [activeVideo]);
  const creativeDocuments = workbench === "video" ? videoDocuments : gameDocuments;
  useEffect(() => {
    if (workbench !== "video" && (workbench !== "game" || activeGame === undefined)) return;
    const missing = creativeDocuments.filter(({ path }) => {
      const current = buffersRef.current[path];
      const file = workspace?.files.find((item) => item.path === path);
      return !activityPaths.has(path) && (current === undefined || current.source === "agent" || (current.version !== file?.version && current.content === current.saved));
    });
    if (missing.length === 0) return;
    const controller = new AbortController();
    void Promise.all(missing.map(async ({ path }) => {
      try {
        const file = await json<FilePayload>(await fetch(endpoint("file", sessionId, path), { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setBuffers((current) => {
          const existing = current[path];
          if (existing?.source === "human" && existing.content !== existing.saved) return current;
          if (latestActivityPaths.current.has(path)) return current;
          return { ...current, [path]: { content: file.content, saved: file.content, source: "disk", version: file.version } };
        });
        setGameReadErrors((current) => { const next = { ...current }; delete next[path]; return next; });
      } catch (reason) {
        if (!controller.signal.aborted) setGameReadErrors((current) => ({ ...current, [path]: reason instanceof Error ? reason.message : String(reason) }));
      }
    }));
    return () => { controller.abort(); };
  }, [activeGame?.id, activeVideo?.id, activityPaths, creativeDocuments, gameLoadAttempt, sessionId, setBuffers, workbench, workspace?.files]);
  const productionSection = useStore((memory) => memory.productionSection);
  const setProductionSection = actions.setProductionSection;
  const productionSelectedIds = useStore((memory) => memory.productionSelectedIds);
  const productionJobsByEpisode = useStore((memory) => memory.productionJobs);
  const productionSelectionsByEpisode = useStore((memory) => memory.productionSelections);
  const productionReferencesByEpisode = useStore((memory) => memory.productionReferences);
  const productionSequenceByEpisode = useStore((memory) => memory.productionSequence);
  const productionCanvasByEpisode = useStore((memory) => memory.productionCanvas);
  const productionViewportByEpisode = useStore((memory) => memory.productionViewport);
  const productionIntentCalls = useStore((memory) => memory.productionIntentCalls);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const followWorkbenchTabFocus = useRef(false);
  useLayoutEffect(() => {
    if (!followWorkbenchTabFocus.current) return;
    followWorkbenchTabFocus.current = false;
    // Drama moves the same navigation into its workspace toolbar. Keep keyboard
    // focus on the newly mounted selected tab, not its detached predecessor.
    const tabs = surfaceRef.current?.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="创作工作台"] [role="tab"][aria-selected="true"]');
    Array.from(tabs ?? []).find((tab) => tab.getClientRects().length > 0)?.focus();
  }, [workbench]);
  const setWorkbenchPreference = actions.setWorkbenchPreference;
  const applyWorkbenchPreference = useCallback((preference: WorkbenchPreference): void => {
    setWorkbenchPreference(preference);
    // Opening the workbench before any creative work exists is a one-off visit: remembering it
    // would decide the layout of the creator's first real project in this workspace. A choice
    // the workspace already remembers stays the creator's to change.
    const storage = workbenchPreferenceStorage();
    if (creativeProject || readWorkbenchPreference(storage, workspace?.cwd) !== undefined) {
      writeWorkbenchPreference(storage, workspace?.cwd, preference);
    }
  }, [creativeProject, setWorkbenchPreference, workspace?.cwd]);
  const compactTabsId = useId();
  const compactStudioId = `${compactTabsId}-studio-panel`;
  const compactVideoStudioId = `${compactTabsId}-video-studio-panel`;
  const compactChatId = `${compactTabsId}-chat-panel`;
  const navRef = useRef<HTMLElement>(null);
  const activityBases = useRef(new Map<string, { readonly path: string; readonly base: string }>());
  const previousSignals = useRef<ReadonlySet<string>>(new Set());
  // The consumed signal lives in the Store so it survives a remount: DSH 0.1.7 reloads a Session's
  // Chat after a switch, and replaying its history must not look like a fresh Agent write.
  const consumedSettledMutation = useStore((memory) => memory.settledMutation);
  // A reloaded Session shows its history as closed Turns; only a Turn seen open is live work.
  const liveTurns = useRef(new Set<number>());
  if (liveTurn !== undefined) liveTurns.current.add(liveTurn);
  const saveLocks = useRef(new Set<string>());
  const buffer = selected === undefined ? undefined : buffers[selected];
  const selectedFile = workspace?.files.find((file) => file.path === selected);
  const selectedMedia = selectedFile?.kind === "media";
  const dirty = buffer?.source === "human" && buffer.content !== buffer.saved;
  const saving = buffer?.saving === true;
  const fileError = buffer?.error;
  const conflict = buffer?.conflict;
  const selectedLower = selected?.toLocaleLowerCase();
  const markdown = selectedLower?.endsWith(".md") === true;
  const jsonl = selectedLower?.endsWith(".jsonl") === true;
  const structured = jsonl || selectedLower?.endsWith(".json") === true;
  const previewable = markdown || jsonl;
  const dramaEpisodes = useMemo(() => [...new Set((workspace?.files ?? [])
    .filter((file) => isCreatorDocumentPath(file.path))
    .flatMap((file) => { const directory = episodeDirectoryForPath(file.path); return directory === undefined ? [] : [directory]; }))].sort(), [workspace?.files]);
  const selectedEpisode = episodeDirectoryForPath(selected);
  const episodeDirectory = workbench === "drama"
    ? dramaEpisode !== undefined && dramaEpisodes.includes(dramaEpisode) ? dramaEpisode : selectedEpisode ?? dramaEpisodes[0]
    : selectedEpisode;
  const productionAvailable = episodeDirectory !== undefined && (workbench === "drama" || (selected !== undefined && isCreatorDocumentPath(selected)));
  const editorModes = productionAvailable ? EDITOR_MODES : EDITOR_MODES.filter((mode) => mode !== "production");
  const episodeDocumentPaths = useMemo(
    () => episodeDirectory === undefined ? [] : creatorDocumentPaths(workspace?.files.filter((file) => file.kind === "text") ?? [], episodeDirectory),
    [episodeDirectory, workspace?.files]
  );
  const [episodeLoadAttempt, setEpisodeLoadAttempt] = useState(0);
  const [episodeLoadFailure, setEpisodeLoadFailure] = useState<{ readonly episode: string; readonly message: string }>();
  const episodeDocuments = useMemo(() => Object.fromEntries(episodeDocumentPaths.flatMap((path) => {
    const current = buffers[path];
    return current === undefined || current.missing === true ? [] : [[path, current.content] as const];
  })), [buffers, episodeDocumentPaths]);
  const episodeProduction = useMemo(
    () => episodeDirectory === undefined ? undefined : parseEpisodeProduction(episodeDocuments, episodeDirectory),
    [episodeDirectory, episodeDocuments]
  );
  const productionLibrary = useMemo(() => (workspace?.files ?? []).flatMap((file): ProductionMediaVersion[] => {
    if (file.kind !== "media" || file.mimeType?.startsWith("audio/") === true) return [];
    if (!file.path.startsWith("剧集/") && !file.path.startsWith("交付/")) return [];
    const targetId = file.path.toLocaleUpperCase().match(/(?:SHOT|IMG|MOTION|VISUAL)-[A-Z0-9-]+/u)?.[0] ?? file.path.split("/").at(-2) ?? "PROJECT-MEDIA";
    return [{
      id: `workspace:${file.path}:${file.version}`,
      targetId,
      kind: file.mimeType?.startsWith("image/") === true ? "image" : "video",
      url: endpoint("media", sessionId, file.path),
      path: file.path
    }];
  }), [sessionId, workspace?.files]);
  const productionVersions = useMemo(() => {
    if (episodeProduction === undefined) return [];
    const episodeName = episodeProduction.episodeDirectory.split("/").at(-1) ?? "";
    const knownTargets = [
      ...episodeProduction.shots.map((shot) => shot.id),
      ...episodeProduction.assets.map((asset) => asset.id),
      ...episodeProduction.visualAssets.map((asset) => asset.id),
      ...episodeProduction.motions.map((motion) => motion.id)
    ].sort((left, right) => right.length - left.length);
    const motionTargets = new Map(episodeProduction.motions.flatMap((motion) => motion.shotId === undefined ? [] : [[motion.id, motion.shotId] as const]));
    const fromWorkspace = productionLibrary.flatMap((version) => {
      if (version.path === undefined || (!version.path.startsWith(`${episodeProduction.episodeDirectory}/`) && !version.path.startsWith(`交付/${episodeName}/`))) return [];
      const matched = mediaTargetFromPath(version.path, knownTargets);
      // Drama Skills 0.7 renders the assembled cut into 制作成果/成片/; earlier native
      // compositions wrote 成片-<job>.mp4 beside the per-shot results.
      const composition = /(?:^|\/)成片-[^/]+\.mp4$/iu.test(version.path)
        || /(?:^|\/)制作成果\/成片\//u.test(version.path);
      if (matched === undefined && !composition) return [];
      const targetId = matched === undefined ? episodeProduction.episodeDirectory : motionTargets.get(matched) ?? matched;
      return [{ ...version, targetId }];
    });
    const byId = new Map<string, ProductionMediaVersion>();
    for (const version of fromWorkspace) byId.set(version.id, version);
    return [...byId.values()];
  }, [episodeProduction, productionLibrary]);
  const productionSelectedId = episodeDirectory === undefined ? undefined : productionSelectedIds[episodeDirectory];
  const productionJobs = episodeDirectory === undefined ? [] : productionJobsByEpisode[episodeDirectory] ?? [];
  const productionSelections = episodeDirectory === undefined ? {} : productionSelectionsByEpisode[episodeDirectory] ?? {};
  const productionReferences = episodeDirectory === undefined ? {} : productionReferencesByEpisode[episodeDirectory] ?? {};
  const productionSequence = episodeDirectory === undefined ? [] : productionSequenceByEpisode[episodeDirectory] ?? [];
  const productionCanvas = episodeDirectory === undefined ? {} : productionCanvasByEpisode[episodeDirectory] ?? {};
  const productionViewport = episodeDirectory === undefined ? undefined : productionViewportByEpisode[episodeDirectory];
  const setProductionSelectedId = useCallback((selectedId: string | undefined) => {
    if (episodeDirectory !== undefined) actions.setProductionSelectedIds((current) => ({ ...current, [episodeDirectory]: selectedId }));
  }, [actions, episodeDirectory]);
  const setProductionJobs = useCallback((jobs: ProductionJob[]) => {
    if (episodeDirectory !== undefined) actions.setProductionJobs((current) => ({ ...current, [episodeDirectory]: jobs }));
  }, [actions, episodeDirectory]);
  const setProductionSelections = useCallback((selections: Record<string, string>) => {
    if (episodeDirectory !== undefined) actions.setProductionSelections((current) => ({ ...current, [episodeDirectory]: selections }));
  }, [actions, episodeDirectory]);
  const setProductionReferences = useCallback((references: Record<string, string[]>) => {
    if (episodeDirectory !== undefined) actions.setProductionReferences((current) => ({ ...current, [episodeDirectory]: references }));
  }, [actions, episodeDirectory]);
  const setProductionSequence = useCallback((sequence: ProductionSequenceItem[]) => {
    if (episodeDirectory !== undefined) actions.setProductionSequence((current) => ({ ...current, [episodeDirectory]: sequence }));
  }, [actions, episodeDirectory]);
  const setProductionCanvas = useCallback((canvas: Record<string, CanvasPoint>) => {
    if (episodeDirectory !== undefined) actions.setProductionCanvas((current) => ({ ...current, [episodeDirectory]: canvas }));
  }, [actions, episodeDirectory]);
  const setProductionViewport = useCallback((viewport: CanvasViewport) => {
    if (episodeDirectory !== undefined) actions.setProductionViewport((current) => ({ ...current, [episodeDirectory]: viewport }));
  }, [actions, episodeDirectory]);
  const editorMode = useStore((memory) => memory.editorMode);
  const setEditorMode = actions.setEditorMode;
  const modeSelection = useRef(selected);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorPositions = useRef(new Map<string, { readonly scrollTop: number; readonly selectionStart: number; readonly selectionEnd: number }>());
  const editorReady = buffer !== undefined && buffer.missing !== true;
  const workspaceKind = workbench === "game" || workbench === "video" ? undefined : workbench;
  // A Session starts on 小说; once per workspace, move to the workbench that actually holds work.
  const initialWorkbenchFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (workspace === undefined || initialWorkbenchFor.current === workspace.cwd) return;
    initialWorkbenchFor.current = workspace.cwd;
    const next = initialWorkbenchMode(workbench, workspace.files, workspace.games, workspace.videos);
    if (next !== workbench) setWorkbench(next);
  }, [setWorkbench, workbench, workspace]);
  const gameBuilding = activeGame !== undefined && normalizedActivities.some(({ path }) => path.startsWith(`${activeGame.root}/build/`));
  const videoBuilding = activeVideo !== undefined && normalizedActivities.some(({ path }) => path.startsWith(`${activeVideo.root}/`));

  useEffect(() => { buffersRef.current = buffers; }, [buffers]);

  const rememberEditorPosition = useCallback((): void => {
    const element = textareaRef.current;
    if (element === null || selected === undefined || element.getAttribute("aria-label") !== selected) return;
    editorPositions.current.set(selected, {
      scrollTop: element.scrollTop,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd
    });
  }, [selected]);

  useLayoutEffect(() => {
    if (editorMode !== "source" || selected === undefined || !editorReady) return;
    const element = textareaRef.current;
    const position = editorPositions.current.get(selected);
    if (element === null || position === undefined) return;
    const end = Math.min(position.selectionEnd, element.value.length);
    element.setSelectionRange(Math.min(position.selectionStart, end), end);
    element.scrollTop = position.scrollTop;
  }, [editorMode, editorReady, selected]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => {
      if (!Object.values(buffersRef.current).some((value) => value.source === "human" && value.content !== value.saved)) return;
      event.preventDefault();
    };
    globalThis.addEventListener("beforeunload", warn);
    return () => { globalThis.removeEventListener("beforeunload", warn); };
  }, []);

  const expandPath = useCallback((path: string): void => {
    const segments = path.split("/");
    const ancestors = [groupForPath(path)];
    for (let index = 1; index < segments.length - 1; index += 1) ancestors.push(segments.slice(0, index + 1).join("/"));
    setExpanded((current) => {
      const next = { ...current };
      for (const ancestor of ancestors) next[ancestor] = true;
      return next;
    });
  }, []);

  const revealPath = useCallback((path: string): void => {
    rememberEditorPosition();
    const nextWorkbench = workbenchModeForPath(path) ?? "story";
    setWorkbench(nextWorkbench);
    if (nextWorkbench === "game") {
      const project = workspace?.games.find((item) => path.startsWith(`${item.root}/`));
      if (project !== undefined) setGameProjectId(project.id);
      if (!path.includes("/build/app/")) setGameTab("design");
    }
    if (nextWorkbench === "video") {
      modeSelection.current = path;
      setEditorMode("preview");
      const project = workspace?.videos.find((item) => path.startsWith(`${item.root}/`));
      if (project !== undefined) setVideoProjectId(project.id);
      if (!/\.(?:mp4|mov|webm|mkv)$/iu.test(path)) setVideoTab("docs");
    }
    setSelected(path);
    expandPath(path);
  }, [expandPath, rememberEditorPosition, setEditorMode, setGameProjectId, setVideoProjectId, setVideoTab, workspace?.games, workspace?.videos]);

  useEffect(() => {
    if (workspace === undefined) return;
    const pending = productionIntents.filter(({ callId }) => productionIntentCalls[callId] !== true);
    if (pending.length === 0) return;
    for (const { intent } of pending) {
      if (intent.action === "open_section" || intent.action === "focus_target") {
        const documentPath = ["分镜.md", "图片提示词.md", "视觉设定.md", "剧本.md", "视频提示词.md"]
          .map((name) => `${intent.episode}/${name}`)
          .find((path) => workspace.files.some((file) => file.path === path));
        if (documentPath !== undefined) {
          setWorkbench("drama");
          actions.setDramaEpisode(intent.episode);
          actions.setDramaPane("canvas");
          setSelected(documentPath);
          expandPath(documentPath);
          globalThis.setTimeout(() => { setEditorMode("production"); }, 0);
        }
      }
      if (intent.action === "open_section") setProductionSection(intent.section ?? "shots");
      else if (intent.action === "focus_target") {
        actions.setProductionSelectedIds((current) => ({ ...current, [intent.episode]: intent.targetId }));
        setProductionSection(intent.section ?? (intent.targetId?.startsWith("SHOT-") === true ? "shots" : "assets"));
      } else if (intent.action === "set_sequence") {
        actions.setProductionSequence((current) => ({
          ...current,
          [intent.episode]: (intent.shotIds ?? []).map((shotId) => ({ shotId }))
        }));
      } else if (intent.action === "track_job" && intent.jobId !== undefined && intent.targetId !== undefined && intent.jobKind !== undefined) {
        const { jobId, targetId, jobKind } = intent;
        actions.setProductionJobs((current) => {
          const jobs = current[intent.episode] ?? [];
          if (jobs.some((job) => job.id === jobId)) {
            return {
              ...current,
              [intent.episode]: jobs.map((job) => job.id === jobId ? {
                ...job,
                targetId,
                kind: jobKind,
                status: "running",
                progress: Math.max(10, job.progress),
                prompt: intent.prompt ?? job.prompt,
                expectedOutputs: intent.expectedOutputs ?? job.expectedOutputs,
                error: undefined
              } : job)
            };
          }
          return {
            ...current,
            [intent.episode]: [...jobs, {
              ...createPendingJob({
                id: jobId,
                targetId,
                kind: jobKind,
                prompt: intent.prompt ?? "",
                expectedOutputs: intent.expectedOutputs
              }),
              status: "running",
              progress: 10
            }]
          };
        });
      }
    }
    actions.setProductionIntentCalls((current) => ({
      ...current,
      ...Object.fromEntries(pending.map(({ callId }) => [callId, true]))
    }));
  }, [actions, expandPath, productionIntentCalls, productionIntents, setEditorMode, setProductionSection, setSelected, setWorkbench, workspace]);

  // Latch first entry into the game workbench: before that the Studio must not mount, or every
  // session downloads and runs a game in a display:none iframe. Once mounted it
  // stays mounted so the running game survives later navigation.
  const openedGame = useRef(false);
  if (workbench === "game") openedGame.current = true;
  const gameStudioMounted = openedGame.current;
  const openedVideo = useRef(false);
  if (workbench === "video") openedVideo.current = true;
  const videoStudioMounted = openedVideo.current;

  const followAgentPath = useCallback((path: string): void => {
    expandPath(path);
    const current = selected === undefined ? undefined : buffersRef.current[selected];
    const preserveFocusedDraft = path !== selected
      && current?.source === "human"
      && current.content !== current.saved
      && surfaceRef.current?.ownerDocument.activeElement === textareaRef.current;
    if (preserveFocusedDraft) return;
    // The editor textarea is not mounted in the Game Studio, so the draft guard above can never
    // fire there. Never preempt a running game: agent writes may expand the tree, not navigate.
    if ((workbench === "game" && (gameTab !== "design" || (current?.source === "human" && current.content !== current.saved))) || (workbench === "video" && (videoTab !== "docs" || (current?.source === "human" && current.content !== current.saved)))) return;
    revealPath(path);
  }, [expandPath, gameTab, revealPath, selected, videoTab, workbench]);

  useEffect(() => {
    if (activityPath !== undefined && activityPath === selected && !selectedMedia) setEditorMode("source");
  }, [activityPath, selected, selectedMedia]);

  useEffect(() => {
    if (modeSelection.current === selected) return;
    modeSelection.current = selected;
    setEditorMode(selected !== undefined && activityPaths.has(selected) ? "source" : selectedMedia || previewable ? "preview" : "source");
  }, [activityPaths, previewable, selected, selectedMedia]);

  useEffect(() => {
    if (workspaceLoading) return;
    if (activityPath !== undefined) return;
    if (selected !== undefined && (
      (workspace?.files.some((file) => file.path === selected) ?? false)
      || buffers[selected] !== undefined
    ) && workbenchModeForPath(selected) === workbench) return;
    setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, workbench));
  }, [activityPath, buffers, selected, workbench, workspace, workspaceLoading]);

  useEffect(() => {
    if (workspace === undefined || workspaceLoading) return;
    const paths = new Set(workspace.files.map((file) => file.path));
    setBuffers((current) => {
      let changed = false;
      const next = { ...current };
      for (const [path, value] of Object.entries(current)) {
        if (paths.has(path) || activityPaths.has(path)) continue;
        // A write that just settled is on disk before the workspace reload lists it; keep its
        // preview (and so the selection) until then. A denied write never settles and is pruned.
        if (value.source === "agent" && sessionRunning && path === settledPath) continue;
        if (value.source === "human" && value.content !== value.saved) {
          if (value.missing !== true) {
            next[path] = { ...value, missing: true, error: "文件已从 workspace 移除。本地草稿仍保留，可复制后放弃草稿。" };
            changed = true;
          }
        } else {
          delete next[path];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [activityPaths, sessionRunning, settledPath, workspace, workspaceLoading]);

  useEffect(() => {
    if (selected === undefined || selectedMedia || activityPaths.has(selected)) return;
    if (!(workspace?.files.some((file) => file.path === selected) ?? false)) return;
    const controller = new AbortController();
    setBuffers((current) => {
      const existing = current[selected];
      return existing === undefined ? current : { ...current, [selected]: { ...existing, error: undefined } };
    });
    void fetch(endpoint("file", sessionId, selected), { signal: controller.signal })
      .then((response) => json<FilePayload>(response))
      .then((file) => {
        setBuffers((current) => {
          const existing = current[file.path];
          if (existing?.source === "human" && existing.content !== existing.saved) {
            if (existing.version === file.version) return { ...current, [file.path]: { ...existing, missing: false, error: undefined } };
            return {
              ...current,
              [file.path]: {
                ...existing,
                missing: false,
                error: undefined,
                conflict: {
                  message: `${file.path} 已在磁盘上更新；你的本地草稿没有被覆盖。`,
                  theirs: file.content,
                  theirsVersion: file.version
                }
              }
            };
          }
          return {
            ...current,
            [file.path]: { content: file.content, saved: file.content, source: "disk", version: file.version }
          };
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setBuffers((current) => {
          const existing = current[selected];
          return existing === undefined ? current : {
            ...current,
            [selected]: { ...existing, error: reason instanceof Error ? reason.message : String(reason) }
          };
        });
      });
    return () => { controller.abort(); };
  }, [activityPaths, selected, selectedMedia, sessionId, workspace?.files]);

  useEffect(() => {
    if (!productionAvailable) return;
    const missing = episodeDocumentPaths.filter((path) => buffersRef.current[path] === undefined && !activityPaths.has(path));
    if (missing.length === 0) return;
    const controller = new AbortController();
    setEpisodeLoadFailure(undefined);
    void Promise.all(missing.map((path) => fetch(endpoint("file", sessionId, path), { signal: controller.signal }).then((response) => json<FilePayload>(response))))
      .then((files) => {
        setBuffers((current) => {
          const next = { ...current };
          for (const file of files) {
            const existing = next[file.path];
            if (existing?.source === "human" && existing.content !== existing.saved) continue;
            next[file.path] = { content: file.content, saved: file.content, source: "disk", version: file.version };
          }
          return next;
        });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setEpisodeLoadFailure({ episode: episodeDirectory ?? "", message: reason instanceof Error ? reason.message : String(reason) });
          setBuffers((current) => {
            const next = { ...current };
            for (const path of missing) {
              const existing = next[path];
              if (existing !== undefined) next[path] = { ...existing, error: reason instanceof Error ? reason.message : String(reason) };
            }
            return next;
          });
        }
      });
    return () => { controller.abort(); };
  }, [activityPaths, episodeDirectory, episodeDocumentPaths, episodeLoadAttempt, productionAvailable, sessionId]);

  useEffect(() => {
    if (normalizedActivities.length === 0) return;
    for (const { path } of normalizedActivities) expandPath(path);
    if (activityPath !== undefined) followAgentPath(activityPath);
    setBuffers((current) => {
      let next = current;
      for (const { activity: currentActivity, path } of normalizedActivities) {
        const existing = next[path];
        if (existing?.source === "human" && existing.content !== existing.saved) {
          next = {
            ...next,
            [path]: {
              ...existing,
              conflict: { message: `${path} 正由 Agent 修改；你的本地草稿已锁定，不会被覆盖。` }
            }
          };
          continue;
        }
        let basis = activityBases.current.get(currentActivity.callId);
        if (basis === undefined || basis.path !== path) {
          basis = { path, base: existing?.content ?? "" };
          activityBases.current.set(currentActivity.callId, basis);
        }
        const preview = previewMutation(currentActivity, basis.base);
        if (preview === undefined || (existing?.source === "agent" && existing.content === preview)) continue;
        next = {
          ...next,
          [path]: {
            content: preview,
            saved: existing?.saved ?? "",
            source: "agent",
            version: existing?.version ?? ""
          }
        };
      }
      return next;
    });
  }, [activityPath, expandPath, followAgentPath, normalizedActivities]);

  useEffect(() => {
    const signals = new Set(mutatingCallIds(runningCalls));
    for (const { activity: currentActivity } of normalizedActivities) signals.add(currentActivity.callId.split(":", 1)[0] ?? currentActivity.callId);
    const settled = [...previousSignals.current].some((callId) => !signals.has(callId));
    for (const callId of activityBases.current.keys()) {
      if (!signals.has(callId.split(":", 1)[0] ?? callId)) activityBases.current.delete(callId);
    }
    previousSignals.current = signals;
    if (!settled) return;
    reload();
  }, [normalizedActivities, reload, runningCalls]);

  useEffect(() => {
    if (settledMutation === undefined || settledMutation === consumedSettledMutation) return;
    // History replayed after a reload or a Session switch is not a fresh Agent write.
    if (settledMutationTurn === undefined || !liveTurns.current.has(settledMutationTurn)) {
      actions.setSettledMutation(settledMutation);
      return;
    }
    // The signal carries an absolute path, so creativeRelativePath cannot resolve it until the
    // workspace (and its cwd) has loaded. Consuming the signal first would burn it: the effect
    // re-runs when cwd arrives, but the guard above then short-circuits and the agent's file is
    // never selected. Wait for cwd instead of dropping the follow.
    if (workspace?.cwd === undefined) return;
    actions.setSettledMutation(settledMutation);
    const path = creativeRelativePath(settledMutation.slice(settledMutation.indexOf("\0") + 1), workspace.cwd);
    if (path !== undefined) followAgentPath(path);
    reload();
  }, [actions, consumedSettledMutation, followAgentPath, reload, settledMutation, settledMutationTurn, workspace?.cwd]);

  useEffect(() => {
    if (selected === undefined) return;
    for (const button of navRef.current?.querySelectorAll<HTMLButtonElement>("button[data-file-path]") ?? []) {
      if (button.dataset.filePath === selected) {
        button.scrollIntoView({ block: "nearest" });
        break;
      }
    }
  }, [selected]);

  useEffect(() => {
    if (!open || normalizedActivities.length > 0 || workspace === undefined) return;
    const sessionSurface = surfaceRef.current?.parentElement;
    if (sessionSurface === undefined || sessionSurface === null) return;
    const knownPaths = new Set(workspace.files.map((file) => file.path));
    const followOfficialFileLink = (event: MouseEvent): void => {
      const origin = event.target;
      if (!(origin instanceof Element)) return;
      const control = origin.closest<HTMLElement>("button, a");
      if (control === null || control.closest(".oh-story-split-surface") !== null) return;
      const candidates = [control.title, control.getAttribute("aria-label"), control.textContent];
      for (const candidate of candidates) {
        const path = creativeRelativePath(candidate?.trim().replace(/^(?:Open|打开)\s+/u, ""), workspace.cwd);
        if (path === undefined || !knownPaths.has(path)) continue;
        event.preventDefault();
        event.stopPropagation();
        revealPath(path);
        if (workbenchModeForPath(path) === "drama") { actions.setDramaPane("documents"); actions.setDramaFilesOpen(true); actions.setDramaEpisode(episodeDirectoryForPath(path)); }
        break;
      }
    };
    sessionSurface.addEventListener("click", followOfficialFileLink, true);
    return () => { sessionSurface.removeEventListener("click", followOfficialFileLink, true); };
  }, [actions, normalizedActivities.length, open, revealPath, workspace]);

  useEffect(() => {
    if (workbench !== "game" && workbench !== "video") return;
    const surface = surfaceRef.current;
    const sessionSurface = surface?.parentElement;
    const chat = Array.from(sessionSurface?.children ?? []).find((child) => child !== surface && child instanceof HTMLElement);
    if (!(chat instanceof HTMLElement)) return;
    const previous = {
      id: chat.id,
      role: chat.getAttribute("role"),
      labelledBy: chat.getAttribute("aria-labelledby")
    };
    chat.id = compactChatId;
    chat.setAttribute("role", "tabpanel");
    chat.setAttribute("aria-labelledby", `${compactTabsId}-chat-tab`);
    return () => {
      chat.id = previous.id;
      if (previous.role === null) chat.removeAttribute("role");
      else chat.setAttribute("role", previous.role);
      if (previous.labelledBy === null) chat.removeAttribute("aria-labelledby");
      else chat.setAttribute("aria-labelledby", previous.labelledBy);
    };
  }, [compactChatId, compactTabsId, workbench]);

  const savePath = useCallback(async (path: string) => {
    if (saveLocks.current.has(path)) return;
    const submitted = buffersRef.current[path];
    if (submitted === undefined || submitted.missing === true || submitted.content === submitted.saved) return;
    saveLocks.current.add(path);
    setBuffers((current) => {
      const existing = current[path];
      return existing === undefined ? current : { ...current, [path]: { ...existing, saving: true, error: undefined } };
    });
    try {
      const file = await json<FilePayload>(await fetch(endpoint("file", sessionId, path), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: submitted.content, baseVersion: submitted.version })
      }));
      setBuffers((current) => {
        const latest = current[path];
        if (latest === undefined) return current;
        const unchanged = latest.content === submitted.content;
        return {
          ...current,
          [path]: {
            content: unchanged ? file.content : latest.content,
            saved: file.content,
            source: unchanged ? "disk" : "human",
            version: file.version,
            saving: false
          }
        };
      });
      reload();
    } catch (reason) {
      if (reason instanceof WorkspaceRequestError && reason.status === 412) {
        try {
          const theirs = await json<FilePayload>(await fetch(endpoint("file", sessionId, path)));
          setBuffers((current) => {
            const latest = current[path];
            if (latest === undefined) return current;
            return {
              ...current,
              [path]: {
                ...latest,
                saving: false,
                conflict: {
                  message: `${path} 已在磁盘上更新；请选择保留哪一版。`,
                  theirs: theirs.content,
                  theirsVersion: theirs.version
                }
              }
            };
          });
        } catch (refreshError) {
          setBuffers((current) => {
            const existing = current[path];
            return existing === undefined ? current : {
              ...current,
              [path]: { ...existing, saving: false, error: refreshError instanceof Error ? refreshError.message : String(refreshError) }
            };
          });
        }
      } else {
        setBuffers((current) => {
          const existing = current[path];
          return existing === undefined ? current : {
            ...current,
            [path]: { ...existing, saving: false, error: reason instanceof Error ? reason.message : String(reason) }
          };
        });
      }
    } finally {
      saveLocks.current.delete(path);
    }
  }, [reload, sessionId]);

  useEffect(() => {
    if (!open) return;
    const saveShortcut = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== "s") return;
      if ((workbench === "video" && videoTab !== "docs") || (workbench === "game" && (gameTab !== "design" || activeGame?.id === undefined))) return;
      if (workbench === "video" && (!(event.target instanceof Element) || event.target.closest(".oh-video-documents") === null)) return;
      if (workbench === "game" && (!(event.target instanceof Element) || event.target.closest(".oh-game-documents") === null)) return;
      event.preventDefault();
      if (selected !== undefined) void savePath(selected);
    };
    globalThis.addEventListener("keydown", saveShortcut);
    return () => { globalThis.removeEventListener("keydown", saveShortcut); };
  }, [activeGame?.id, gameTab, open, savePath, selected, videoTab, workbench]);

  const groups = useMemo(() => {
    const value = new Map<string, WorkspaceFile[]>();
    const all = [...(workspace?.files ?? [])].filter((file) => workbenchModeForPath(file.path) === workbench);
    if (activityPath !== undefined && !all.some((file) => file.path === activityPath)) all.push({ path: activityPath, bytes: 0, version: "", kind: "text" });
    all.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));
    for (const file of all) {
      const directory = groupForPath(file.path);
      const files = value.get(directory) ?? [];
      files.push(file);
      value.set(directory, files);
    }
    const order = GROUP_ORDER[workbench];
    return [...value.entries()].sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex)
        || left.localeCompare(right, "zh-Hans-CN");
    });
  }, [activityPath, workbench, workspace]);

  const selectWorkbench = (next: WorkbenchMode): void => {
    const focused = surfaceRef.current?.ownerDocument.activeElement;
    followWorkbenchTabFocus.current = focused?.closest('[role="tablist"][aria-label="创作工作台"]') !== null && focused?.closest('[role="tablist"][aria-label="创作工作台"]') !== undefined;
    setWorkbench(next);
    if (next === "game" || next === "video") {
      if (next === "game") setGameTab("preview");
      else setVideoTab("preview");
      setSelected(undefined);
      return;
    }
    const target = workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, next);
    if (target === undefined) setSelected(undefined);
    else revealPath(target);
  };
  const selectEditorMode = (next: WorkbenchMemory["editorMode"]): void => {
    if (next === "preview") rememberEditorPosition();
    if (workbench === "drama") actions.setDramaPane(next === "production" ? "canvas" : "documents");
    setEditorMode(next);
  };
  const selectDramaPane = (pane: WorkbenchMemory["dramaPane"]): void => {
    if (pane === "canvas") {
      rememberEditorPosition();
      actions.setDramaPane("canvas");
      setProductionSection("canvas");
    } else {
      actions.setDramaPane("documents");
      actions.setDramaFilesOpen(true);
    }
  };
  const navigateProductionTarget = (target: DramaDocumentTarget): void => {
    actions.setDramaPane("documents");
    actions.setDramaFilesOpen(true);
    const content = buffersRef.current[target.path]?.content ?? "";
    const before = content.slice(0, target.offset);
    const approximateScrollTop = Math.max(0, before.split(/\r?\n/u).length * 28 - 96);
    editorPositions.current.set(target.path, { scrollTop: approximateScrollTop, selectionStart: target.offset, selectionEnd: target.offset });
    modeSelection.current = target.path;
    revealPath(target.path);
    setEditorMode("source");
  };
  const openDramaDocument = (path: string): void => {
    if (workbenchModeForPath(path) === "drama") {
      actions.setDramaPane("documents");
      actions.setDramaEpisode(episodeDirectoryForPath(path) ?? episodeDirectory);
    }
    revealPath(path);
  };
  const focusContextInChat = (prompt?: string): void => {
    globalThis.setTimeout(() => {
      const applied = focusProductionChat(prompt);
      if (prompt !== undefined) { setManualChatContext(applied ? undefined : prompt); setContextCopyStatus(undefined); }
    }, 0);
  };
  const continueDramaInChat = (targetId?: string): void => {
    actions.setDramaChatOpen(true);
    const title = targetId === undefined || episodeProduction === undefined ? undefined
      : productionCanvasNodes(episodeProduction, episodeDocuments).find((node) => node.id === targetId)?.title;
    const prompt = title === undefined
      ? episodeDirectory === undefined ? "我想先讨论这部短剧的第一集，从故事和角色开始。" : undefined
      : `我想继续调整 ${episodeDirectory?.split("/").at(-1) ?? "本集"} 的「${title}」。请先和我讨论思路，不生成任何素材。`;
    focusContextInChat(prompt);
  };
  const continueGameInChat = (prompt: string): void => {
    actions.setGameChatOpen(true);
    setGamePane("chat");
    focusContextInChat(prompt);
  };
  const continueVideoInChat = (prompt: string): void => {
    actions.setVideoChatOpen(true);
    setVideoPane("chat");
    focusContextInChat(prompt);
  };
  // The Chat button is wide-layout only; 制作/对话 owns the pane below 720px.
  const setVideoChatVisible = (visible: boolean): void => {
    actions.setVideoChatOpen(visible);
    if (!visible) setVideoPane("studio");
  };
  const setGameChatVisible = (visible: boolean): void => {
    actions.setGameChatOpen(visible);
    if (!visible) setGamePane("studio");
  };
  const refreshGame = (): void => { setGameLoadAttempt((current) => current + 1); reload(); };
  const gameEditor: GameDocumentEditor = {
    selected, buffers, mode: editorMode, textareaRef, errors: gameReadErrors,
    onSelect: revealPath, onMode: setEditorMode, onSave: savePath, onConflict: resolveGameConflict,
    onEdit: (path, content) => { setBuffers((current) => {
      const existing = current[path];
      return existing === undefined ? current : { ...current, [path]: { ...existing, content, source: "human" } };
    }); },
    onDiscard: (path) => { setBuffers((current) => { const next = { ...current }; delete next[path]; return next; }); setSelected(undefined); },
    onRememberPosition: rememberEditorPosition, onRetry: refreshGame
  };
  const dispatchDramaPrompt = async (prompt: string): Promise<void> => {
    actions.setDramaChatOpen(true);
    await sendProductionPrompt(prompt);
  };
  const episodeDocumentsPending = episodeDocumentPaths.some((path) => buffers[path] === undefined && !activityPaths.has(path));
  const dramaProductionView = episodeProduction === undefined ? undefined : episodeDocumentsPending
    ? episodeLoadFailure !== undefined && episodeLoadFailure.episode === episodeDirectory
      ? <div className="oh-story-empty" role="alert">暂时无法读取本集文稿：{episodeLoadFailure.message}<button type="button" onClick={() => { setEpisodeLoadAttempt((current) => current + 1); }}>重新读取</button></div>
      : <div className="oh-story-empty" role="status">正在整理本集画布…</div>
    : <DramaProductionView
    sessionId={sessionId}
    production={episodeProduction}
    documents={episodeDocuments}
    sessionRunning={sessionRunning}
    queue={productionQueue}
    section={productionSection}
    selectedId={productionSelectedId}
    jobs={productionJobs}
    versions={productionVersions}
    libraryVersions={productionLibrary}
    selections={productionSelections}
    manualReferences={productionReferences}
    sequence={productionSequence}
    canvas={productionCanvas}
    viewport={productionViewport}
    onSectionChange={setProductionSection}
    onSelect={setProductionSelectedId}
    onNavigate={navigateProductionTarget}
    onJobsChange={setProductionJobs}
    onSelectionsChange={setProductionSelections}
    onManualReferencesChange={setProductionReferences}
    onOpenMedia={openDramaDocument}
    onSequenceChange={setProductionSequence}
    onCanvasChange={setProductionCanvas}
    onViewportChange={setProductionViewport}
    onContinueInChat={continueDramaInChat}
    onDispatchPrompt={dispatchDramaPrompt}
    onCancelTurn={cancelProduction}
    onRemoveQueued={removeQueuedProduction}
    onRefresh={reload}
  />;
  const selectedLabel = selected ?? `在当前 DSH workspace 中选择${workbenchLabel(workbench)}文件`;
  const selectedBasename = selected?.split("/").at(-1) ?? selectedLabel;
  const selectedGroup = selected === undefined ? undefined : groupForPath(selected);
  const toggleGroup = (key: string, open: boolean): void => {
    setExpanded((current) => ({ ...current, [key]: open }));
  };
  function resolveGameConflict(keepLocal: boolean): void { resolveConflict(keepLocal); }
  const resolveConflict = (keepLocal: boolean): void => {
    if (selected === undefined || conflict?.theirs === undefined || conflict.theirsVersion === undefined) return;
    const theirs = conflict.theirs;
    const theirsVersion = conflict.theirsVersion;
    setBuffers((current) => {
      const existing = current[selected];
      if (existing === undefined) return current;
      return {
        ...current,
        [selected]: keepLocal
          ? { ...existing, saved: theirs, version: theirsVersion, source: "human", conflict: undefined }
          : { content: theirs, saved: theirs, source: "disk", version: theirsVersion }
      };
    });
  };

  if (!open) {
    // Without creative work there is nothing to reveal, so the plugin leaves the
    // official conversation exactly as DSH renders it. A failed workspace request
    // still offers the way in, because that error is only readable inside the workbench.
    if (!creativeProject && error === undefined) return welcome ? <WelcomeGuide /> : null;
    return <div ref={surfaceRef} className="oh-story-split-surface" data-open="false">
      <style>{[styles, gameCanvasStyles, videoStudioStyles].join("\n")}</style>
      <button className="oh-story-launcher" type="button" title={error ?? "打开创作工作台"} aria-label="打开创作工作台" onClick={() => { applyWorkbenchPreference("open"); }}>
        <span aria-hidden>✦</span><b>创作工作台</b>
      </button>
    </div>;
  }

  return <div ref={surfaceRef} className="oh-story-split-surface" data-open="true" data-workbench={workbench} data-drama-pane={dramaPane} data-drama-files={dramaFilesOpen ? "open" : "closed"} data-drama-chat={dramaChatOpen ? "open" : "closed"}>
    <style>{[styles, gameCanvasStyles, videoStudioStyles].join("\n")}</style>
    {manualChatContext !== undefined && <aside className="oh-story-context-fallback" aria-live="polite" aria-label="带到 Chat 的讨论内容">
      <header><strong>讨论内容已保留</strong><button type="button" aria-label="关闭讨论内容" onClick={() => { setManualChatContext(undefined); }}>×</button></header>
      <p>讨论内容未自动填入 Chat，已有输入保持原样。你可以在这里查看或复制选中内容。</p>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(manualChatContext).then(() => { setContextCopyStatus("已复制，可贴入 Chat 继续讨论。"); }).catch(() => { setContextCopyStatus("复制暂不可用，可展开选中内容手动复制。"); }); }}>复制讨论内容</button>
      {contextCopyStatus !== undefined && <p role="status">{contextCopyStatus}</p>}
      <details><summary>查看选中内容</summary><pre>{manualChatContext}</pre></details>
    </aside>}
    {(workbench === "game" || workbench === "video") && <div className="oh-game-mobile-switcher" role="tablist" aria-label={workbench === "game" ? "窄屏游戏工作台" : "窄屏视频工作台"}>
      {(["studio", "chat"] as const).map((pane) => <button
        type="button"
        role="tab"
        key={pane}
        id={`${compactTabsId}-${pane}-tab`}
        aria-controls={pane === "chat" ? compactChatId : workbench === "game" ? compactStudioId : compactVideoStudioId}
        aria-selected={(workbench === "game" ? gamePane : videoPane) === pane}
        tabIndex={(workbench === "game" ? gamePane : videoPane) === pane ? 0 : -1}
        onKeyDown={(event) => { handleTabKey(event, ["studio", "chat"] as const, workbench === "game" ? gamePane : videoPane, (pane) => { if (workbench === "game") { setGamePane(pane); if (pane === "chat") actions.setGameChatOpen(true); } else { setVideoPane(pane); if (pane === "chat") actions.setVideoChatOpen(true); } }); }}
        onClick={() => { if (workbench === "game") { setGamePane(pane); if (pane === "chat") actions.setGameChatOpen(true); } else { setVideoPane(pane); if (pane === "chat") actions.setVideoChatOpen(true); } }}
      >{pane === "studio" ? "制作" : "对话"}</button>)}
    </div>}
    {workbench === "game" && workspace === undefined && <main id={compactStudioId} className="oh-game-studio" role="tabpanel" aria-labelledby={`${compactTabsId}-studio-tab`}><div className="oh-game-design-empty">{error ?? "正在连接游戏工作台…"}</div></main>}
    {workspace !== undefined && gameStudioMounted && <GameStudio
          workspace={workspace}
          building={gameBuilding}
          gameTab={gameTab}
          gameProjectId={gameProjectId}
          hidden={workbench !== "game"}
          onGameTab={setGameTab}
          onGameProject={setGameProjectId}
          paneId={compactStudioId}
          labelledBy={`${compactTabsId}-studio-tab`}
          onWorkbench={selectWorkbench}
          onCollapse={() => { applyWorkbenchPreference("closed"); }}
          editor={gameEditor}
          canvasByProject={gameCanvasByProject}
          onCanvasChange={(projectId, value) => { actions.setGameCanvas((current) => ({ ...current, [projectId]: value })); }}
          chatOpen={gameChatOpen}
          onChatOpen={setGameChatVisible}
          onContinueInChat={continueGameInChat}
        />}
    {workbench === "video" && workspace === undefined && <main id={compactVideoStudioId} className="oh-video-studio" role="tabpanel" aria-labelledby={`${compactTabsId}-studio-tab`}><div className="oh-video-preview-empty">{error ?? "正在连接视频工作台…"}</div></main>}
    {workspace !== undefined && videoStudioMounted && <VideoStudio
          sessionId={sessionId}
          projects={workspace.videos}
          files={workspace.files}
          editor={gameEditor}
          chatOpen={videoChatOpen}
          onChatOpen={setVideoChatVisible}
          onContinueInChat={continueVideoInChat}
          canvasByProject={videoCanvasByProject}
          onCanvasChange={(id, value) => { actions.setVideoCanvas((current) => ({ ...current, [id]: value })); }}
          running={videoBuilding}
          projectId={videoProjectId}
          tab={videoTab}
          hidden={workbench !== "video"}
          paneId={compactVideoStudioId}
          labelledBy={`${compactTabsId}-studio-tab`}
          onProject={setVideoProjectId}
          onTab={setVideoTab}
          onWorkbench={selectWorkbench}
          onCollapse={() => { applyWorkbenchPreference("closed"); }}
        />}
    {workbench !== "game" && workbench !== "video" && <>
    {workbench === "drama" && <header className="oh-drama-workspace-toolbar">
      <div className="oh-drama-workspace-brand"><WorkbenchModeTabs className="oh-story-mode-tabs" current={workbench} onSelect={selectWorkbench} /></div>
      <label className="oh-drama-episode-picker"><span>剧集</span><select aria-label="选择短剧剧集" value={episodeDirectory ?? ""} onChange={(event) => { actions.setDramaEpisode(event.target.value); actions.setDramaPane("canvas"); setProductionSection("canvas"); }}>{dramaEpisodes.length === 0 ? <option value="">还没有剧集</option> : dramaEpisodes.map((directory) => <option value={directory} key={directory}>{directory.split("/").at(-1)}</option>)}</select></label>
      <div className="oh-drama-workspace-views" role="tablist" aria-label="短剧工作区">{(["canvas", "documents"] as const).map((pane) => <button type="button" role="tab" key={pane} aria-selected={dramaPane === pane} tabIndex={dramaPane === pane ? 0 : -1} onKeyDown={(event) => { handleTabKey(event, ["canvas", "documents"] as const, dramaPane, selectDramaPane); }} onClick={() => { selectDramaPane(pane); }}>{pane === "canvas" ? "制作" : "文稿"}</button>)}</div>
      <div className="oh-drama-workspace-actions"><button type="button" aria-label={dramaFilesOpen ? "收起项目文稿" : "展开项目文稿"} aria-expanded={dramaFilesOpen} onClick={() => { actions.setDramaFilesOpen(!dramaFilesOpen); }}>文稿目录</button><button type="button" aria-label={dramaChatOpen ? "收起原生 Chat" : "展开原生 Chat"} aria-expanded={dramaChatOpen} onClick={() => { actions.setDramaChatOpen(!dramaChatOpen); }}>Chat</button><button type="button" aria-label="刷新项目文件" onClick={reload}>↻</button><button type="button" aria-label="收起创作工作台" onClick={() => { applyWorkbenchPreference("closed"); }}>×</button></div>
    </header>}
    <aside className="oh-story-tree" aria-hidden={workbench === "drama" && !dramaFilesOpen || undefined}>
      <div className="oh-story-brand" hidden={workbench === "drama"}>
        <span className="oh-story-brand-cluster"><strong>✦ <span>Oh Story</span></strong>{workspaceKind !== undefined && <span className="oh-story-kind">{workspaceKind === "story" ? "小说" : "短剧"}</span>}</span>
        <span className="oh-story-brand-actions">
          <button type="button" onClick={reload} title="刷新" aria-label="刷新项目文件">↻</button>
          <button type="button" onClick={() => { applyWorkbenchPreference("closed"); }} title="收起创作工作台" aria-label="收起创作工作台">×</button>
        </span>
      </div>
      {workspace !== undefined && workbench !== "drama" && <WorkbenchModeTabs className="oh-story-mode-tabs" current={workbench} onSelect={selectWorkbench} />}
      {error !== undefined && <div className="oh-story-error">{error}</div>}
      {workspace?.metadataErrors.map((message) => <div className="oh-story-warning" key={message}>{message}</div>)}
      <nav ref={navRef} aria-label={workbench === "story" ? "小说项目文件" : "短剧项目文件"}>
        {groups.map(([directory, files]) => {
          const groupOpen = selectedGroup === directory || expanded[directory] === true;
          return <details className="oh-story-file-group" key={directory} open={groupOpen} onToggle={(event) => { toggleGroup(directory, event.currentTarget.open); }}>
            <summary>{directory}<span>{files.length}</span></summary>
            <FileTreeNodes
              nodes={buildFileTree(files, directory)}
              depth={1}
              expanded={expanded}
              selected={selected}
              activityPath={activityPath}
              onToggle={toggleGroup}
              onSelect={openDramaDocument}
            />
          </details>;
        })}
      </nav>
    </aside>
    <main className="oh-story-editor" data-drama-canvas={dramaCanvasActive || undefined}>
      <header hidden={dramaCanvasActive}>
        <span className="oh-story-editor-path" title={selected}><span>{selectedLabel}</span><strong>{selectedBasename}</strong></span>
        <div className="oh-story-editor-actions">
          {(previewable || productionAvailable) && !selectedMedia && <div className="oh-story-editor-tabs" role="tablist" aria-label={productionAvailable ? "短剧文档查看方式" : markdown ? "Markdown 查看方式" : "JSONL 查看方式"}>
            {editorModes.map((mode) => <button
              type="button"
              role="tab"
              key={mode}
              tabIndex={editorMode === mode ? 0 : -1}
              aria-selected={editorMode === mode}
              onKeyDown={(event) => { handleTabKey(event, editorModes, editorMode, selectEditorMode); }}
              onClick={() => { selectEditorMode(mode); }}
            >{mode === "preview" ? "预览" : mode === "source" ? "源码" : "生产"}</button>)}
          </div>}
          {(dirty || saving) && selected !== undefined && <button className="oh-story-save" type="button" disabled={saving || buffer?.missing === true} onClick={() => { void savePath(selected); }}>
            {saving ? "保存中…" : "保存"}
          </button>}
        </div>
      </header>
      {activity !== undefined && activityPath !== undefined && activityPath === selected && <div className="oh-story-stream" data-stage={activity.stage} role="status" aria-live="polite">● {activity.stage === "running" ? "Agent 正在应用修改" : "Agent 正在生成文件内容"}</div>}
      {conflict !== undefined && <div className="oh-story-conflict" role="alert">
        <span>{conflict.message}</span>
        {conflict.theirs !== undefined && conflict.theirsVersion !== undefined && selected !== undefined && <div>
          <button type="button" onClick={() => { resolveConflict(false); }}>载入磁盘版本</button>
          <button type="button" onClick={() => { resolveConflict(true); }}>保留本地草稿</button>
        </div>}
      </div>}
      {fileError !== undefined && <div className="oh-story-error">{fileError}</div>}
      {dramaCanvasActive
        ? dramaProductionView ?? <div className="oh-drama-empty-workspace"><strong>从第一集开始，让故事慢慢生长</strong><p>说说你想讲的故事，或把已有剧本交给 AI。人物、场景和镜头会在这里展开。</p><button type="button" onClick={() => { continueDramaInChat(); }}>和 AI 讨论第一集</button></div>
        : selected === undefined
        ? <div className="oh-story-empty">{workbench === "story"
            ? <>当前 workspace 还没有小说文件。可在右侧 Chat 中运行 <code>/story-setup</code>。</>
            : <>当前 workspace 还没有短剧项目。可在右侧 Chat 中运行 <code>/short-drama</code>。</>}</div>
        : selectedMedia && selectedFile !== undefined
          ? <div className="oh-story-media-document">{selectedFile.mimeType?.startsWith("image/") === true
              ? <img src={endpoint("media", sessionId, selectedFile.path)} alt={selectedFile.path} />
              : selectedFile.mimeType?.startsWith("audio/") === true
                ? <audio src={endpoint("media", sessionId, selectedFile.path)} controls />
                : <video src={endpoint("media", sessionId, selectedFile.path)} controls preload="metadata" />}</div>
        : buffer === undefined
          ? <div className="oh-story-empty">正在加载 {selected}…</div>
        : buffer.missing === true
          ? <div className="oh-story-empty">文件已从 workspace 移除，本地草稿仍保留。请先复制需要的内容，再放弃草稿。<button type="button" onClick={() => {
            setBuffers((current) => {
              const next = { ...current };
              delete next[selected];
              return next;
            });
            setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, workbench));
          }}>放弃本地草稿</button></div>
        : editorMode === "production" && productionAvailable && episodeProduction !== undefined
          ? dramaProductionView
        : previewable && editorMode === "preview"
          ? markdown
            ? <MarkdownPreview content={buffer.content} label={selected} />
            : <JsonlPreview content={buffer.content} label={selected} />
          : <textarea
            ref={textareaRef}
            value={buffer.content}
            data-format={structured ? "structured" : "prose"}
            onBlur={rememberEditorPosition}
            onScroll={rememberEditorPosition}
            onSelect={rememberEditorPosition}
            onChange={(event) => {
              const content = event.target.value;
              setBuffers((current) => ({
                ...current,
                [selected]: {
                  content,
                  saved: current[selected]?.saved ?? "",
                  source: "human",
                  version: current[selected]?.version ?? "",
                  conflict: current[selected]?.conflict,
                  saving: current[selected]?.saving
                }
              }));
            }}
            spellCheck={!structured}
            aria-label={selected}
          />}
    </main>
    </>}
  </div>;
}

interface ProductionConversationFace {
  readonly sendProductionPrompt: (prompt: string) => Promise<void>;
  readonly focusProductionChat: (context?: string) => boolean;
  readonly cancelProduction: () => Promise<void>;
  readonly removeQueuedProduction: (itemId: string) => Promise<void>;
}

type WorkbenchSlotProps = PropsRuntime<"oh-story.workspace"> & PropsStore<ReturnType<typeof createWorkbenchStore>> & ProductionConversationFace;

/**
 * DSH 0.1.7's SessionProvider stopped keying its subtree by Session, so switching Sessions
 * would carry one Session's selection, drafts and dedup guards into the next. Keep the
 * one-mount-per-Session contract the workbench was written against.
 */
function CreativeSplitBridge(props: WorkbenchSlotProps) {
  return <SessionWorkbenchMemory key={props.sessionId} {...props} />;
}

/** Restore this Session's workbench memory into a fresh Store before anything reads it. */
function SessionWorkbenchMemory(props: WorkbenchSlotProps) {
  const { sessionId, useStore, actions } = props;
  const hydrated = useStore((state) => state.hydrated);
  // Nothing renders from a fresh instance: its initial state would be mirrored over the saved
  // copy, and the workbench's own effects would act on an empty selection.
  useLayoutEffect(() => {
    if (!hydrated) actions.restore(workbenchMemoryBySession.get(sessionId));
  }, [actions, hydrated, sessionId]);
  return hydrated ? <>
    <WorkbenchMemoryMirror sessionId={sessionId} useStore={useStore} />
    <SessionWorkbenchBridge {...props} />
  </> : null;
}

/** Keeps the page-lifetime copy current without re-rendering the workbench on every edit. */
function WorkbenchMemoryMirror({ sessionId, useStore }: Pick<WorkbenchSlotProps, "sessionId" | "useStore">) {
  const memory = useStore((state) => state);
  useEffect(() => {
    workbenchMemoryBySession.set(sessionId, memory);
  }, [memory, sessionId]);
  return null;
}

/** Mount beside the official conversation without replacing Chat or Composer. */
function SessionWorkbenchBridge({ sessionId, useSession, useSessions, useProjection, useChat, useStore, actions, sendProductionPrompt, focusProductionChat, cancelProduction, removeQueuedProduction }: WorkbenchSlotProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement>();
  const runningCalls = useChat((snapshot) => snapshot.legacy.runningCalls);
  const partial = useChat((snapshot) => streamingAssistant(snapshot.timeline));
  const undispatched = useChat((snapshot) => undispatchedCalls(snapshot), sameUndispatchedCalls);
  const settledMutation = useChat((snapshot) => latestSettledMutation(snapshot));
  const settledMutationTurn = useChat((snapshot) => latestSettledMutationTurn(snapshot));
  const liveTurn = useChat((snapshot) => openTurn(snapshot));
  const workbench = useStore((memory) => memory.workbench);
  const gamePane = useStore((memory) => memory.gamePane);
  const gameChatOpen = useStore((memory) => memory.gameChatOpen);
  const videoChatOpen = useStore((memory) => memory.videoChatOpen);
  const videoPane = useStore((memory) => memory.videoPane);
  const dramaChatOpen = useStore((memory) => memory.dramaChatOpen);
  const dramaFilesOpen = useStore((memory) => memory.dramaFilesOpen);
  const sessionRunning = useSession((snapshot) => snapshot.running);
  const inboxRows = useProjection("inbox", (inbox) => inbox?.["next-turn"]);
  const pendingSubmissions = useSession((snapshot) => snapshot.pendingSubmissions);
  const productionQueue = useMemo(() => productionQueueFromInbox(
    inboxRows,
    new Set(pendingSubmissions.filter((item) => item.placement === "transcript").map((item) => item.requestId))
  ), [inboxRows, pendingSubmissions]);
  const chat = useChat((snapshot) => snapshot);
  const productionIntents = useMemo(() => settledProductionIntents(chat), [chat]);
  const { workspace, error, loading: workspaceLoading, reload } = useWorkspace(sessionId, sessionRunning);
  const chosenPreference = useStore((memory) => memory.workbenchPreference);
  const creativeProject = hasCreativeProject(workspace);
  // DSH 0.1.7 opens a fresh home straight into a blank Session in its default workspace, so
  // "no Session yet" no longer marks a first launch. A blank Session without creative work does.
  const sessionBlank = useSessions((state) => state.byId[sessionId]?.blank === true);
  const welcome = sessionBlank && workspace !== undefined && !workspaceLoading && !creativeProject;
  // The Session Store holds this Session's choice; localStorage carries the workspace's
  // last choice across restarts. Reading it here keeps the decision in the same render
  // that learns the workspace, so a collapsed workbench never flashes the layout open.
  const storedPreference = useMemo(
    () => readWorkbenchPreference(workbenchPreferenceStorage(), workspace?.cwd),
    [workspace?.cwd]
  );
  const preference = chosenPreference ?? storedPreference;
  const open = resolveWorkbenchOpen(preference, creativeProject);
  useLayoutEffect(() => {
    const document = marker.current?.ownerDocument;
    if (document === undefined) return;
    const locate = (): void => {
      // DSH 0.1.7 renders the same conversation content inside the right sidebar's subagent
      // chats, so only this Session's main column is a valid seat.
      const anchor = document.querySelector<HTMLElement>(
        `[data-conversation-content][data-conversation-session="${CSS.escape(sessionId)}"]:not([data-sidebar-chat] *) > [data-conversation-scroll] > [data-slot='conversation.session']`
      );
      setTarget((current) => current === anchor ? current : anchor ?? undefined);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); };
  }, [sessionId]);
  useLayoutEffect(() => {
    const scroller = target?.parentElement;
    if (scroller === undefined || scroller === null) return;
    if (!open) {
      // A collapsed workbench returns the conversation to DSH untouched, so the only
      // measurement left is where that column sits: the launcher floats over its corner.
      const publishSeam = (): void => {
        const box = scroller.getBoundingClientRect();
        scroller.style.setProperty("--oh-story-seam-top", `${String(box.top)}px`);
        scroller.style.setProperty("--oh-story-seam-right", `${String(scroller.ownerDocument.documentElement.clientWidth - box.right)}px`);
      };
      publishSeam();
      const seams = new ResizeObserver(publishSeam);
      seams.observe(scroller);
      const view = scroller.ownerDocument.defaultView;
      view?.addEventListener("resize", publishSeam);
      return () => {
        seams.disconnect();
        view?.removeEventListener("resize", publishSeam);
        scroller.style.removeProperty("--oh-story-seam-top");
        scroller.style.removeProperty("--oh-story-seam-right");
      };
    }
    const composerSeat = (): HTMLElement | null => scroller.querySelector(":scope > [data-composer-seat]");
    // The seat overlaps the Chat column here, so a reader parked at the tail has
    // to be carried across every layout pass; losing the tail does not merely
    // scroll it out of sight, it leaves the last lines behind the Composer.
    // Being parked cannot be read inside the pass — a reflow moves the tail
    // before the observer runs — and it cannot be read from scroll events alone
    // either: the Chat settles over several frames after a resize and every one
    // of those frames scrolls without the reader asking. So only a scroll the
    // reader actually drove releases the tail; reaching the bottom always
    // reclaims it.
    const parkedAtTail = (): boolean => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 8;
    let parked = parkedAtTail();
    let drivenAt = 0;
    const markDriven = (event: Event): void => {
      if (event.target instanceof Node && composerSeat()?.contains(event.target) === true) return;
      // A button click (for example switching the editor preview) is not a
      // scrollbar drag. Its subsequent reflow must not release the Chat tail.
      if (event.type === "pointerdown" && event.target !== scroller) return;
      drivenAt = performance.now();
    };
    const trackParked = (): void => {
      if (parkedAtTail()) parked = true;
      else if (performance.now() - drivenAt < 400) parked = false;
    };
    const publishLayout = (): void => {
      scroller.style.setProperty("--oh-story-scroll-height", `${String(scroller.clientHeight)}px`);
      // DSH 0.1.2 grows the seat with the streaming Todo panel while
      // --dsh-composer-height keeps reporting the bare input height. Publish the
      // measurement beside it rather than over it: the CSS takes the larger, so
      // writing the variable DSH also owns can never turn into a resize duel.
      scroller.style.setProperty("--oh-story-composer-height", `${String(composerSeat()?.getBoundingClientRect().height ?? 0)}px`);
      scroller.dataset.ohStoryWorkbench = workbench;
      scroller.dataset.ohGameChat = gameChatOpen ? "open" : "closed";
      scroller.dataset.ohVideoChat = videoChatOpen ? "open" : "closed";
      scroller.dataset.ohDramaChat = dramaChatOpen ? "open" : "closed";
      scroller.dataset.ohDramaFiles = dramaFilesOpen ? "open" : "closed";
      const studioPane = workbench === "video" ? videoPane : gamePane;
      scroller.dataset.ohStudioPane = studioPane;
      const compactAt = workbench === "game" || workbench === "video" ? 720 : 620;
      const mediumAt = workbench === "game" || workbench === "video" ? 960 : 900;
      const layout = scroller.clientWidth < compactAt ? "compact" : scroller.clientWidth < mediumAt ? "medium" : "wide";
      if (scroller.dataset.ohStoryLayout !== layout) scroller.dataset.ohStoryLayout = layout;
      if (parked) scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
    };
    const observer = new ResizeObserver(publishLayout);
    const observed = new WeakSet<Element>();
    // The official seat and Chat flow mount and remount independently of this
    // bridge. The flow is observed because a resized Chat keeps re-wrapping for
    // several frames afterwards: pinning once against the height the first frame
    // reports leaves the reader behind the Composer again once it settles.
    let flowObserved = false;
    const observePanes = (): void => {
      const flow = scroller.querySelector("[data-chat-flow]:not([data-step-process-content])");
      flowObserved = flow !== null;
      for (const pane of [composerSeat(), flow]) {
        if (pane === null || observed.has(pane)) continue;
        observed.add(pane);
        observer.observe(pane);
      }
    };
    publishLayout();
    scroller.addEventListener("scroll", trackParked, { passive: true });
    for (const driven of ["wheel", "touchmove", "pointerdown", "keydown"]) {
      scroller.addEventListener(driven, markDriven, { passive: true });
    }
    observer.observe(scroller);
    observePanes();
    const seats = new MutationObserver(() => { observePanes(); publishLayout(); });
    seats.observe(scroller, { childList: true });
    // The flow mounts below the seat's level, and streaming mutates it token by
    // token: watch the subtree only until it has been found once.
    const panes = new MutationObserver(() => { if (!flowObserved) observePanes(); });
    panes.observe(scroller, { childList: true, subtree: true });
    return () => {
      panes.disconnect();
      scroller.removeEventListener("scroll", trackParked);
      for (const driven of ["wheel", "touchmove", "pointerdown", "keydown"]) {
        scroller.removeEventListener(driven, markDriven);
      }
      observer.disconnect();
      seats.disconnect();
      scroller.style.removeProperty("--oh-story-scroll-height");
      scroller.style.removeProperty("--oh-story-composer-height");
      delete scroller.dataset.ohStoryLayout;
      delete scroller.dataset.ohStoryWorkbench;
      delete scroller.dataset.ohStudioPane;
      delete scroller.dataset.ohGameChat;
      delete scroller.dataset.ohVideoChat;
      delete scroller.dataset.ohDramaChat;
      delete scroller.dataset.ohDramaFiles;
    };
  }, [dramaChatOpen, dramaFilesOpen, gameChatOpen, gamePane, open, target, videoChatOpen, videoPane, workbench]);
  return <>
    <span ref={marker} className="oh-story-bridge-marker" aria-hidden />
    {target === undefined ? null : createPortal(<CreativeWorkbench
      sessionId={sessionId}
      runningCalls={runningCalls}
      partial={partial}
      undispatched={sessionRunning ? undispatched : NO_UNDISPATCHED_CALLS}
      settledMutation={settledMutation}
      settledMutationTurn={settledMutationTurn}
      liveTurn={liveTurn}
      sessionRunning={sessionRunning}
      productionQueue={productionQueue}
      productionIntents={productionIntents}
      workspace={workspace}
      error={error}
      workspaceLoading={workspaceLoading}
      reload={reload}
      open={open}
      creativeProject={creativeProject}
      welcome={welcome}
      sendProductionPrompt={sendProductionPrompt}
      focusProductionChat={focusProductionChat}
      cancelProduction={cancelProduction}
      removeQueuedProduction={removeQueuedProduction}
      useStore={useStore}
      actions={actions}
    />, target)}
  </>;
}

type WorkbenchSeatProps = PropsRuntime<"shell.overlay"> & PropsRenderSlots<"oh-story.workspace">;

/** How to reach the workbench from a DSH that has no creative work open yet. */
function WelcomeGuide() {
  return <section className="oh-story-welcome" aria-label="Oh Story 使用引导">
    <style>{[styles, gameCanvasStyles, videoStudioStyles].join("\n")}</style>
    <h2>Oh Story 已加载</h2>
    <p>直接在下方输入框说你想写什么，比如「写一篇 8000 字的重生复仇短篇」，或输入 <code>/story</code>、<code>/short-drama</code>、<code>/novel-to-game quick</code>、<code>/video-recap</code>。写出第一个创作文件后，小说、短剧、游戏、视频工作台会自动出现。</p>
    <ol>
      <li>不选文件夹也能开始：作品会写进 DSH 自动建立的「默认工作区 / Default workspace」。</li>
      <li>想放进自己的作品文件夹：点击左侧「工作区 / Workspaces」旁的「添加工作区 / Add workspace」，在系统弹出的文件夹窗口里选择，再在下方「选择工作区 / Choose workspace」中选中它。</li>
      <li>输入框右下角显示模型名就说明已配置好；没有模型时，在「设置 → 模型」填入 API Key。只查看已有作品无需 API Key。</li>
    </ol>
  </section>;
}

/** Without any Session the session-scoped workbench cannot mount, so the guide mounts on its own. */
function WorkbenchWelcome() {
  const marker = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement>();
  useLayoutEffect(() => {
    const document = marker.current?.ownerDocument;
    if (document === undefined) return;
    const locate = (): void => {
      const anchor = document.querySelector<HTMLElement>("[data-conversation-content]:not([data-sidebar-chat] *) > [data-conversation-scroll]");
      setTarget((current) => current === anchor ? current : anchor ?? undefined);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); };
  }, []);
  return <>
    <span ref={marker} className="oh-story-bridge-marker" aria-hidden />
    {target === undefined ? null : createPortal(<WelcomeGuide />, target)}
  </>;
}

function WorkbenchSeat({ SessionProvider, renderSlot }: WorkbenchSeatProps) {
  return <SessionProvider empty={() => <WorkbenchWelcome />}>{renderSlot("oh-story.workspace", {})}</SessionProvider>;
}

function argsOf(block: ToolCallViewProps["block"]): Record<string, unknown> {
  const raw = ("kind" in block ? block.call?.argsRaw : block.phase === "start" ? block.argsRaw : undefined) ?? "{}";
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

function resultOf(block: ToolCallViewProps["block"]): string | undefined {
  if (!("kind" in block)) return undefined;
  return block.content.map((item) => item.type === "text" ? item.text : JSON.stringify(item, null, 2)).join("\n");
}

function RoleToolView({ block, inspect }: ToolCallViewProps) {
  const args = argsOf(block);
  const role = typeof args.role === "string" ? args.role : "story-role";
  const output = resultOf(block);
  const state = !("kind" in block) ? "running" : block.isError ? "error" : "done";
  return <details className="oh-story-role" data-state={state}>
    <style>{[styles, gameCanvasStyles, videoStudioStyles].join("\n")}</style>
    <summary><span>✦ Role</span><strong>{role}</strong><em>{state === "running" ? "运行中" : state === "error" ? "失败" : "完成"}</em></summary>
    {output !== undefined && <pre>{output}</pre>}
    {inspect !== undefined && <button type="button" onClick={inspect}>在轨迹中检查</button>}
  </details>;
}

function ProductionToolView({ block, inspect }: ToolCallViewProps) {
  const args = argsOf(block);
  const action = typeof args.action === "string" ? args.action : "production";
  const episode = typeof args.episode === "string" ? args.episode : "短剧";
  const state = !("kind" in block) ? "running" : block.isError ? "error" : "done";
  return <details className="oh-story-role" data-state={state}>
    <style>{[styles, gameCanvasStyles, videoStudioStyles].join("\n")}</style>
    <summary><span>▦ 生产</span><strong>{episode} · {action}</strong><em>{state === "running" ? "执行中" : state === "error" ? "失败" : "已应用"}</em></summary>
    {resultOf(block) !== undefined && <pre>{resultOf(block)}</pre>}
    {inspect !== undefined && <button type="button" onClick={inspect}>在轨迹中检查</button>}
  </details>;
}

/** Register only official DSH surfaces; the split bridge never replaces Chat. */
export function apply(context: ClientContext): void {
  context.slots.inject("shell.overlay", () => {
    const disposeSeat = context.slots.register({
      name: "shell.overlay",
      id: "oh-story-workspace",
      order: -100,
      children: { "oh-story.workspace": { kind: "single", scope: "session" } }
    }, WorkbenchSeat);
    const disposeWorkbench = context.slots.register({
      name: "oh-story.workspace",
      store: createWorkbenchStore,
      inject: (sessionId) => {
        const binding = (context.sessions as unknown as ISessions).binding(sessionId);
        const conversation = binding?.ctx.get("conversation");
        if (binding === undefined || conversation === undefined) {
          return {
            sendProductionPrompt: () => Promise.reject(new Error("DSH 会话当前不可用。")),
            focusProductionChat: () => false,
            cancelProduction: () => Promise.reject(new Error("DSH 会话当前不可用。")),
            removeQueuedProduction: () => Promise.reject(new Error("DSH 会话当前不可用。"))
          };
        }
        return {
          sendProductionPrompt: (prompt: string) => conversation.send(prompt),
          focusProductionChat: (prompt?: string) => {
            return focusChatContext(conversation.input, binding, prompt);
          },
          cancelProduction: () => conversation.cancel(),
          removeQueuedProduction: (itemId: string) => conversation.updateQueue(itemId as Parameters<IConversation["updateQueue"]>[0], { kind: "remove" })
        };
      }
    }, CreativeSplitBridge);
    return [disposeSeat, disposeWorkbench];
  });
  context.slots.inject("tool.call.toolview", () => context.slots.register({
    name: "tool.call.toolview",
    key: "oh_story_role"
  }, RoleToolView));
  context.slots.inject("tool.call.toolview", () => context.slots.register({
    name: "tool.call.toolview",
    key: OH_STORY_PRODUCTION_TOOL_NAME
  }, ProductionToolView));
}

export default { name, inject, apply };
