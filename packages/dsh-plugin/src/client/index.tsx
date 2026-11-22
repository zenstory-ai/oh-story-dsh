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
import { Component, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  creativeRelativePath,
  fileActivityLabel,
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
  productionKnownTargets,
  resolveMediaTargetIds,
  targetDisplayName,
  type DramaDocumentTarget,
  type DramaProductionSection
} from "./drama-production.js";
import { DramaProductionView } from "./drama-production-view.js";
import type { CanvasViewport } from "./canvas-viewport.js";
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
  resolveWelcomeGuideEnabled,
  resolveWorkbenchOpen,
  workbenchPreferenceStorage,
  writeWorkbenchPreference,
  type WorkbenchPreference
} from "./workbench-presence.js";
import {
  OhStoryPluginConfig,
  WelcomeGuide,
  WelcomeGuideController,
  type WelcomeConfigForm
} from "./welcome-guide.js";
import { GameCanvas } from "./game-canvas.js";
import { gameCreativeDocuments } from "./game-canvas-model.js";
import { GameDocuments, type GameDocumentEditor } from "./game-documents.js";
import { EMPTY_GAME_CANVAS, type GameCanvasState, type GameProject, type GameWorkspaceTab } from "./game-workspace-types.js";
import { videoCreativeDocuments } from "./video-workspace-model.js";
import { clearRuntimeError, formatRuntimeErrorPrompt, gamePreviewStatus, normalizeRuntimeError, previewUrls } from "./game-preview-state.js";
import { focusChatContext } from "./chat-context.js";
import { WorkbenchModeTabs } from "./workbench-mode-tabs.js";
import { createWorkbenchModesStore, resolveVisibleWorkbench } from "./workbench-settings.js";
import { WorkbenchSettingsButton, WorkbenchSettingsPanel } from "./workbench-settings-panel.js";
import { endpoint, handleTabKey, ohStoryEndpointUrl } from "./workbench-ui.js";

const workbenchModesStore = createWorkbenchModesStore(workbenchPreferenceStorage());
const WORKBENCH_STYLESHEET_ID = "oh-story-workbench-css";

/**
 * Ensure the shared external workbench stylesheet is linked once in `<head>`.
 * DSH's `webserver/index-inject` injects `#oh-story-workbench-css` on initial HTML load;
 * this fallback handles dynamic plugin reloads or non-injected hosts without bundling CSS into JS.
 */
function ensureWorkbenchStylesheet(doc: Document | null | undefined): void {
  if (doc?.head == null || typeof doc.getElementById !== "function" || typeof doc.createElement !== "function") return;
  if (doc.getElementById(WORKBENCH_STYLESHEET_ID) !== null) return;
  const link = doc.createElement("link");
  link.id = WORKBENCH_STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = ohStoryEndpointUrl("workbench.css");
  doc.head.appendChild(link);
}

function useWorkbenchStylesheet(doc?: Document | null): void {
  useLayoutEffect(() => {
    ensureWorkbenchStylesheet(doc ?? (typeof globalThis.document === "object" ? globalThis.document : undefined));
  }, [doc]);
}

function OnceWorkbenchStylesheet() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    ensureWorkbenchStylesheet(ref.current?.ownerDocument ?? (typeof globalThis.document === "object" ? globalThis.document : undefined));
  }, []);
  return <span ref={ref} className="oh-story-bridge-marker" aria-hidden />;
}

interface SessionHeroWelcomeEntry {
  readonly suppress: boolean;
  readonly workspaceWelcomeGuide?: boolean | undefined;
}

const sessionHeroWelcomeState = new Map<string, SessionHeroWelcomeEntry>();
const heroWelcomeListeners = new Set<() => void>();
let heroWelcomeSnapshot: { readonly suppress: boolean; readonly workspaceWelcomeGuide?: boolean | undefined } = { suppress: false };

function publishHeroWelcomeSnapshot(): void {
  let suppress = false;
  let workspaceWelcomeGuide: boolean | undefined;
  for (const entry of sessionHeroWelcomeState.values()) {
    if (entry.suppress) suppress = true;
    if (entry.workspaceWelcomeGuide !== undefined) workspaceWelcomeGuide = entry.workspaceWelcomeGuide;
  }
  if (heroWelcomeSnapshot.suppress === suppress && heroWelcomeSnapshot.workspaceWelcomeGuide === workspaceWelcomeGuide) return;
  heroWelcomeSnapshot = { suppress, workspaceWelcomeGuide };
  for (const listener of heroWelcomeListeners) listener();
}

function subscribeHeroWelcome(listener: () => void): () => void {
  heroWelcomeListeners.add(listener);
  return () => { heroWelcomeListeners.delete(listener); };
}

function getHeroWelcomeSnapshot(): { readonly suppress: boolean; readonly workspaceWelcomeGuide?: boolean | undefined } {
  return heroWelcomeSnapshot;
}

function countCreativeWords(text: string): number {
  const cjk = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/gu)?.length ?? 0;
  const latin = text.replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/gu, " ").match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu)?.length ?? 0;
  return cjk + latin;
}

function normalizeRelativeWorkspacePath(baseFilePath: string | undefined, rawSrc: string): string | undefined {
  const cleaned = rawSrc.trim().split(/[?#]/u, 1)[0]?.replaceAll("\\", "/") ?? "";
  if (cleaned === "" || cleaned.startsWith("/") || /^[a-z][a-z0-9+.-]*:/iu.test(cleaned)) return undefined;
  const baseSegments = baseFilePath === undefined ? [] : baseFilePath.split("/").slice(0, -1);
  const combined = [...baseSegments, ...cleaned.split("/")];
  const resolved: string[] = [];
  for (const segment of combined) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return undefined;
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return resolved.length === 0 ? undefined : resolved.join("/");
}

class WorkbenchErrorBoundary extends Component<
  { readonly children: ReactNode; readonly label?: string; readonly onCollapse?: () => void },
  { readonly error?: Error | undefined }
> {
  override state: { readonly error?: Error | undefined } = {};
  static getDerivedStateFromError(error: Error): { readonly error: Error } { return { error }; }
  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return <div className="oh-story-error-boundary" role="alert">
      <strong>{this.props.label ?? "创作工作台"}渲染遇到问题</strong>
      <p>{this.state.error.message || "发生了意外的界面错误。"}</p>
      <div>
        <button type="button" onClick={() => { this.setState({ error: undefined }); }}>重新加载视图</button>
        {this.props.onCollapse !== undefined && <button type="button" onClick={() => { this.setState({ error: undefined }); this.props.onCollapse?.(); }}>收起工作台</button>}
      </div>
    </div>;
  }
}

export const name = "oh-story";
export const inject = ["slots", "sessions", "conversation"];

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "oh-story.workspace": { kind: "single"; scope: "session" };
    "plugins.bundle.config": { kind: "keyed"; scope: "root"; owner: { readonly view: "summary" | "page" } };
  }
}

interface ConfigFormsService {
  get(entryId: string): WelcomeConfigForm;
}

let activeWelcomeGuideController = new WelcomeGuideController();

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
  readonly truncated?: boolean | undefined;
  readonly games: readonly GameProject[];
  readonly videos: readonly VideoProject[];
  readonly metadataErrors: readonly string[];
  readonly welcomeGuide?: boolean | undefined;
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
  storyPane: "studio" | "chat";
  storyFilesOpen: boolean;
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
const MAX_SESSION_MEMORY = 32;
const workbenchMemoryBySession = new Map<string, WorkbenchMemory>();

function rememberSessionMemory(sessionId: string, memory: WorkbenchMemory): void {
  workbenchMemoryBySession.delete(sessionId);
  workbenchMemoryBySession.set(sessionId, memory);
  while (workbenchMemoryBySession.size > MAX_SESSION_MEMORY) {
    const oldest = workbenchMemoryBySession.keys().next().value;
    if (oldest === undefined) break;
    workbenchMemoryBySession.delete(oldest);
  }
}

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
      storyPane: "studio",
      storyFilesOpen: false,
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
      setStoryPane: (draft, pane: WorkbenchMemory["storyPane"]) => { draft.storyPane = pane; },
      setStoryFilesOpen: (draft, open: boolean) => { draft.storyFilesOpen = open; },
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

const STORY_AUXILIARY_GROUPS = new Set(["拆文库", "扫榜", "封面", "发布资料", "对标", "参考资料"]);

const GROUP_ORDER: Readonly<Record<WorkbenchMode, readonly string[]>> = {
  story: ["短篇", "正文", "大纲", "设定", "追踪", "拆文库", "扫榜", "封面", "发布资料", "对标", "参考资料"],
  drama: ["项目", "输入", "项目开发", "设定集", "剧集", "审查", "创作者决策", "交付"],
  game: ["game-adaptations"],
  video: ["video-recaps"]
};

const EDITOR_MODES = ["preview", "source", "production"] as const;

function groupForPath(path: string): string {
  if (path === "short-drama.json") return "项目";
  if (SHORT_STORY_FILES.has(path)) return "短篇";
  if (/^发布资料(?:-[^/]+)?\.md$/u.test(path)) return "发布资料";
  return path.split("/", 1)[0] ?? "其他";
}

function isTrackingPath(path: string | undefined): boolean {
  return path !== undefined && (path.startsWith("追踪/") || path.includes("/追踪/"));
}

async function json<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLocaleLowerCase().includes("application/json");
  if (!response.ok) {
    if (isJson) {
      const parsed = await response.json().catch(() => undefined) as { readonly error?: unknown } | undefined;
      if (typeof parsed?.error === "string" && parsed.error.trim() !== "") {
        throw new WorkspaceRequestError(response.status, parsed.error);
      }
    }
    throw new WorkspaceRequestError(response.status, `请求失败（HTTP ${String(response.status)}）`);
  }
  if (!isJson) {
    throw new WorkspaceRequestError(response.status, `响应不是有效的 JSON（${contentType || "unknown"}）`);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new WorkspaceRequestError(response.status, "无法解析服务端返回的 JSON 数据。");
  }
}

