/** What the out-of-band probe learned about the build the frame is showing. */
export type PreviewProbeResult = "pending" | "ok" | "failed";

export interface GamePreviewObservation {
  /** The iframe fired `load`. It also fires for an HTTP error page, so it never proves the build works. */
  readonly frameLoaded: boolean;
  readonly frameError: boolean;
  readonly probe: PreviewProbeResult;
  /** The Agent is writing into this project's files right now. */
  readonly building: boolean;
  /** A newer build exists than the one the creator accepted. */
  readonly pending: boolean;
  readonly isolated: boolean;
  /** Optional runtime JS error or resource failure reported from the preview frame. */
  readonly runtimeError?: string | null | undefined;
}

export interface GamePreviewStatus {
  readonly tone: "error" | "building" | "ready" | "loading";
  readonly label: string;
}

export interface GamePreviewErrorPayload {
  readonly type?: unknown;
  readonly message?: unknown;
  readonly filename?: unknown;
  readonly lineno?: unknown;
  readonly colno?: unknown;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

export function normalizeRuntimeError(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed.slice(0, 400);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const payload = value as GamePreviewErrorPayload;
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (message === "") return null;
  const filename = typeof payload.filename === "string" ? payload.filename.trim() : "";
  const lineno = positiveInteger(payload.lineno);
  const colno = positiveInteger(payload.colno);
  let location = "";
  if (filename !== "") {
    if (lineno !== undefined) {
      location = `${filename}:${String(lineno)}${colno === undefined ? "" : `:${String(colno)}`}`;
    } else if (!message.includes(filename)) {
      location = filename;
    }
  } else if (lineno !== undefined) {
    location = `line ${String(lineno)}${colno === undefined ? "" : `:${String(colno)}`}`;
  }
  const formatted = location === "" ? message : `${message} (${location})`;
  return formatted.slice(0, 400);
}

export function clearRuntimeError(): null {
  return null;
}

export function formatRuntimeErrorPrompt(projectTitle: string, runtimeError: string): string {
  return `《${projectTitle}》在游戏预览中出现运行报错，请定位并修复：\n${runtimeError}`;
}

/**
 * The status line describes the build on screen. A probe or runtime failure while the Agent rewrites
 * the files, or for a build that a newer one has already replaced, says nothing about what to
 * do next, so building and a waiting new version take precedence over a failure.
 */
export function gamePreviewStatus(state: GamePreviewObservation): GamePreviewStatus {
  const failed = state.frameError || state.probe === "failed";
  const runtimeError = normalizeRuntimeError(state.runtimeError);
  if (state.building) return { tone: "building", label: "Agent 正在更新游戏文件 · 当前预览保持不变" };
  if (state.pending) return { tone: state.frameLoaded && !failed && runtimeError === null ? "ready" : "loading", label: "新版本已就绪 · 由你决定何时载入" };
  if (failed) return { tone: "error", label: "预览载入失败 · 可重新载入" };
  if (runtimeError !== null) return { tone: "error", label: "游戏运行报错 · 可刷新或带报错去 Chat 修复" };
  if (state.frameLoaded) {
    return { tone: "ready", label: state.isolated ? "预览已载入" : "预览已载入 · 当前部署无法隔离来源，存档功能不可用" };
  }
  return { tone: "loading", label: "正在载入预览…" };
}

/**
 * The preview runs on the other loopback alias (127.0.0.1 ↔ localhost) under both http: and https:
 * so its storage is isolated from DSH. A `fetch` there is cross-site, and the route rightly refuses
 * cross-site reads, so the probe asks the same route on the page's own origin, which serves the same bytes.
 */
export function previewUrls(path: string, version: string, revision: number, origin: string): {
  readonly href: string;
  readonly probeHref: string;
  readonly isolated: boolean;
} {
  const parsedOrigin = new URL(origin);
  const url = new URL(path, parsedOrigin);
  url.searchParams.set("build", version);
  url.searchParams.set("reload", String(revision));
  const probeHref = url.toString();
  if (url.protocol === "http:" || url.protocol === "https:") {
    if (url.hostname === "127.0.0.1") url.hostname = "localhost";
    else if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  }
  return { href: url.toString(), probeHref, isolated: url.origin !== parsedOrigin.origin };
}