function FileTreeNodes({
  nodes,
  depth,
  expanded,
  selected,
  activityPath,
  dirtyPaths,
  missingPaths,
  onToggle,
  onSelect
}: {
  readonly nodes: readonly FileTreeNode[];
  readonly depth: number;
  readonly expanded: Readonly<Record<string, boolean>>;
  readonly selected: string | undefined;
  readonly activityPath: string | undefined;
  readonly dirtyPaths: ReadonlySet<string>;
  readonly missingPaths: ReadonlySet<string>;
  readonly onToggle: (path: string, open: boolean) => void;
  readonly onSelect: (path: string) => void;
}) {
  return <>{nodes.map((node) => {
    if (node.kind === "file") {
      const isDirty = dirtyPaths.has(node.path);
      const isMissing = missingPaths.has(node.path);
      return <button
        type="button"
        key={node.path}
        style={{ "--oh-story-indent": `${String(depth * 14)}px` } as CSSProperties}
        title={isMissing ? `${node.path}（已从工作区移除 · 本地草稿）` : isDirty ? `${node.path}（未保存）` : node.path}
        aria-label={node.path}
        data-file-path={node.path}
        data-agent-target={node.path === activityPath || undefined}
        data-dirty={isDirty || undefined}
        data-missing={isMissing || undefined}
        aria-current={node.path === selected ? "page" : undefined}
        onClick={() => { onSelect(node.path); }}
      ><span>{node.name}{isMissing ? "（已删除）" : ""}</span>{isDirty && <i className="oh-story-dirty-dot" title="尚未保存" aria-hidden />}</button>;
    }
    const open = selected?.startsWith(`${node.path}/`) === true || expanded[node.path] === true;
    return <details className="oh-story-file-folder" key={node.path} open={open} onToggle={(event) => { onToggle(node.path, event.currentTarget.open); }}>
      <summary style={{ "--oh-story-indent": `${String(depth * 14)}px` } as CSSProperties} title={node.path}>{node.name}<span>{node.fileCount}</span></summary>
      <FileTreeNodes
        nodes={node.children}
        depth={depth + 1}
        expanded={expanded}
        selected={selected}
        activityPath={activityPath}
        dirtyPaths={dirtyPaths}
        missingPaths={missingPaths}
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
  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (globalThis.document.visibilityState === "visible" && inFlight.current === undefined) {
        setVersion((value) => value + 1);
      }
    };
    globalThis.document?.addEventListener("visibilitychange", onVisibilityChange);
    return () => { globalThis.document?.removeEventListener("visibilitychange", onVisibilityChange); };
  }, []);
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

function GamePreview({ project, building, onDiscuss, onFixRuntimeError }: {
  readonly project: GameProject;
  readonly building: boolean;
  readonly onDiscuss: () => void;
  readonly onFixRuntimeError: (prompt: string) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFullscreenFocus = useRef(false);
  const [focused, setFocused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ readonly href: string; readonly result: "ok" | "failed" }>();
  const [revision, setRevision] = useState(0);
  const lastPlayable = useRef<GameProject>(project);
  if (project.previewReady) lastPlayable.current = project;
  const [acceptedVersion, setLoadedVersion] = useState<string | undefined>(project.previewReady ? project.previewVersion : undefined);
  const [acceptedPreviewUrl, setAcceptedPreviewUrl] = useState<string | undefined>(project.previewReady ? project.previewUrl : undefined);
  const loadedVersion = acceptedVersion ?? project.previewVersion;
  useEffect(() => {
    if (project.previewReady && acceptedVersion === undefined) {
      setLoadedVersion(project.previewVersion);
      setAcceptedPreviewUrl(project.previewUrl);
    }
  }, [acceptedVersion, project.previewReady, project.previewUrl, project.previewVersion]);
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
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (iframeRef.current === null || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as { readonly type?: unknown } | null | undefined;
      if (typeof data !== "object" || data === null || data.type !== "oh-story:game-preview-error") return;
      const normalized = normalizeRuntimeError(data);
      if (normalized !== null) setRuntimeError(normalized);
    };
    globalThis.addEventListener("message", onMessage);
    return () => { globalThis.removeEventListener("message", onMessage); };
  }, []);
  const playable = lastPlayable.current;
  const effectivePreviewUrl = acceptedPreviewUrl ?? playable.previewUrl;
  if (!playable.previewReady || effectivePreviewUrl === undefined) return <div className="oh-game-preview-empty">
    <span aria-hidden>◫</span>
    <strong>还没有可试玩版本</strong>
    <p>故事已经有了轮廓。可以继续完善创作设定，也可以先做一小段能玩的体验。</p>
    <button type="button" onClick={onDiscuss}>和 AI 做一段试玩</button>
    <div className="oh-game-prompt-example"><span>描述示例</span><q>把《作品名》改编成网页互动游戏，目标玩家是……，核心玩法是……，希望整体风格……</q></div>
  </div>;
  const preview = previewUrls(effectivePreviewUrl, loadedVersion, revision, globalThis.location.origin);
  const pending = project.previewReady && project.previewVersion !== loadedVersion;
  /** Accept the newer build the creator just chose. */
  const reload = (): void => {
    setLoaded(false);
    setLoadError(false);
    setRuntimeError(clearRuntimeError());
    setLoadedVersion(project.previewVersion);
    setAcceptedPreviewUrl(project.previewUrl);
    setRevision((value) => value + 1);
  };
  /** Re-run the build the creator already accepted; never silently adopt a newer one. */
  const refresh = (): void => {
    setLoaded(false);
    setLoadError(false);
    setRuntimeError(clearRuntimeError());
    if (project.previewUrl !== undefined && !pending) setAcceptedPreviewUrl(project.previewUrl);
    setRevision((value) => value + 1);
  };
  const status = gamePreviewStatus({
    frameLoaded: loaded,
    frameError: loadError,
    // A result for an earlier URL describes a build the frame no longer shows.
    probe: probe?.href === preview.probeHref ? probe.result : "pending",
    building,
    pending,
    isolated: preview.isolated,
    runtimeError
  });
  const runtimeState = status.label;
  const fullscreen = (): void => {
    const shell = shellRef.current;
    if (shell === null) return;
    restoreFullscreenFocus.current = true;
    void shell.requestFullscreen().catch(() => { restoreFullscreenFocus.current = false; });
  };
  return <div ref={shellRef} className="oh-game-preview-shell" data-state={status.tone} data-device={device} data-update={pending && !building ? "pending" : undefined} data-runtime-error={runtimeError !== null || undefined}>
    {pending && !building && <div className="oh-game-new-version" role="status"><div><strong>新的试玩版本已准备好</strong><span>可以先玩完这里，再选择载入更新。</span></div><button type="button" onClick={reload}>载入新版本</button></div>}
    {runtimeError !== null && <div className="oh-game-runtime-error" role="alert">
      <div className="oh-game-runtime-error-copy"><strong>运行期错误</strong><span title={runtimeError}>{runtimeError}</span></div>
      <div className="oh-game-runtime-error-actions">
        <button type="button" onClick={() => { onFixRuntimeError(formatRuntimeErrorPrompt(project.title, runtimeError)); }}>带报错去 Chat 修复</button>
        <button type="button" aria-label="忽略运行期错误" onClick={() => { setRuntimeError(clearRuntimeError()); }}>×</button>
      </div>
    </div>}
    <div className="oh-game-preview-status">
      <span className="oh-game-runtime-state" role="status" aria-live="polite" title={runtimeState}><i aria-hidden /><em>{runtimeState}</em></span>
      {/* In the status bar, not over the stage: a game's own corner controls stay visible. */}
      <span className="oh-game-focus-hint" data-focused={focused || undefined}>{focused ? "键鼠已激活" : "点击画面激活键鼠"}</span>
      <div>
        <button type="button" className="oh-game-device" title="桌面端预览" aria-label="桌面预览" aria-pressed={device === "desktop"} onClick={() => { setDevice("desktop"); }}><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><rect x="2" y="3" width="16" height="11" rx="1" /><path d="M10 14v3M6 17h8" /></svg></button>
        <button type="button" className="oh-game-device" title="手机端预览 (9:19.5)" aria-label="手机预览" aria-pressed={device === "phone"} onClick={() => { setDevice("phone"); }}><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><rect x="6" y="2" width="8" height="16" rx="1" /><path d="M9 15h2" /></svg></button>
        <button className="oh-game-reload" type="button" disabled={pending || building || !project.previewReady} title={pending ? "请通过载入新版本更新试玩" : "重新载入当前游戏版本"} onClick={refresh} aria-label="重新载入游戏"><span aria-hidden>↻</span><b>刷新</b></button>
        <button ref={fullscreenButtonRef} type="button" onClick={fullscreen}>全屏试玩</button>
      </div>
    </div>
    <PreviewProbe href={preview.probeHref} onResult={(href, result) => { setProbe({ href, result }); }} />
    <div className="oh-game-iframe-stage">
      <iframe
        ref={iframeRef}
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
      {status.tone === "error" && runtimeError === null && <div className="oh-game-error-overlay" role="alert">
        <strong>预览暂时无法载入</strong>
        <p>{status.label}</p>
        <div>
          <button type="button" onClick={refresh}>重试载入</button>
          <button type="button" onClick={() => { onFixRuntimeError(`《${project.title}》的网页试玩预览无法载入（${status.label}），请帮我检查构建产物并修复。`); }}>去 Chat 排查</button>
        </div>
      </div>}
    </div>
  </div>;
}

function GameStudio({ workspace, workspaceError, building, gameTab, gameProjectId, hidden, onGameTab, onGameProject, paneId, labelledBy, onWorkbench, workbenchModes, onWorkbenchSettings, onCollapse, onRefresh, fileReadError, onRetryRead, resolveImageSrc, editor, canvasByProject, onCanvasChange, chatOpen, onChatOpen, onContinueInChat }: {
  readonly workspace: WorkspacePayload;
  readonly workspaceError?: string | undefined;
  readonly building: boolean;
  readonly gameTab: GameWorkspaceTab;
  readonly gameProjectId: string | undefined;
  readonly hidden: boolean;
  readonly onGameTab: (tab: GameWorkspaceTab) => void;
  readonly onGameProject: (id: string) => void;
  readonly paneId: string;
  readonly labelledBy: string;
  readonly onWorkbench: (mode: WorkbenchMode) => void;
  readonly workbenchModes: readonly WorkbenchMode[];
  readonly onWorkbenchSettings: () => void;
  readonly onCollapse: () => void;
  readonly onRefresh: () => void;
  readonly fileReadError?: string | null | undefined;
  readonly onRetryRead?: (() => void) | undefined;
  readonly resolveImageSrc?: ((src: string) => string | undefined) | undefined;
  readonly editor: GameDocumentEditor;
  readonly canvasByProject: Readonly<Record<string, GameCanvasState>>;
  readonly onCanvasChange: (projectId: string, value: GameCanvasState) => void;
  readonly chatOpen: boolean;
  readonly onChatOpen: (open: boolean) => void;
  readonly onContinueInChat: (prompt: string) => void;
}) {
  const project = gameProjectId === "" ? undefined : workspace.games.find((item) => item.id === gameProjectId) ?? workspace.games[0];
  const knownGameIds = useRef<ReadonlySet<string>>(new Set(workspace.games.map((item) => item.id)));
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
  useEffect(() => {
    const currentIds = new Set(workspace.games.map((item) => item.id));
    if (gameProjectId === "") {
      const created = workspace.games.find((item) => !knownGameIds.current.has(item.id));
      if (created !== undefined) onGameProject(created.id);
    }
    knownGameIds.current = currentIds;
  }, [gameProjectId, onGameProject, workspace.games]);
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
      <div className="oh-workbench-cluster"><WorkbenchModeTabs className="oh-game-mode-tabs" current="game" modes={workbenchModes} onSelect={onWorkbench} /><WorkbenchSettingsButton onClick={onWorkbenchSettings} /><button className="oh-workbench-collapse" type="button" title="收起创作工作台" aria-label="收起创作工作台" onClick={onCollapse}>×</button></div>
      <label className="oh-game-project" title="切换项目将重新载入试玩"><span>游戏项目</span><select aria-label="游戏项目；切换将重新载入试玩" value={project?.id ?? ""} onChange={(event) => { onGameProject(event.target.value); }}><option value="">新建游戏想法</option>{workspace.games.length > 0 && <optgroup label="我的项目">{workspace.games.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</optgroup>}</select></label>
      <div className="oh-game-tabs" role="tablist" aria-label="游戏工作台">{tabs.map((tab) => <button key={tab} type="button" role="tab" tabIndex={gameTab === tab ? 0 : -1} aria-selected={gameTab === tab} id={`${tabsId}-${tab}-tab`} aria-controls={`${tabsId}-${tab}-panel`} onKeyDown={(event) => { handleTabKey(event, tabs, gameTab, selectTab); }} onClick={() => { selectTab(tab); }}>{tabLabels[tab]}</button>)}</div>
      <div className="oh-game-toolbar-actions"><button type="button" aria-label="刷新游戏项目" title="刷新游戏项目" onClick={onRefresh}>↻</button><button type="button" className="oh-game-chat-toggle" aria-label={chatOpen ? "收起原生 Chat" : "展开原生 Chat"} aria-expanded={chatOpen} onClick={() => { onChatOpen(!chatOpen); }}>Chat</button></div>
    </header>
    {workspaceError !== undefined && workspaceError !== "" && <div className="oh-story-error oh-game-workspace-error" role="alert"><span>{workspaceError}</span><button type="button" onClick={onRefresh}>重试</button></div>}
    {workspace.truncated === true && <div className="oh-story-warning oh-story-truncated-banner" role="status">工作区文件数已达上限，部分文件未列出；请清理临时目录或刷新。</div>}
    {project === undefined ? <div className="oh-game-create-empty"><span aria-hidden>◫</span><small>一个故事，可以有很多种玩法</small><h2>把你的故事，变成能玩的世界。</h2><p>带来一部小说、一个人物，或者一个刚冒出来的念头。<br />先聊聊你希望玩家经历什么。</p><div><button type="button" onClick={() => { onContinueInChat("我想做一段可以选择结局的故事，先聊聊玩家会经历什么。"); }}>一段可以选择的故事</button><button type="button" onClick={() => { onContinueInChat("我想围绕小说里的人物做一款轻策略游戏，先和我讨论核心玩法。"); }}>围绕人物的轻策略</button><button type="button" onClick={() => { onContinueInChat("我想把小说里的地点做成可以探索的世界，先讨论可玩的体验。"); }}>可以探索的世界</button></div><button type="button" className="oh-game-primary" onClick={() => { onContinueInChat("我有一个游戏想法，想先聊聊故事和玩家的体验。"); }}>和 AI 讨论游戏想法</button></div>
      : <div className="oh-game-panels">
        <div className="oh-game-panel oh-game-play-panel" role="tabpanel" id={`${tabsId}-preview-panel`} aria-labelledby={`${tabsId}-preview-tab`} hidden={gameTab !== "preview"}>
          <GamePreview key={project.id} project={project} building={building} onDiscuss={() => { onContinueInChat(`先把「${project.title}」做成一小段可以玩的体验，请先和我核对故事、玩法和范围。`); }} onFixRuntimeError={onContinueInChat} />
        </div>
        <div className="oh-game-panel" role="tabpanel" id={`${tabsId}-canvas-panel`} aria-labelledby={`${tabsId}-canvas-tab`} hidden={gameTab !== "canvas"}>{canvasDocumentsReady ? <GameCanvas key={project.id} project={project} files={workspace.files} documents={documents} state={canvasByProject[project.id] ?? EMPTY_GAME_CANVAS} onChange={(value) => { onCanvasChange(project.id, value); }} onOpenDocument={(path) => { editor.onSelect(path); onGameTab("design"); editor.onMode("preview"); }} onContinueInChat={(title, path) => { onContinueInChat(`我想继续讨论「${title}」。${path === undefined ? "" : `文稿：${path}`} 请先和我讨论玩家体验，不直接开始制作。`); }} onPlay={() => { onGameTab("preview"); }} /> : <div className="oh-game-design-empty oh-loading-state" role="status">正在整理创作画布…</div>}</div>
        <div className="oh-game-panel" role="tabpanel" id={`${tabsId}-design-panel`} aria-labelledby={`${tabsId}-design-tab`} hidden={gameTab !== "design"}>{!hidden && gameTab === "design" && <GameDocuments project={project} files={workspace.files} editor={editor} onChat={onContinueInChat} fileReadError={fileReadError} onRetryRead={onRetryRead} resolveImageSrc={resolveImageSrc} />}</div>
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
  workbench,
  workbenchModes,
  error,
  workspaceLoading,
  reload,
  open,
  compactLayout,
  creativeProject,
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
  readonly workbench: WorkbenchMode;
  readonly workbenchModes: readonly WorkbenchMode[];
  readonly error: string | undefined;
  readonly workspaceLoading: boolean;
  readonly reload: () => void;
  readonly open: boolean;
  readonly compactLayout: boolean;
  readonly creativeProject: boolean;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const storyPane = useStore((memory) => memory.storyPane);
  const storyFilesOpen = useStore((memory) => memory.storyFilesOpen);
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
  const [missingCopyStatus, setMissingCopyStatus] = useState<string>();
  const [savedPathNotice, setSavedPathNotice] = useState<string>();
  const savedNoticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [unlockedTracking, setUnlockedTracking] = useState<Readonly<Record<string, boolean>>>({});
  const [creativeLoadAttempt, setCreativeLoadAttempt] = useState(0);
  const [fileReadAttempts, setFileReadAttempts] = useState<Readonly<Record<string, number>>>({});
  const [fileReadErrors, setFileReadErrors] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => { setMissingCopyStatus(undefined); }, [selected]);
  useEffect(() => () => { if (savedNoticeTimer.current !== undefined) globalThis.clearTimeout(savedNoticeTimer.current); }, []);
  const retryReadFile = useCallback((path: string): void => {
    setFileReadErrors((current) => {
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
    setFileReadAttempts((current) => ({ ...current, [path]: (current[path] ?? 0) + 1 }));
  }, []);
  const activeGame = gameProjectId === "" ? undefined : workspace?.games.find((project) => project.id === gameProjectId) ?? workspace?.games[0];
  const gameDocuments = useMemo(() => activeGame === undefined ? [] : gameCreativeDocuments(activeGame, workspace?.files ?? []), [activeGame, workspace?.files]);
  const activeVideo = videoProjectId === "" ? undefined : workspace?.videos.find((project) => project.id === videoProjectId) ?? workspace?.videos[0];
  const videoDocuments = useMemo(() => activeVideo === undefined ? [] : videoCreativeDocuments(activeVideo), [activeVideo]);
  const creativeDocuments = workbench === "video" ? videoDocuments : gameDocuments;
  useEffect(() => {
    if ((workbench !== "video" || activeVideo === undefined) && (workbench !== "game" || activeGame === undefined)) return;
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
        setFileReadErrors((current) => {
          if (!(path in current)) return current;
          const next = { ...current };
          delete next[path];
          return next;
        });
      } catch (reason) {
        if (!controller.signal.aborted) setFileReadErrors((current) => ({ ...current, [path]: reason instanceof Error ? reason.message : String(reason) }));
      }
    }));
    return () => { controller.abort(); };
  }, [activeGame?.id, activeVideo?.id, activityPaths, creativeDocuments, creativeLoadAttempt, sessionId, setBuffers, workbench, workspace?.files]);
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
  const compactStoryId = `${compactTabsId}-story-panel`;
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
  const selectedDiskVersion = selectedFile?.version;
  const selectedMedia = selectedFile?.kind === "media";
  const selectedInActivity = selected !== undefined && activityPaths.has(selected);
  const selectedReadAttempt = selected === undefined ? 0 : fileReadAttempts[selected] ?? 0;
  const selectedReadError = selected === undefined ? undefined : fileReadErrors[selected];
  const trackingFile = selected !== undefined && isTrackingPath(selected);
  const trackingLocked = trackingFile && unlockedTracking[selected] !== true;
  const dirtyPaths = useMemo(
    () => new Set(Object.entries(buffers).filter(([, value]) => value.source === "human" && value.content !== value.saved).map(([path]) => path)),
    [buffers]
  );
  const missingPaths = useMemo(
    () => new Set(Object.entries(buffers).filter(([, value]) => value.missing === true).map(([path]) => path)),
    [buffers]
  );
  const resolveImageSrc = useCallback((rawSrc: string): string | undefined => {
    const trimmed = rawSrc.trim();
    if (trimmed === "") return undefined;
    if (/^https?:\/\//iu.test(trimmed)) return trimmed;
    if (trimmed.startsWith("/")) return trimmed;
    const relativeResolved = normalizeRelativeWorkspacePath(selected, trimmed);
    const rootResolved = normalizeRelativeWorkspacePath(undefined, trimmed);
    const matched = (relativeResolved === undefined ? undefined : workspace?.files.find((file) => file.path === relativeResolved))
      ?? (rootResolved === undefined ? undefined : workspace?.files.find((file) => file.path === rootResolved));
    if (matched !== undefined) return endpoint("media", sessionId, matched.path, matched.version);
    const targetPath = relativeResolved ?? rootResolved;
    return targetPath === undefined ? undefined : endpoint("media", sessionId, targetPath);
  }, [selected, sessionId, workspace?.files]);
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
    if (file.kind !== "media") return [];
    if (!file.path.startsWith("剧集/") && !file.path.startsWith("交付/")) return [];
    const kind: ProductionMediaVersion["kind"] = file.mimeType?.startsWith("image/") === true
      ? "image"
      : file.mimeType?.startsWith("audio/") === true
        ? "audio"
        : "video";
    const targetId = file.path.toLocaleUpperCase().match(/(?:SHOT|IMG|MOTION|VISUAL|GROUP|MUSIC)-[A-Z0-9-]+/u)?.[0]
      ?? file.path.split("/").at(-2)
      ?? "PROJECT-MEDIA";
    return [{
      id: `workspace:${file.path}:${file.version}`,
      targetId,
      kind,
      url: endpoint("media", sessionId, file.path, file.version),
      path: file.path
    }];
  }), [sessionId, workspace?.files]);
  const productionVersions = useMemo(() => {
    if (episodeProduction === undefined) return [];
    const episodeName = episodeProduction.episodeDirectory.split("/").at(-1) ?? "";
    const knownTargets = productionKnownTargets(episodeProduction);
    return productionLibrary.flatMap((version) => {
      if (version.path === undefined || (!version.path.startsWith(`${episodeProduction.episodeDirectory}/`) && !version.path.startsWith(`交付/${episodeName}/`))) return [];
      const matched = mediaTargetFromPath(version.path, knownTargets);
      // Drama Skills 0.7+ renders the assembled cut into 制作成果/成片/ (excluding 制作成果/成片/分段/,
      // 制作成果/成片/规格统一/, and 叠层.webm); earlier native compositions wrote 成片-<job>.mp4.
      const composition = /(?:^|\/)成片-[^/]+\.mp4$/iu.test(version.path)
        || (/(?:^|\/)制作成果\/成片\/[^/]+\.mp4$/iu.test(version.path) && !/(?:^|\/)叠层\.webm$/iu.test(version.path));
      if (matched === undefined && !composition) return [];
      if (matched === undefined) return [{ ...version, targetId: episodeProduction.episodeDirectory }];
      const resolvedTargets = resolveMediaTargetIds(episodeProduction, matched);
      const targets = resolvedTargets.length > 0 ? resolvedTargets : [matched];
      return targets.map((targetId) => ({ ...version, targetId }));
    });
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
    const next = initialWorkbenchMode(workbench,
      workspace.files.filter((file) => workbenchModes.includes(workbenchModeForPath(file.path) ?? "story")),
      workbenchModes.includes("game") ? workspace.games : [],
      workbenchModes.includes("video") ? workspace.videos : []);
    setWorkbench(next);
  }, [setWorkbench, workbench, workbenchModes, workspace]);
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
    const nextWorkbench = workbenchModeForPath(path) ?? "story";
    if (!workbenchModes.includes(nextWorkbench)) return;
    rememberEditorPosition();
    setWorkbench(nextWorkbench);
    if (nextWorkbench === "game") {
      modeSelection.current = path;
      setEditorMode("preview");
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
  }, [expandPath, rememberEditorPosition, setEditorMode, setGameProjectId, setVideoProjectId, setVideoTab, workbenchModes, workspace?.games, workspace?.videos]);

  useEffect(() => {
    if (workspace === undefined) return;
    const pending = productionIntents.filter(({ callId }) => productionIntentCalls[callId] !== true);
    if (pending.length === 0) return;
    for (const { intent } of pending) {
      if (intent.action === "open_section" || intent.action === "focus_target") {
        const documentPath = ["分镜.md", "图片提示词.md", "视觉设定.md", "剧本.md", "视频提示词.md"]
          .map((name) => `${intent.episode}/${name}`)
          .find((path) => workspace.files.some((file) => file.path === path));
        if (documentPath !== undefined && workbenchModes.includes("drama")) {
          setWorkbench("drama");
          actions.setDramaEpisode(intent.episode);
          actions.setDramaPane("canvas");
          setSelected(documentPath);
          expandPath(documentPath);
          globalThis.setTimeout(() => { setEditorMode("production"); }, 0);
        }
      }
      if (intent.action === "open_section") setProductionSection(intent.section);
      else if (intent.action === "focus_target") {
        actions.setProductionSelectedIds((current) => ({ ...current, [intent.episode]: intent.targetId }));
        setProductionSection(intent.section ?? (intent.targetId.startsWith("SHOT-") ? "shots" : "assets"));
      } else if (intent.action === "set_sequence") {
        actions.setProductionSequence((current) => ({
          ...current,
          [intent.episode]: intent.shotIds.map((shotId) => ({ shotId }))
        }));
      } else {
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
  }, [actions, expandPath, productionIntentCalls, productionIntents, setEditorMode, setProductionSection, setSelected, setWorkbench, workbenchModes, workspace]);

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
    const preserveUnsavedDraft = path !== selected
      && current?.source === "human"
      && current.content !== current.saved;
    if (preserveUnsavedDraft) return;
    // Never preempt a running game or video preview: agent writes may expand the tree, not navigate.
    if ((workbench === "game" && gameTab !== "design") || (workbench === "video" && videoTab !== "docs")) return;
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
    if ((workbench === "game" && gameTab !== "design") || (workbench === "video" && videoTab !== "docs")) return;
    const activeProjectRoot = workbench === "game" ? activeGame?.root : workbench === "video" ? activeVideo?.root : undefined;
    const matchesWorkbench = selected !== undefined
      && ((workspace?.files.some((file) => file.path === selected) ?? false) || buffers[selected] !== undefined)
      && workbenchModeForPath(selected) === workbench
      && (activeProjectRoot === undefined || selected.startsWith(`${activeProjectRoot}/`));
    if (matchesWorkbench) return;
    const scopedFiles = activeProjectRoot === undefined
      ? (workspace?.files ?? [])
      : (workspace?.files ?? []).filter((file) => file.path.startsWith(`${activeProjectRoot}/`));
    setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(scopedFiles, workbench));
  }, [activeGame?.root, activeVideo?.root, activityPath, buffers, gameTab, selected, videoTab, workbench, workspace, workspaceLoading]);

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
            next[path] = { ...value, missing: true, error: "文件已从工作区移除。本地草稿仍保留，可复制后放弃草稿。" };
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
    if (selected === undefined || selectedMedia || selectedDiskVersion === undefined || selectedInActivity) return;
    const controller = new AbortController();
    setFileReadErrors((current) => {
      if (!(selected in current)) return current;
      const next = { ...current };
      delete next[selected];
      return next;
    });
    setBuffers((current) => {
      const existing = current[selected];
      return existing === undefined ? current : { ...current, [selected]: { ...existing, error: undefined } };
    });
    void fetch(endpoint("file", sessionId, selected), { signal: controller.signal })
      .then((response) => json<FilePayload>(response))
      .then((file) => {
        setFileReadErrors((current) => {
          if (!(file.path in current)) return current;
          const next = { ...current };
          delete next[file.path];
          return next;
        });
        setBuffers((current) => {
          const existing = current[file.path];
          if (existing?.source === "human" && existing.content !== existing.saved) {
            if (existing.version === file.version) {
              return { ...current, [file.path]: { ...existing, missing: false, error: undefined, conflict: undefined } };
            }
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
        const message = reason instanceof Error ? reason.message : String(reason);
        setFileReadErrors((current) => ({ ...current, [selected]: message }));
        setBuffers((current) => {
          const existing = current[selected];
          return existing === undefined ? current : {
            ...current,
            [selected]: { ...existing, error: message }
          };
        });
      });
    return () => { controller.abort(); };
  }, [selected, selectedDiskVersion, selectedInActivity, selectedMedia, selectedReadAttempt, sessionId, setBuffers]);

  useEffect(() => {
    if (!productionAvailable) return;
    const toLoad = episodeDocumentPaths.filter((path) => {
      if (activityPaths.has(path)) return false;
      const current = buffersRef.current[path];
      const file = workspace?.files.find((item) => item.path === path);
      return current === undefined
        || current.source === "agent"
        || (current.version !== file?.version && current.content === current.saved);
    });
    if (toLoad.length === 0) return;
    const controller = new AbortController();
    setEpisodeLoadFailure(undefined);
    void Promise.all(toLoad.map((path) => fetch(endpoint("file", sessionId, path), { signal: controller.signal }).then((response) => json<FilePayload>(response))))
      .then((files) => {
        setBuffers((current) => {
          const next = { ...current };
          for (const file of files) {
            const existing = next[file.path];
            if (existing?.source === "human" && existing.content !== existing.saved) continue;
            if (latestActivityPaths.current.has(file.path)) continue;
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
            for (const path of toLoad) {
              const existing = next[path];
              if (existing !== undefined) next[path] = { ...existing, error: reason instanceof Error ? reason.message : String(reason) };
            }
            return next;
          });
        }
      });
    return () => { controller.abort(); };
  }, [activityPaths, episodeDirectory, episodeDocumentPaths, episodeLoadAttempt, productionAvailable, sessionId, setBuffers, workspace?.files]);

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
    if (workbench !== "game" && workbench !== "video" && workbench !== "story") return;
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
        method: "POST",
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
      if (savedNoticeTimer.current !== undefined) globalThis.clearTimeout(savedNoticeTimer.current);
      setSavedPathNotice(path);
      savedNoticeTimer.current = globalThis.setTimeout(() => {
        setSavedPathNotice((current) => current === path ? undefined : current);
      }, 1800);
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
      if (workbench === "story" || workbench === "drama") {
        if (dramaCanvasActive || editorMode === "production") return;
        if (!(event.target instanceof Element) || event.target.closest(".oh-story-editor") === null) return;
      }
      event.preventDefault();
      if (selected !== undefined) void savePath(selected);
    };
    globalThis.addEventListener("keydown", saveShortcut);
    return () => { globalThis.removeEventListener("keydown", saveShortcut); };
  }, [activeGame?.id, dramaCanvasActive, editorMode, gameTab, open, savePath, selected, videoTab, workbench]);

  const groups = useMemo(() => {
    const value = new Map<string, WorkspaceFile[]>();
    const all = [...(workspace?.files ?? [])].filter((file) => workbenchModeForPath(file.path) === workbench);
    const seen = new Set(all.map((file) => file.path));
    if (activityPath !== undefined && workbenchModeForPath(activityPath) === workbench && !seen.has(activityPath)) {
      all.push({ path: activityPath, bytes: 0, version: "", kind: "text" });
      seen.add(activityPath);
    }
    for (const [path, entry] of Object.entries(buffers)) {
      if (entry.missing === true && workbenchModeForPath(path) === workbench && !seen.has(path)) {
        all.push({ path, bytes: entry.content.length, version: entry.version, kind: "text" });
        seen.add(path);
      }
    }
    all.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));
    for (const file of all) {
      const directory = groupForPath(file.path);
      const files = value.get(directory) ?? [];
      files.push(file);
      value.set(directory, files);
    }
    const order = GROUP_ORDER[workbench];
    const groupRank = (name: string): number => {
      if (workbench === "story") {
        const idx = order.indexOf(name);
        if (idx >= 0 && !STORY_AUXILIARY_GROUPS.has(name)) return idx;
        // Place multi-book `{书名}/` folders right after core story groups and ahead of auxiliary folders.
        if (idx < 0) return 5;
        return idx + 1;
      }
      const idx = order.indexOf(name);
      return idx < 0 ? order.length : idx;
    };
    return [...value.entries()].sort(([left], [right]) => (
      groupRank(left) - groupRank(right) || left.localeCompare(right, "zh-Hans-CN")
    ));
  }, [activityPath, buffers, workbench, workspace]);

  useEffect(() => {
    if (!compactLayout || workbench !== "story" || !storyFilesOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") actions.setStoryFilesOpen(false);
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".oh-story-tree") !== null || target.closest(".oh-story-files-toggle") !== null) return;
      actions.setStoryFilesOpen(false);
    };
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [actions, compactLayout, storyFilesOpen, workbench]);

  const selectWorkbench = (next: WorkbenchMode): void => {
    if (!workbenchModes.includes(next)) return;
    const focused = surfaceRef.current?.ownerDocument.activeElement;
    followWorkbenchTabFocus.current = focused?.closest('[role="tablist"][aria-label="创作工作台"]') !== null && focused?.closest('[role="tablist"][aria-label="创作工作台"]') !== undefined;
    setWorkbench(next);
    if (next === "game" || next === "video") {
      if ((next === "game" && gameTab === "preview") || (next === "video" && videoTab === "preview")) {
        setSelected(undefined);
      }
      return;
    }
    const target = workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, next);
    if (target === undefined) setSelected(undefined);
    else revealPath(target);
  };
  const changeWorkbenchModes = (modes: readonly WorkbenchMode[]): void => {
    workbenchModesStore.set(workspace?.cwd, modes);
    const next = resolveVisibleWorkbench(workbench, modes);
    if (next !== workbench) selectWorkbench(next);
  };
  const closeWorkbenchSettings = (): void => {
    setSettingsOpen(false);
    globalThis.requestAnimationFrame(() => {
      const buttons = surfaceRef.current?.querySelectorAll<HTMLButtonElement>(".oh-workbench-settings-toggle");
      Array.from(buttons ?? []).find((button) => button.getClientRects().length > 0)?.focus();
    });
  };
  const selectEditorMode = (next: WorkbenchMemory["editorMode"]): void => {
    if (next === "preview") rememberEditorPosition();
    if (workbench === "drama") actions.setDramaPane(next === "production" ? "canvas" : "documents");
    setEditorMode(next);
  };
  const selectDramaPane = (pane: WorkbenchMemory["dramaPane"]): void => {
    if (pane === "canvas") {
      rememberEditorPosition();
      if (dramaPane === "canvas") setProductionSection("canvas");
      actions.setDramaPane("canvas");
    } else {
      actions.setDramaPane("documents");
      actions.setDramaFilesOpen(true);
      if (editorMode === "production") setEditorMode("preview");
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
      if (editorMode === "production") setEditorMode("preview");
    } else if (workbench === "story") {
      actions.setStoryFilesOpen(false);
    }
    revealPath(path);
  };
  const focusContextInChat = (prompt?: string): void => {
    globalThis.setTimeout(() => {
      const applied = focusProductionChat(prompt);
      if (prompt !== undefined) { setManualChatContext(applied ? undefined : prompt); setContextCopyStatus(undefined); }
    }, 0);
  };
  const continueStoryInChat = (prompt: string): void => {
    actions.setStoryPane("chat");
    focusContextInChat(prompt);
  };
  const continueDramaInChat = (targetId?: string): void => {
    actions.setDramaChatOpen(true);
    let title: string | undefined;
    if (targetId !== undefined && episodeProduction !== undefined) {
      const resolved = targetDisplayName(episodeProduction, targetId, episodeDocuments);
      title = resolved !== targetId || episodeProduction.targets.has(targetId) ? resolved : undefined;
    }
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
  const refreshCreative = (): void => {
    setCreativeLoadAttempt((current) => current + 1);
    if (selected !== undefined) retryReadFile(selected);
    reload();
  };
  const gameEditor: GameDocumentEditor = {
    selected, buffers, mode: editorMode, textareaRef, errors: fileReadErrors,
    onSelect: revealPath, onMode: setEditorMode, onSave: savePath, onConflict: resolveConflict,
    onEdit: (path, content) => { setBuffers((current) => {
      const existing = current[path];
      return existing === undefined ? current : { ...current, [path]: { ...existing, content, source: "human" } };
    }); },
    onDiscard: (path) => { setBuffers((current) => { const next = { ...current }; delete next[path]; return next; }); setSelected(undefined); },
    onRememberPosition: rememberEditorPosition, onRetry: refreshCreative
  };
  const dispatchDramaPrompt = async (prompt: string): Promise<void> => {
    actions.setDramaChatOpen(true);
    await sendProductionPrompt(prompt);
  };
  const episodeDocumentsPending = episodeDocumentPaths.some((path) => buffers[path] === undefined && !activityPaths.has(path));
  const dramaProductionView = episodeProduction === undefined ? undefined : <WorkbenchErrorBoundary key={episodeDirectory ?? "drama"} label="短剧生产视图">
    {episodeDocumentsPending
      ? episodeLoadFailure !== undefined && episodeLoadFailure.episode === episodeDirectory
        ? <div className="oh-story-empty" role="alert">暂时无法读取本集文稿：{episodeLoadFailure.message}<button type="button" onClick={() => { setEpisodeLoadAttempt((current) => current + 1); }}>重新读取</button></div>
        : <div className="oh-story-empty oh-loading-state" role="status">正在整理本集画布…</div>
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
        onRefresh={refreshCreative}
      />}
  </WorkbenchErrorBoundary>;
  const selectedLabel = selected ?? `在当前工作区中选择${workbenchLabel(workbench)}文件`;
  const selectedBasename = selected?.split("/").at(-1) ?? selectedLabel;
  const selectedDirname = selected !== undefined && selected.includes("/") ? selected.slice(0, selected.lastIndexOf("/") + 1) : undefined;
  const selectedGroup = selected === undefined ? undefined : groupForPath(selected);
  const storyWordCount = workbench === "story" && markdown && editorReady ? countCreativeWords(buffer.content) : undefined;
  const toggleGroup = (key: string, open: boolean): void => {
    setExpanded((current) => ({ ...current, [key]: open }));
  };

  if (!open) {
    // Without creative work there is nothing to reveal, so the plugin leaves the
    // official conversation exactly as DSH renders it. A failed workspace request
    // still offers the way in, because that error is only readable inside the workbench.
    if (!creativeProject && error === undefined) {
      return null;
    }
    return <div ref={surfaceRef} className="oh-story-split-surface" data-open="false">
      <OnceWorkbenchStylesheet />
      <button className="oh-story-launcher" type="button" title={error ?? "打开创作工作台"} aria-label="打开创作工作台" onClick={() => { applyWorkbenchPreference("open"); }}>
        <span aria-hidden>✦</span><b>创作工作台</b>
      </button>
    </div>;
  }

  const compactPane = workbench === "game" ? gamePane : workbench === "video" ? videoPane : storyPane;
  const selectCompactPane = (pane: "studio" | "chat"): void => {
    if (workbench === "game") { setGamePane(pane); if (pane === "chat") actions.setGameChatOpen(true); }
    else if (workbench === "video") { setVideoPane(pane); if (pane === "chat") actions.setVideoChatOpen(true); }
    else { actions.setStoryPane(pane); if (pane === "chat") actions.setStoryFilesOpen(false); }
  };

  return <div ref={surfaceRef} className="oh-story-split-surface" data-open="true" data-workbench={workbench} data-drama-pane={dramaPane} data-drama-files={dramaFilesOpen ? "open" : "closed"} data-drama-chat={dramaChatOpen ? "open" : "closed"} data-story-files={storyFilesOpen ? "open" : "closed"}>
    <OnceWorkbenchStylesheet />
    {settingsOpen && <WorkbenchSettingsPanel modes={workbenchModes} onChange={changeWorkbenchModes} onClose={closeWorkbenchSettings} />}
    {manualChatContext !== undefined && <aside className="oh-story-context-fallback" aria-live="polite" aria-label="带到 Chat 的讨论内容">
      <header><strong>讨论内容已保留</strong><button type="button" aria-label="关闭讨论内容" onClick={() => { setManualChatContext(undefined); }}>×</button></header>
      <p>讨论内容未自动填入 Chat，已有输入保持原样。你可以在这里查看或复制选中内容。</p>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(manualChatContext).then(() => { setContextCopyStatus("已复制，可贴入 Chat 继续讨论。"); }).catch(() => { setContextCopyStatus("复制暂不可用，可展开选中内容手动复制。"); }); }}>复制讨论内容</button>
      {contextCopyStatus !== undefined && <p role="status">{contextCopyStatus}</p>}
      <details><summary>查看选中内容</summary><pre>{manualChatContext}</pre></details>
    </aside>}
    {(workbench === "game" || workbench === "video" || workbench === "story") && <div className="oh-game-mobile-switcher" role="tablist" aria-label={workbench === "game" ? "窄屏游戏工作台" : workbench === "video" ? "窄屏视频工作台" : "窄屏小说工作台"}>
      {(["studio", "chat"] as const).map((pane) => <button
        type="button"
        role="tab"
        key={pane}
        id={`${compactTabsId}-${pane}-tab`}
        aria-controls={pane === "chat" ? compactChatId : workbench === "game" ? compactStudioId : workbench === "video" ? compactVideoStudioId : compactStoryId}
        aria-selected={compactPane === pane}
        tabIndex={compactPane === pane ? 0 : -1}
        onKeyDown={(event) => { handleTabKey(event, ["studio", "chat"] as const, compactPane, selectCompactPane); }}
        onClick={() => { selectCompactPane(pane); }}
      >{pane === "studio" ? (workbench === "story" ? "文稿" : "制作") : "对话"}</button>)}
    </div>}
    {workbench === "game" && workspace === undefined && <main id={compactStudioId} className="oh-game-studio" role={compactLayout ? "tabpanel" : undefined} aria-labelledby={compactLayout ? `${compactTabsId}-studio-tab` : undefined}><div className={`oh-game-design-empty${error === undefined ? " oh-loading-state" : ""}`}>{error ?? "正在连接游戏工作台…"}</div></main>}
    {workspace !== undefined && gameStudioMounted && <WorkbenchErrorBoundary label="游戏工作台" onCollapse={() => { applyWorkbenchPreference("closed"); }}><GameStudio
          workspace={workspace}
          workspaceError={error}
          building={gameBuilding}
          gameTab={gameTab}
          gameProjectId={gameProjectId}
          hidden={workbench !== "game"}
          onGameTab={setGameTab}
          onGameProject={setGameProjectId}
          paneId={compactStudioId}
          labelledBy={`${compactTabsId}-studio-tab`}
          onWorkbench={selectWorkbench}
          workbenchModes={workbenchModes}
          onWorkbenchSettings={() => { setSettingsOpen(true); }}
          onCollapse={() => { applyWorkbenchPreference("closed"); }}
          onRefresh={refreshCreative}
          fileReadError={selectedReadError}
          onRetryRead={() => { if (selected !== undefined) retryReadFile(selected); }}
          resolveImageSrc={resolveImageSrc}
          editor={gameEditor}
          canvasByProject={gameCanvasByProject}
          onCanvasChange={(projectId, value) => { actions.setGameCanvas((current) => ({ ...current, [projectId]: value })); }}
          chatOpen={gameChatOpen}
          onChatOpen={setGameChatVisible}
          onContinueInChat={continueGameInChat}
        /></WorkbenchErrorBoundary>}
    {workbench === "video" && workspace === undefined && <main id={compactVideoStudioId} className="oh-video-studio" role={compactLayout ? "tabpanel" : undefined} aria-labelledby={compactLayout ? `${compactTabsId}-studio-tab` : undefined}><div className={`oh-video-preview-empty${error === undefined ? " oh-loading-state" : ""}`}>{error ?? "正在连接视频工作台…"}</div></main>}
    {workspace !== undefined && videoStudioMounted && <WorkbenchErrorBoundary label="视频工作台" onCollapse={() => { applyWorkbenchPreference("closed"); }}><VideoStudio
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
          workbenchModes={workbenchModes}
          onWorkbenchSettings={() => { setSettingsOpen(true); }}
          onCollapse={() => { applyWorkbenchPreference("closed"); }}
          onRefresh={refreshCreative}
          onCreateProject={() => { setVideoProjectId(""); continueVideoInChat("我想新建一个视频解说项目，请先帮我确认目标画幅比例（3:4 / 9:16 / 16:9）、构图方式（cover / contain）与原片路径。"); }}
          fileReadError={selectedReadError}
          onRetryRead={() => { if (selected !== undefined) retryReadFile(selected); }}
          workspaceError={error}
          truncated={workspace.truncated}
          resolveImageSrc={resolveImageSrc}
        /></WorkbenchErrorBoundary>}
    {workbench !== "game" && workbench !== "video" && <>
    {workbench === "drama" && <header className="oh-drama-workspace-toolbar">
      <div className="oh-drama-workspace-brand"><WorkbenchModeTabs className="oh-story-mode-tabs" current={workbench} modes={workbenchModes} onSelect={selectWorkbench} /><WorkbenchSettingsButton onClick={() => { setSettingsOpen(true); }} /></div>
      <label className="oh-drama-episode-picker"><span>剧集</span><select aria-label="选择短剧剧集" value={episodeDirectory ?? ""} onChange={(event) => { actions.setDramaEpisode(event.target.value); actions.setDramaPane("canvas"); setProductionSection("canvas"); }}>{dramaEpisodes.length === 0 ? <option value="">还没有剧集</option> : dramaEpisodes.map((directory) => <option value={directory} key={directory}>{directory.split("/").at(-1)}</option>)}</select></label>
      <div className="oh-drama-workspace-views" role="tablist" aria-label="短剧工作区">{(["canvas", "documents"] as const).map((pane) => <button type="button" role="tab" key={pane} aria-selected={dramaPane === pane} tabIndex={dramaPane === pane ? 0 : -1} onKeyDown={(event) => { handleTabKey(event, ["canvas", "documents"] as const, dramaPane, selectDramaPane); }} onClick={() => { selectDramaPane(pane); }}>{pane === "canvas" ? "制作" : "文稿"}</button>)}</div>
      <div className="oh-drama-workspace-actions"><button type="button" aria-label={dramaFilesOpen ? "收起项目文稿" : "展开项目文稿"} aria-expanded={dramaFilesOpen} onClick={() => { actions.setDramaFilesOpen(!dramaFilesOpen); }}>文稿目录</button><button type="button" aria-label={dramaChatOpen ? "收起原生 Chat" : "展开原生 Chat"} aria-expanded={dramaChatOpen} onClick={() => { actions.setDramaChatOpen(!dramaChatOpen); }}>Chat</button><button type="button" aria-label="刷新项目文件" title="刷新项目文件" onClick={refreshCreative}>↻</button><button type="button" aria-label="收起创作工作台" onClick={() => { applyWorkbenchPreference("closed"); }}>×</button></div>
    </header>}
    <aside className="oh-story-tree" aria-hidden={(workbench === "drama" && !dramaFilesOpen) || (workbench === "story" && compactLayout && !storyFilesOpen) || undefined}>
      <div className="oh-story-brand" hidden={workbench === "drama"}>
        <span className="oh-story-brand-cluster"><strong>✦ <span>Oh Story</span></strong>{workspaceKind !== undefined && <span className="oh-story-kind">{workspaceKind === "story" ? "小说" : "短剧"}</span>}</span>
        <span className="oh-story-brand-actions">
          <button type="button" onClick={refreshCreative} title="刷新" aria-label="刷新项目文件">↻</button>
          <button type="button" onClick={() => { applyWorkbenchPreference("closed"); }} title="收起创作工作台" aria-label="收起创作工作台">×</button>
        </span>
      </div>
      {workspace !== undefined && workbench !== "drama" && <div className="oh-story-workbench-nav"><WorkbenchModeTabs className="oh-story-mode-tabs" current={workbench} modes={workbenchModes} onSelect={selectWorkbench} /><WorkbenchSettingsButton onClick={() => { setSettingsOpen(true); }} /></div>}
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
              dirtyPaths={dirtyPaths}
              missingPaths={missingPaths}
              onToggle={toggleGroup}
              onSelect={openDramaDocument}
            />
          </details>;
        })}
      </nav>
    </aside>
    <main
      id={workbench === "story" ? compactStoryId : undefined}
      role={workbench === "story" && compactLayout ? "tabpanel" : undefined}
      aria-labelledby={workbench === "story" && compactLayout ? `${compactTabsId}-studio-tab` : undefined}
      className="oh-story-editor"
      data-drama-canvas={dramaCanvasActive || undefined}
    >
      {workbench === "story" && <div className="oh-story-compact-bar">
        <WorkbenchModeTabs className="oh-story-mode-tabs" current={workbench} modes={workbenchModes} onSelect={selectWorkbench} />
        <WorkbenchSettingsButton onClick={() => { setSettingsOpen(true); }} />
        <button type="button" className="oh-story-files-toggle" aria-label={storyFilesOpen ? "收起小说目录" : "展开小说目录"} aria-expanded={storyFilesOpen} onClick={() => { actions.setStoryFilesOpen(!storyFilesOpen); }}>目录</button>
      </div>}
      <header hidden={dramaCanvasActive}>
        <span className="oh-story-editor-path" title={selected}>
          <span>{selectedDirname !== undefined && <em className="oh-story-editor-breadcrumb">{selectedDirname}</em>}<b className="oh-story-editor-filename">{selectedBasename}</b></span>
          <strong>{selectedBasename}</strong>
        </span>
        <div className="oh-story-editor-actions">
          {storyWordCount !== undefined && <span className="oh-story-word-count" aria-label={`正文 ${String(storyWordCount)} 字`}>{storyWordCount.toLocaleString("zh-Hans-CN")} 字</span>}
          {!dirty && !saving && savedPathNotice !== undefined && savedPathNotice === selected && <span className="oh-story-saved-pill" role="status">✓ 已保存</span>}
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
          {(dirty || saving) && selected !== undefined && <button className="oh-story-save" data-dirty={dirty || undefined} title="保存（⌘S / Ctrl+S）" type="button" disabled={saving || buffer?.missing === true} onClick={() => { void savePath(selected); }}>
            {saving ? "保存中…" : "保存"}
          </button>}
        </div>
      </header>
      {((workbench === "drama" && !dramaFilesOpen) || (workbench === "story" && compactLayout && !storyFilesOpen)) && error !== undefined && <div className="oh-story-error" role="alert">{error}</div>}
      {((workbench === "drama" && !dramaFilesOpen) || (workbench === "story" && compactLayout && !storyFilesOpen)) && workspace?.metadataErrors.map((message) => <div className="oh-story-warning" key={message} role="status">{message}</div>)}
      {workspace?.truncated === true && <div className="oh-story-warning oh-story-truncated-banner" role="status">工作区文件数已达上限，部分文件未列出；请清理临时目录或刷新。</div>}
      {activity !== undefined && activityPath !== undefined && activityPath === selected && <div className="oh-story-stream" data-stage={activity.stage} role="status" aria-live="polite">● {activity.stage === "running" ? `Agent 正在更新${fileActivityLabel(activityPath) ?? "文件"}` : `Agent 正在生成${fileActivityLabel(activityPath) ?? "文件"}`}</div>}
      {conflict !== undefined && <div className="oh-story-conflict" role="alert">
        <span>{conflict.message}</span>
        {conflict.theirs !== undefined && conflict.theirsVersion !== undefined && selected !== undefined && <div>
          <button type="button" onClick={() => { resolveConflict(false); }}>载入磁盘版本</button>
          <button type="button" onClick={() => { resolveConflict(true); }}>保留本地草稿</button>
        </div>}
      </div>}
      {fileError !== undefined && buffer?.missing !== true && <div className="oh-story-error">{fileError}</div>}
      {trackingFile && editorMode === "source" && editorReady && selected !== undefined && <div className="oh-story-warning oh-story-tracking-guard" role="note">
        <span>追踪文件由脚本维护，直接手改可能导致状态漂移；通常只需浏览。</span>
        <button type="button" onClick={() => { setUnlockedTracking((current) => ({ ...current, [selected]: !current[selected] })); }}>{trackingLocked ? "仍然解锁编辑" : "恢复只读"}</button>
      </div>}
      {dramaCanvasActive
        ? dramaProductionView ?? <div className="oh-drama-empty-workspace"><strong>从第一集开始，让故事慢慢生长</strong><p>说说你想讲的故事，或把已有剧本交给 AI。人物、场景和镜头会在这里展开。</p><button type="button" onClick={() => { continueDramaInChat(); }}>和 AI 讨论第一集</button></div>
        : selected === undefined
        ? <div className="oh-story-empty">{workbench === "story"
            ? <>
                <p>当前工作区还没有小说文件。可在 Chat 中运行 <code>/story</code>，或直接选一个起点开始。</p>
                <div className="oh-story-empty-actions">
                  <button type="button" onClick={() => { continueStoryInChat("我想开一本长篇网文，请先和我讨论题材、核心卖点和开书方向。"); }}>写长篇</button>
                  <button type="button" onClick={() => { continueStoryInChat("我想写一篇短篇故事，请先和我讨论核心反转和情绪线。"); }}>写短篇</button>
                  <button type="button" onClick={() => { continueStoryInChat("我想拆解一本小说，请告诉我怎么提供原文并开始拆书。"); }}>拆书</button>
                </div>
              </>
            : <>当前工作区还没有短剧项目。可在 Chat 中运行 <code>/short-drama</code>。</>}</div>
        : selectedMedia && selectedFile !== undefined
          ? <div className="oh-story-media-document">{selectedFile.mimeType?.startsWith("image/") === true
              ? <img src={endpoint("media", sessionId, selectedFile.path, selectedFile.version)} alt={selectedFile.path} />
              : selectedFile.mimeType?.startsWith("audio/") === true
                ? <audio src={endpoint("media", sessionId, selectedFile.path, selectedFile.version)} controls />
                : <video src={endpoint("media", sessionId, selectedFile.path, selectedFile.version)} controls preload="metadata" />}</div>
        : buffer === undefined
          ? selectedReadError !== undefined
            ? <div className="oh-story-empty" role="alert"><p>暂时无法读取 {selected}：{selectedReadError}</p><button type="button" onClick={() => { retryReadFile(selected); }}>重新读取</button></div>
            : <div className="oh-story-empty oh-loading-state" role="status">正在加载 {selected}…</div>
        : buffer.missing === true
          ? <div className="oh-story-missing-draft-panel">
              <div className="oh-story-warning" role="alert">
                <span>文件已从工作区移除，本地草稿仍保留。请先复制需要的内容，再放弃草稿。</span>
                <div className="oh-story-missing-draft-actions">
                  <button type="button" onClick={() => {
                    void navigator.clipboard.writeText(buffer.content)
                      .then(() => { setMissingCopyStatus("已复制本地草稿。"); })
                      .catch(() => { setMissingCopyStatus("复制暂不可用，请在下方文本框全选复制。"); });
                  }}>复制草稿</button>
                  <button type="button" onClick={() => {
                    setMissingCopyStatus(undefined);
                    setBuffers((current) => {
                      const next = { ...current };
                      delete next[selected];
                      return next;
                    });
                    setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, workbench));
                  }}>放弃本地草稿</button>
                </div>
                {missingCopyStatus !== undefined && <p role="status">{missingCopyStatus}</p>}
              </div>
              <textarea className="oh-story-missing-draft" aria-label={`${selected} 本地草稿`} value={buffer.content} readOnly />
            </div>
        : editorMode === "production" && productionAvailable && episodeProduction !== undefined
          ? dramaProductionView
        : previewable && editorMode === "preview"
          ? markdown
            ? <MarkdownPreview content={buffer.content} label={selected} resolveImageSrc={resolveImageSrc} />
            : <JsonlPreview content={buffer.content} label={selected} />
          : <textarea
            ref={textareaRef}
            value={buffer.content}
            readOnly={trackingLocked}
            data-format={structured ? "structured" : "prose"}
            onBlur={rememberEditorPosition}
            onScroll={rememberEditorPosition}
            onSelect={rememberEditorPosition}
            onChange={(event) => {
              if (trackingLocked) return;
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
  return <WorkbenchErrorBoundary label="创作工作台"><SessionWorkbenchMemory key={props.sessionId} {...props} /></WorkbenchErrorBoundary>;
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
    rememberSessionMemory(sessionId, memory);
  }, [memory, sessionId]);
  return null;
}

/** Mount beside the official conversation without replacing Chat or Composer. */
function SessionWorkbenchBridge({ sessionId, useSession, useSessions, useProjection, useChat, useStore, actions, sendProductionPrompt, focusProductionChat, cancelProduction, removeQueuedProduction }: WorkbenchSlotProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [target, setTarget] = useState<HTMLElement>();
  const runningCalls = useChat((snapshot) => snapshot.legacy.runningCalls);
  const partial = useChat((snapshot) => streamingAssistant(snapshot.timeline));
  const undispatched = useChat((snapshot) => undispatchedCalls(snapshot), sameUndispatchedCalls);
  const settledMutation = useChat((snapshot) => latestSettledMutation(snapshot));
  const settledMutationTurn = useChat((snapshot) => latestSettledMutationTurn(snapshot));
  const liveTurn = useChat((snapshot) => openTurn(snapshot));
  const selectedWorkbench = useStore((memory) => memory.workbench);
  const gamePane = useStore((memory) => memory.gamePane);
  const gameChatOpen = useStore((memory) => memory.gameChatOpen);
  const videoChatOpen = useStore((memory) => memory.videoChatOpen);
  const videoPane = useStore((memory) => memory.videoPane);
  const dramaChatOpen = useStore((memory) => memory.dramaChatOpen);
  const dramaFilesOpen = useStore((memory) => memory.dramaFilesOpen);
  const storyPane = useStore((memory) => memory.storyPane);
  const storyFilesOpen = useStore((memory) => memory.storyFilesOpen);
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
  const subscribeModes = useCallback((notify: () => void) => workbenchModesStore.subscribe(workspace?.cwd, notify), [workspace?.cwd]);
  const getModes = useCallback(() => workbenchModesStore.get(workspace?.cwd), [workspace?.cwd]);
  const workbenchModes = useSyncExternalStore(subscribeModes, getModes);
  const workbench = resolveVisibleWorkbench(selectedWorkbench, workbenchModes);
  useLayoutEffect(() => {
    if (selectedWorkbench !== workbench) actions.setWorkbench(workbench);
  }, [actions, selectedWorkbench, workbench]);
  const chosenPreference = useStore((memory) => memory.workbenchPreference);
  const creativeProject = hasCreativeProject(workspace);
  const welcomeController = activeWelcomeGuideController;
  // DSH 0.1.7 opens a fresh home straight into a blank Session in its default workspace, so
  // "no Session yet" no longer marks a first launch. A blank Session without creative work does.
  const sessionBlank = useSessions((state) => state.byId[sessionId]?.blank === true);
  useEffect(() => {
    if (sessionBlank && workspace !== undefined && !creativeProject && workspace.welcomeGuide === undefined) {
      welcomeController.ensureFallbackHostConfig();
    }
  }, [creativeProject, sessionBlank, welcomeController, workspace]);
  // The Session Store holds this Session's choice; localStorage carries the workspace's
  // last choice across restarts. Reading it here keeps the decision in the same render
  // that learns the workspace, so a collapsed workbench never flashes the layout open.
  const storedPreference = useMemo(
    () => readWorkbenchPreference(workbenchPreferenceStorage(), workspace?.cwd),
    [workspace?.cwd]
  );
  const preference = chosenPreference ?? storedPreference;
  const open = resolveWorkbenchOpen(preference, creativeProject);
  const [compactLayout, setCompactLayout] = useState(false);
  useLayoutEffect(() => {
    const suppress = !sessionBlank || workspaceLoading || workspace === undefined || creativeProject || open;
    sessionHeroWelcomeState.set(sessionId, { suppress, workspaceWelcomeGuide: workspace?.welcomeGuide });
    publishHeroWelcomeSnapshot();
    return () => {
      sessionHeroWelcomeState.delete(sessionId);
      publishHeroWelcomeSnapshot();
    };
  }, [creativeProject, open, sessionBlank, sessionId, workspace, workspaceLoading]);
  useLayoutEffect(() => {
    const doc = marker.current?.ownerDocument;
    if (doc === undefined) return;
    anchorRef.current = null;
    let bodyObserver: MutationObserver | undefined;
    let detachObserver: MutationObserver | undefined;
    // DSH 0.1.7 renders the same conversation content inside the right sidebar's subagent
    // chats, so only this Session's main column is a valid seat. DSH 0.2.2-rc.2 wraps the
    // scroll container in the conversation.hero.frame slot, so it is a descendant, not a child.
    const selector = `[data-conversation-content][data-conversation-session="${CSS.escape(sessionId)}"]:not([data-sidebar-chat] *) [data-conversation-scroll] > [data-slot='conversation.session']`;
    const watchForDetach = (anchor: HTMLElement): void => {
      detachObserver?.disconnect();
      const parent = anchor.parentElement;
      if (parent === null) return;
      detachObserver = new MutationObserver(() => {
        if (anchorRef.current?.isConnected === true) return;
        detachObserver?.disconnect();
        detachObserver = undefined;
        anchorRef.current = null;
        setTarget(undefined);
        startBodyScan();
      });
      detachObserver.observe(parent, { childList: true });
    };
    const locate = (): void => {
      if (anchorRef.current?.isConnected === true) return;
      const anchor = doc.querySelector<HTMLElement>(selector);
      if (anchor === null) return;
      anchorRef.current = anchor;
      bodyObserver?.disconnect();
      bodyObserver = undefined;
      setTarget((current) => current === anchor ? current : anchor);
      watchForDetach(anchor);
    };
    const startBodyScan = (): void => {
      locate();
      if (anchorRef.current?.isConnected === true) return;
      bodyObserver?.disconnect();
      bodyObserver = new MutationObserver(locate);
      bodyObserver.observe(doc.body, { childList: true, subtree: true });
    };
    startBodyScan();
    return () => {
      bodyObserver?.disconnect();
      detachObserver?.disconnect();
    };
  }, [sessionId]);
  useLayoutEffect(() => {
    const scroller = target?.parentElement;
    if (scroller === undefined || scroller === null) return;
    if (!open) {
      setCompactLayout(false);
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
      const dramaToolbarHeight = scroller.querySelector(".oh-drama-workspace-toolbar")?.getBoundingClientRect().height;
      if (dramaToolbarHeight !== undefined && dramaToolbarHeight > 0) {
        scroller.style.setProperty("--oh-drama-toolbar-height", `${String(Math.ceil(dramaToolbarHeight))}px`);
      } else {
        scroller.style.removeProperty("--oh-drama-toolbar-height");
      }
      const storyCompactBarHeight = scroller.querySelector(".oh-story-compact-bar")?.getBoundingClientRect().height;
      if (storyCompactBarHeight !== undefined && storyCompactBarHeight > 0) {
        scroller.style.setProperty("--oh-story-compact-bar-height", `${String(Math.ceil(storyCompactBarHeight))}px`);
      } else {
        scroller.style.removeProperty("--oh-story-compact-bar-height");
      }
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
      scroller.dataset.ohStoryFiles = storyFilesOpen ? "open" : "closed";
      const studioPane = workbench === "video" ? videoPane : workbench === "story" ? storyPane : gamePane;
      scroller.dataset.ohStudioPane = studioPane;
      const compactAt = workbench === "game" || workbench === "video" ? 720 : 620;
      const mediumAt = workbench === "game" || workbench === "video" ? 960 : 900;
      const layout = scroller.clientWidth < compactAt ? "compact" : scroller.clientWidth < mediumAt ? "medium" : "wide";
      if (scroller.dataset.ohStoryLayout !== layout) scroller.dataset.ohStoryLayout = layout;
      setCompactLayout((current) => current === (layout === "compact") ? current : layout === "compact");
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
      const dramaToolbar = scroller.querySelector(".oh-drama-workspace-toolbar");
      const storyCompactBar = scroller.querySelector(".oh-story-compact-bar");
      for (const pane of [composerSeat(), flow, dramaToolbar, storyCompactBar]) {
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
      scroller.style.removeProperty("--oh-drama-toolbar-height");
      scroller.style.removeProperty("--oh-story-compact-bar-height");
      scroller.style.removeProperty("--oh-story-composer-height");
      delete scroller.dataset.ohStoryLayout;
      delete scroller.dataset.ohStoryWorkbench;
      delete scroller.dataset.ohStudioPane;
      delete scroller.dataset.ohGameChat;
      delete scroller.dataset.ohVideoChat;
      delete scroller.dataset.ohDramaChat;
      delete scroller.dataset.ohDramaFiles;
      delete scroller.dataset.ohStoryFiles;
    };
  }, [dramaChatOpen, dramaFilesOpen, gameChatOpen, gamePane, open, storyFilesOpen, storyPane, target, videoChatOpen, videoPane, workbench]);
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
      workbench={workbench}
      workbenchModes={workbenchModes}
      error={error}
      workspaceLoading={workspaceLoading}
      reload={reload}
      open={open}
      compactLayout={compactLayout}
      creativeProject={creativeProject}
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

/**
 * Official DSH 0.2.2-rc.5 `conversation.hero.frame` HOC layer: renders WelcomeGuide directly inside
 * the standalone blank-home conversation without any `document.body` MutationObserver or portal,
 * keeping `[data-conversation-scroll]` a direct flex child of `.body`.
 */
function HeroWelcomeFrame({ hero, children }: { readonly hero: boolean; readonly children?: ReactNode }) {
  useWorkbenchStylesheet();
  const welcomeController = activeWelcomeGuideController;
  const welcomeSnapshot = useSyncExternalStore(welcomeController.subscribe, welcomeController.getSnapshot, welcomeController.getSnapshot);
  const sessionHero = useSyncExternalStore(subscribeHeroWelcome, getHeroWelcomeSnapshot, getHeroWelcomeSnapshot);
  useEffect(() => {
    if (hero) welcomeController.ensureFallbackHostConfig();
  }, [hero, welcomeController]);
  const welcomeEnabled = resolveWelcomeGuideEnabled({
    formStatus: welcomeSnapshot.formStatus,
    hostValue: welcomeSnapshot.hostValue,
    writable: welcomeSnapshot.writable,
    optimisticValue: welcomeSnapshot.optimisticValue,
    localPreference: welcomeSnapshot.localPreference,
    workspaceWelcomeGuide: sessionHero.workspaceWelcomeGuide ?? welcomeSnapshot.fallbackHostValue
  });
  const showWelcome = hero && !sessionHero.suppress && welcomeEnabled;
  return <>
    {showWelcome && <WelcomeGuide
      dismissing={welcomeSnapshot.saving}
      onDismiss={() => { void welcomeController.setEnabled(false); }}
    />}
    {children}
  </>;
}

function WorkbenchSeat({ SessionProvider, renderSlot }: WorkbenchSeatProps) {
  return <SessionProvider empty={() => null}>{renderSlot("oh-story.workspace", {})}</SessionProvider>;
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
    <OnceWorkbenchStylesheet />
    <summary><span>✦ Role</span><strong>{role}</strong><em>{state === "running" ? "运行中" : state === "error" ? "失败" : "完成"}</em></summary>
    {output !== undefined && <pre>{output}</pre>}
    {inspect !== undefined && <button type="button" onClick={inspect}>在轨迹中检查</button>}
  </details>;
}

function ProductionToolView({ block, inspect }: ToolCallViewProps) {
  const args = argsOf(block);
  const action = typeof args.action === "string" ? args.action : "production";
  const episode = typeof args.episode === "string" ? args.episode : "短剧";
  const output = resultOf(block);
  const state = !("kind" in block) ? "running" : block.isError ? "error" : "done";
  return <details className="oh-story-role" data-state={state}>
    <OnceWorkbenchStylesheet />
    <summary><span>▦ 生产</span><strong>{episode} · {action}</strong><em>{state === "running" ? "执行中" : state === "error" ? "失败" : "已应用"}</em></summary>
    {output !== undefined && <pre>{output}</pre>}
    {inspect !== undefined && <button type="button" onClick={inspect}>在轨迹中检查</button>}
  </details>;
}

/** Register only official DSH surfaces; the split bridge never replaces Chat. */
export function apply(context: ClientContext): void {
  const controller = new WelcomeGuideController();
  activeWelcomeGuideController = controller;
  void context.inject(["configForms"], (child) => {
    const configForms = child.get("configForms") as ConfigFormsService | undefined;
    if (configForms === undefined) return;
    const form = configForms.get("oh-story");
    child.effect(() => controller.connectForm(form));
  });
  context.slots.inject("plugins.bundle.config", () => context.slots.register({
    name: "plugins.bundle.config",
    key: "@oh-story/dsh"
  }, ({ view }) => <><OnceWorkbenchStylesheet /><OhStoryPluginConfig view={view} controller={controller} /></>));
  context.slots.inject("conversation.hero.frame", () => context.slots.register({
    name: "conversation.hero.frame",
    id: "oh-story-welcome"
  }, HeroWelcomeFrame));
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
