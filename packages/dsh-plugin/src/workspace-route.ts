import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath as nodeRealpath, stat as nodeStat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { FsError, type FileSystem, type FsInfo, type FsTarget, type FsVersion } from "@deepseek-ai/dsh-fs";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type { SandboxPolicyService } from "@deepseek-ai/dsh-sandbox-policy";
import { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-typert-registry";
import {
  CREATIVE_DIRECTORIES,
  creativeRootDirectory,
  editableCreativePath,
  GAME_DIRECTORY,
  isCreativeRootPath,
  isPublishRootFile,
  pathExtension,
  ROOT_FILES,
  safeRelativePath,
  SHORT_STORY_FILES,
  SKIPPED_SCAN_DIRECTORIES,
  STORY_DIRECTORIES,
  VIDEO_DIRECTORY
} from "./creative-paths.js";
import { dramaAdapterStatuses, ensureDramaAdapterConfig, type DramaAdapterStatus } from "./drama-adapters.js";
import { commandOutput, DRAMA_PYTHON, hostPython, VIDEO_PYTHON, type PythonProbe } from "./host-python.js";
import { defaultDramaSkillRoot } from "./skill-provider.js";
import { skipVideoDirectory, summarizeVideoProject, videoProjectRoot, visibleVideoPath, type VideoProjectSummary } from "./video-project.js";
import { isTrustedPreviewAssetRequest, isTrustedWorkspaceRequest } from "./workspace-request-trust.js";

const MEDIA_TYPES: ReadonlyMap<string, string> = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".gif", "image/gif"],
  [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"], [".mkv", "video/x-matroska"],
  [".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".m4a", "audio/mp4"], [".aac", "audio/aac"], [".flac", "audio/flac"]
]);
const MEDIA_MAX_BYTES = 256 * 1_024 * 1_024;
const FILE_LIMIT = 1_000;
const MAX_WALK_DEPTH = 20;
const PREVIEW_FILE_LIMIT = 32 * 1024 * 1024;
const PREVIEW_TOKEN_TTL_SECONDS = 3_600;
const PREVIEW_TOKEN_BUCKET_SECONDS = 1_800;

let videoPreflightCache: { readonly expires: number; readonly value: VideoPreflightStatus } | undefined;
let videoPreflightInFlight: Promise<VideoPreflightStatus> | undefined;
let dramaPreflightCache: { readonly expires: number; readonly value: DramaPreflightSummary } | undefined;
let dramaPreflightInFlight: Promise<DramaPreflightSummary> | undefined;

export interface WorkspaceRouteOptions {
  readonly maxBytes: number;
  readonly trustedHosts?: readonly string[];
  readonly welcomeGuide?: () => boolean;
  /** Optional override for signed game-preview tokens (defaults to a per-mount random 32-byte key). */
  readonly previewTokenSecret?: Uint8Array;
}

/** Structural contract for DSH's `@deepseek-ai/dsh-client-connection` service. */
interface ConnectionAdmissionService {
  admit(request: { readonly headers: IncomingMessage["headers"] }):
    | { readonly peer: unknown }
    | { readonly rejection: 401 | 403 };
}

/** Host-process capability probe for Video Recap 0.8.0 (local-first; zero MiMo dependencies). */
export interface VideoPreflightStatus {
  readonly python: PythonProbe;
  readonly ffmpeg: { readonly ok: boolean; readonly subtitles: boolean };
  readonly ffprobe: { readonly ok: boolean };
  readonly tts: {
    readonly local: { readonly ok: boolean; readonly engine?: "say" | "espeak-ng" | "espeak" | undefined };
    readonly fish: boolean;
    readonly openai: boolean;
    readonly indexTts: boolean;
  };
  readonly asr: {
    readonly localWhisper: { readonly ok: boolean; readonly cli?: "whisper" | "faster-whisper" | "mlx_whisper" | "whisper-cli" | undefined };
    readonly remote: boolean;
  };
}

/**
 * Host-process view of short-drama production: which bundled media adapters
 * have their environment set, and where the adapter config the Agent passes to
 * `production_tool.py run` lives. Values never leave the process.
 */
export interface DramaPreflightSummary {
  readonly python: PythonProbe;
  readonly adapterConfig: { readonly path: string; readonly generated: boolean; readonly ok: boolean };
  readonly adapters: readonly DramaAdapterStatus[];
}

export interface WorkspaceFile {
  readonly path: string;
  readonly bytes: number;
  readonly version: string;
  readonly kind: "text" | "media";
  readonly mimeType?: string | undefined;
}

export interface GameProjectSummary {
  readonly id: string;
  readonly root: string;
  readonly title: string;
  readonly previewReady: boolean;
  readonly previewUrl?: string | undefined;
  readonly previewVersion: string;
}

export interface WorkspacePayload {
  readonly cwd: string;
  readonly files: readonly WorkspaceFile[];
  readonly truncated: boolean;
  readonly games: readonly GameProjectSummary[];
  readonly videos: readonly VideoProjectSummary[];
  readonly metadataErrors: readonly string[];
  readonly welcomeGuide: boolean;
}

export interface PreviewTokenPayload {
  readonly sessionId: string;
  readonly root: string;
  /** Expiry unix timestamp in seconds. */
  readonly exp: number;
}

/** Shape posted by the injected game preview HTML bridge via `window.parent.postMessage`. */
export interface GamePreviewErrorMessage {
  readonly type: "oh-story:game-preview-error";
  readonly message: string;
  readonly filename?: string | undefined;
  readonly lineno?: number | undefined;
  readonly colno?: number | undefined;
}

interface WorkspaceRealm {
  readonly sessionId: string;
  readonly agent: Agent;
  readonly fs: FileSystem;
  readonly sandboxPolicy: SandboxPolicyService;
  readonly cwd: string;
  readonly root: FsTarget;
}

interface ReadFileResult {
  readonly content: string;
  readonly bytes: number;
  readonly version: FsVersion;
}

class WorkspaceHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function configured(env: NodeJS.ProcessEnv, ...names: readonly string[]): boolean {
  return names.some((name) => (env[name] ?? "").trim() !== "");
}

function resetPreflightCaches(): void {
  videoPreflightCache = undefined;
  videoPreflightInFlight = undefined;
  dramaPreflightCache = undefined;
  dramaPreflightInFlight = undefined;
}

export function createPreviewTokenSecret(): Buffer {
  return randomBytes(32);
}

/**
 * Mint a short-lived HMAC-SHA256 signed capability token bound to `{ sessionId, root, exp }`.
 * By default `exp` is quantized to 30-minute buckets (yielding 30–60 min validity) so periodic
 * `/oh-story/workspace` polls keep a stable `previewUrl` and never reload an active game iframe.
 */
export function mintPreviewToken(
  secret: Uint8Array,
  input: { readonly sessionId: string; readonly root: string; readonly exp?: number | undefined },
  nowMs = Date.now()
): string {
  if (input.sessionId === "" || !gameRoot(input.root)) {
    throw new WorkspaceHttpError(400, "游戏预览标识无效。");
  }
  const nowSec = Math.floor(nowMs / 1_000);
  const exp = input.exp ?? (Math.floor(nowSec / PREVIEW_TOKEN_BUCKET_SECONDS) + 2) * PREVIEW_TOKEN_BUCKET_SECONDS;
  const payload = Buffer.from(JSON.stringify({ s: input.sessionId, r: input.root, exp }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest().toString("base64url");
  return `${payload}.${signature}`;
}

/** Verify a signed preview capability token with constant-time HMAC comparison and expiry check. */
export function verifyPreviewToken(tokenValue: string, secret: Uint8Array, nowMs = Date.now()): PreviewTokenPayload {
  const parts = tokenValue.split(".");
  if (parts.length !== 2) throw new WorkspaceHttpError(403, "游戏预览令牌无效。");
  const [payloadB64, sigB64] = parts;
  if (
    payloadB64 === undefined || sigB64 === undefined
    || !/^[A-Za-z0-9_-]+$/u.test(payloadB64)
    || !/^[A-Za-z0-9_-]+$/u.test(sigB64)
  ) {
    throw new WorkspaceHttpError(403, "游戏预览令牌无效。");
  }
  const expected = createHmac("sha256", secret).update(payloadB64).digest();
  const actual = Buffer.from(sigB64, "base64url");
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    throw new WorkspaceHttpError(403, "游戏预览令牌签名无效。");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new WorkspaceHttpError(403, "游戏预览令牌格式无效。");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new WorkspaceHttpError(403, "游戏预览令牌格式无效。");
  }
  const record = parsed as Record<string, unknown>;
  const sessionId = record.s;
  const root = record.r;
  const exp = record.exp;
  if (
    typeof sessionId !== "string" || sessionId === ""
    || typeof root !== "string" || !gameRoot(root)
    || typeof exp !== "number" || !Number.isSafeInteger(exp)
  ) {
    throw new WorkspaceHttpError(403, "游戏预览令牌内容无效。");
  }
  if (exp * 1_000 <= nowMs) {
    throw new WorkspaceHttpError(401, "游戏预览令牌已过期，请刷新工作区。");
  }
  if (exp - Math.floor(nowMs / 1_000) > PREVIEW_TOKEN_TTL_SECONDS * 24) {
    throw new WorkspaceHttpError(403, "游戏预览令牌有效期异常。");
  }
  return { sessionId, root, exp };
}

async function dramaPreflight(): Promise<DramaPreflightSummary> {
  if (dramaPreflightCache !== undefined && dramaPreflightCache.expires > Date.now()) return dramaPreflightCache.value;
  // One probe per cache miss: concurrent requests share the write instead of
  // racing it, and the write itself is atomic (temp file + rename).
  dramaPreflightInFlight ??= (async () => {
    try {
      const python = await hostPython(DRAMA_PYTHON);
      const adapterConfig = await ensureDramaAdapterConfig(defaultDramaSkillRoot(), { python: python.command });
      const value: DramaPreflightSummary = { python: python.probe, adapterConfig, adapters: dramaAdapterStatuses() };
      dramaPreflightCache = { expires: Date.now() + 30_000, value };
      return value;
    } finally { dramaPreflightInFlight = undefined; }
  })();
  return dramaPreflightInFlight;
}

async function commandExistsOnPath(
  name: string,
  probeCommand: (command: string, args: readonly string[]) => Promise<string | undefined>,
  platform: NodeJS.Platform
): Promise<boolean> {
  const locator = platform === "win32" ? "where" : "which";
  const output = await probeCommand(locator, [name]);
  return output !== undefined && output.trim() !== "";
}

/**
 * Pure, testable Video Recap 0.8.0 host capability probe.
 * Probes local必需 tools (Python 3.10+, ffmpeg+libass, ffprobe) plus optional
 * offline/cloud TTS and local Whisper / remote ASR backends.
 */
export async function probeVideoPreflight(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly probeCommand?: (command: string, args: readonly string[]) => Promise<string | undefined>;
} = {}): Promise<VideoPreflightStatus> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const probeCommand = options.probeCommand ?? commandOutput;
  const has = (name: string): Promise<boolean> => commandExistsOnPath(name, probeCommand, platform);

  const [
    pythonResult,
    ffmpegOutput,
    ffmpegFilters,
    ffprobeOutput,
    hasSay,
    hasEspeakNg,
    hasEspeak,
    hasWhisper,
    hasFasterWhisper,
    hasMlxWhisper,
    hasWhisperCli
  ] = await Promise.all([
    hostPython(VIDEO_PYTHON, probeCommand),
    probeCommand("ffmpeg", ["-version"]),
    probeCommand("ffmpeg", ["-hide_banner", "-filters"]),
    probeCommand("ffprobe", ["-version"]),
    platform === "darwin" ? has("say") : Promise.resolve(false),
    has("espeak-ng"),
    has("espeak"),
    has("whisper"),
    has("faster-whisper"),
    has("mlx_whisper"),
    has("whisper-cli")
  ]);

  const localTtsEngine: "say" | "espeak-ng" | "espeak" | undefined = hasSay ? "say"
    : hasEspeakNg ? "espeak-ng"
      : hasEspeak ? "espeak"
        : undefined;
  const whisperCliReady = hasWhisperCli && configured(env, "WHISPER_MODEL_PATH");
  const localWhisperCli: "whisper" | "faster-whisper" | "mlx_whisper" | "whisper-cli" | undefined = hasWhisper ? "whisper"
    : hasFasterWhisper ? "faster-whisper"
      : hasMlxWhisper ? "mlx_whisper"
        : whisperCliReady ? "whisper-cli"
          : undefined;

  return {
    python: pythonResult.probe,
    ffmpeg: { ok: ffmpegOutput !== undefined, subtitles: /\bsubtitles\b/u.test(ffmpegFilters ?? "") },
    ffprobe: { ok: ffprobeOutput !== undefined },
    tts: {
      local: { ok: localTtsEngine !== undefined, engine: localTtsEngine },
      fish: configured(env, "FISH_API_KEY", "FISH_AUDIO_API_KEY"),
      openai: configured(env, "OPENAI_API_KEY"),
      indexTts: configured(env, "INDEX_TTS_ENDPOINT") && configured(env, "INDEX_TTS_VOICE")
    },
    asr: {
      localWhisper: { ok: localWhisperCli !== undefined, cli: localWhisperCli },
      remote: configured(env, "ASR_API_URL") && configured(env, "ASR_API_KEY")
    }
  };
}

async function videoPreflight(): Promise<VideoPreflightStatus> {
  if (videoPreflightCache !== undefined && videoPreflightCache.expires > Date.now()) return videoPreflightCache.value;
  videoPreflightInFlight ??= (async () => {
    try {
      const value = await probeVideoPreflight();
      videoPreflightCache = { expires: Date.now() + 30_000, value };
      return value;
    } finally { videoPreflightInFlight = undefined; }
  })();
  return videoPreflightInFlight;
}

function send(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

export interface ByteRange { readonly start: number; readonly end: number }

/**
 * RFC 9110 14.2: a Range this server cannot parse or does not support is ignored (`undefined`, full
 * 200 response); only a well-formed but unsatisfiable range earns a 416 (`null`).
 */
export function parseByteRange(value: string | undefined, size: number): ByteRange | undefined | null {
  const match = value === undefined ? null : /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (match === null) return undefined;
  const left = match[1] ?? "";
  const right = match[2] ?? "";
  if (left === "") {
    const suffix = Number(right);
    if (right === "" || !Number.isSafeInteger(suffix)) return undefined;
    return suffix === 0 || size <= 0 ? null : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(left);
  const requestedEnd = right === "" ? Number.MAX_SAFE_INTEGER : Number(right);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || requestedEnd < start) return undefined;
  return start >= size ? null : { start, end: Math.min(requestedEnd, size - 1) };
}

function mediaHeaders(
  mimeType: string,
  size: number,
  range: ByteRange | undefined,
  extraHeaders: Readonly<Record<string, string | number>> = {}
): Record<string, string | number> {
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  return {
    "content-type": mimeType,
    "content-length": Math.max(0, end - start + 1),
    "cache-control": "private, max-age=60",
    "accept-ranges": "bytes",
    ...(range === undefined ? {} : { "content-range": `bytes ${String(start)}-${String(end)}/${String(size)}` }),
    "x-content-type-options": "nosniff",
    ...extraHeaders
  };
}

function sendMediaBytes(
  request: IncomingMessage,
  response: ServerResponse,
  bytes: Uint8Array,
  mimeType: string,
  extraHeaders: Readonly<Record<string, string | number>> = {}
): void {
  const range = parseByteRange(typeof request.headers.range === "string" ? request.headers.range : undefined, bytes.byteLength);
  if (range === null) {
    response.writeHead(416, { "content-range": `bytes */${String(bytes.byteLength)}`, "cache-control": "no-store", ...extraHeaders });
    response.end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? bytes.byteLength - 1;
  const body = bytes.subarray(start, end + 1);
  response.writeHead(range === undefined ? 200 : 206, mediaHeaders(mimeType, bytes.byteLength, range, extraHeaders));
  response.end(request.method === "HEAD" ? undefined : Buffer.from(body));
}

/**
 * Resolve the target to a path this web host may open directly, or `undefined` when it may not.
 * `processPath` is canonical in the backend's execution world, which is not necessarily this
 * process's, so containment is re-checked against the host-visible workspace root: a remote path
 * that happens to exist locally never becomes a stream.
 */
async function hostWorkspaceFile(realm: WorkspaceRealm, target: FsTarget, expectedSize: number): Promise<string | undefined> {
  const [root, path] = await Promise.all([
    nodeRealpath(realm.fs.processPath(realm.root)),
    nodeRealpath(realm.fs.processPath(target))
  ]);
  const inside = relative(root, path);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return undefined;
  const local = await nodeStat(path);
  return local.isFile() && local.size === expectedSize ? path : undefined;
}

async function sendWorkspaceMedia(
  request: IncomingMessage,
  response: ServerResponse,
  realm: WorkspaceRealm,
  target: FsTarget,
  info: FsInfo,
  mimeType: string,
  signal: AbortSignal,
  extraHeaders: Readonly<Record<string, string | number>> = {},
  maxBytes = MEDIA_MAX_BYTES
): Promise<void> {
  const expectedSize = info.size;
  if (expectedSize !== undefined) {
    const range = parseByteRange(typeof request.headers.range === "string" ? request.headers.range : undefined, expectedSize);
    if (range === null) {
      response.writeHead(416, { "content-range": `bytes */${String(expectedSize)}`, "cache-control": "no-store", ...extraHeaders });
      response.end();
      return;
    }
    // A remote filesystem may expose a process path this web host cannot read; stream locally when
    // host-visible, otherwise fall back to DSH's bounded byte-range / binary API.
    const processPath = await hostWorkspaceFile(realm, target, expectedSize).catch(() => undefined);
    if (processPath !== undefined) {
      response.writeHead(range === undefined ? 200 : 206, mediaHeaders(mimeType, expectedSize, range, extraHeaders));
      if (request.method === "HEAD") { response.end(); return; }
      const stream = createReadStream(processPath, range === undefined ? undefined : { start: range.start, end: range.end });
      response.once("close", () => { if (!response.writableEnded) stream.destroy(); });
      stream.on("error", () => { if (!response.headersSent) response.destroy(); else response.end(); });
      stream.pipe(response);
      return;
    }
    if (request.method === "HEAD") {
      response.writeHead(range === undefined ? 200 : 206, mediaHeaders(mimeType, expectedSize, range, extraHeaders));
      response.end();
      return;
    }
    if (range !== undefined && typeof realm.fs.readByteRange === "function") {
      const length = range.end - range.start + 1;
      if (length > maxBytes) throw new WorkspaceHttpError(413, "远程媒体分段超过工作台预览大小限制。");
      const chunk = await realm.fs.readByteRange(target, { offset: range.start, length }, signal);
      response.writeHead(206, mediaHeaders(mimeType, expectedSize, range, extraHeaders));
      response.end(Buffer.from(chunk));
      return;
    }
    if (expectedSize > maxBytes) throw new WorkspaceHttpError(413, "远程媒体超过工作台回退预览大小限制。");
  }
  sendMediaBytes(request, response, await realm.fs.readBytes(target, signal, maxBytes), mimeType, extraHeaders);
}

async function jsonBody(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    const value = Buffer.from(chunk);
    size += value.byteLength;
    if (size > maxBytes) throw new WorkspaceHttpError(413, "请求内容过大。");
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new WorkspaceHttpError(400, "请求必须是 JSON 对象。");
  }
}

export function assertCreativePath(path: string, kind: "text" | "media"): void {
  if (kind === "text" ? !editableCreativePath(path) : !MEDIA_TYPES.has(pathExtension(path))) {
    throw new WorkspaceHttpError(415, kind === "text" ? "工作台不支持编辑该文件类型。" : "目标不是受支持的短剧媒体文件。");
  }
  if (!safeRelativePath(path) || !isCreativeRootPath(path)) {
    throw new WorkspaceHttpError(403, "文件路径不在创作工作台中。");
  }
}

export function mediaMimeTypeForPath(path: string): string | undefined {
  return MEDIA_TYPES.get(pathExtension(path));
}

async function workspaceRealmForSession(context: Context, rawId: string, signal?: AbortSignal): Promise<WorkspaceRealm> {
  if (rawId === "") throw new WorkspaceHttpError(400, "缺少 DSH sessionId。");
  const lookup = context.typert.lookups.get("agent");
  if (lookup === undefined) throw new WorkspaceHttpError(503, "DSH Agent lookup 当前不可用。");
  let agent: Agent | undefined;
  try {
    agent = await lookup.resolve(SessionId(rawId)) as Agent | undefined;
  } catch {
    throw new WorkspaceHttpError(404, "DSH 会话不可用。");
  }
  if (agent === undefined) throw new WorkspaceHttpError(404, "DSH 会话不可用。");
  if (agent.session.header.parentSession !== undefined || agent.session.header.origin === "subagent") {
    throw new WorkspaceHttpError(403, "子 Agent 会话不开放创作编辑器。");
  }
  const cwd = agent.session.header.cwd;
  if (cwd === undefined) throw new WorkspaceHttpError(409, "当前 DSH 会话没有工作目录。");
  const fs = agent.ctx.get("fs");
  const sandboxPolicy = agent.ctx.get("sandboxPolicy");
  if (fs === undefined || sandboxPolicy === undefined) throw new WorkspaceHttpError(503, "DSH 文件系统当前不可用。");
  return { sessionId: rawId, agent, fs, sandboxPolicy, cwd, root: await fs.resolve(cwd, signal === undefined ? undefined : { signal }) };
}

async function workspaceRealm(context: Context, url: URL, signal?: AbortSignal): Promise<WorkspaceRealm> {
  const rawId = url.searchParams.get("sessionId");
  if (rawId === null) throw new WorkspaceHttpError(400, "缺少 DSH sessionId。");
  return workspaceRealmForSession(context, rawId, signal);
}

/** Reject any symlink component along `relativePath` before resolving it. */
async function assertNoSymlinkSegments(realm: WorkspaceRealm, relativePath: string, signal?: AbortSignal): Promise<void> {
  if (typeof realm.fs.lstat !== "function") return;
  const parts = relativePath.split("/");
  const prefixes: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    prefixes.push(parts.slice(0, index + 1).join("/"));
  }
  const results = await Promise.all(prefixes.map((prefix) => realm.fs.lstat(prefix, { cwd: realm.cwd }, signal)));
  if (results.some((info) => info?.type === "symlink")) {
    throw new WorkspaceHttpError(403, "工作台不允许访问符号链接路径。");
  }
}

async function creativeTarget(realm: WorkspaceRealm, path: string, kind: "text" | "media" = "text", signal?: AbortSignal): Promise<FsTarget> {
  assertCreativePath(path, kind);
  await assertNoSymlinkSegments(realm, path, signal);
  const creativeRootPath = creativeRootDirectory(path);
  if (creativeRootPath === undefined) throw new WorkspaceHttpError(403, "文件路径不在创作工作台中。");
  const resolveOpts = signal === undefined ? { cwd: realm.cwd } : { cwd: realm.cwd, signal };
  const [creativeRoot, target] = await Promise.all([
    creativeRootPath === "" ? Promise.resolve(realm.root) : realm.fs.resolve(creativeRootPath, resolveOpts),
    realm.fs.resolve(path, resolveOpts)
  ]);
  if (!realm.fs.contains(realm.root, creativeRoot) || !realm.fs.contains(creativeRoot, target)) {
    throw new WorkspaceHttpError(403, "文件路径离开了创作工作台目录。");
  }
  return target;
}

function requireRegularFile(info: FsInfo | undefined): FsInfo {
  if (info === undefined) throw new WorkspaceHttpError(404, "文件不存在。");
  if (info.type !== "file") throw new WorkspaceHttpError(415, "目标不是可编辑的普通文件。");
  return info;
}

/** Read bytes and a matching opaque version, retrying if a writer wins the read window. */
async function readVersionedFile(fs: FileSystem, target: FsTarget, maxBytes: number, signal?: AbortSignal): Promise<ReadFileResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = requireRegularFile(await fs.stat(target, signal));
    if (before.size !== undefined && before.size > maxBytes) throw new WorkspaceHttpError(413, "文件超过工作台大小限制。");
    const bytes = await fs.readBytes(target, signal, maxBytes);
    const after = requireRegularFile(await fs.stat(target, signal));
    if (before.version !== after.version) continue;
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new WorkspaceHttpError(415, "文件不是有效的 UTF-8 文本。");
    }
    return { content, bytes: bytes.byteLength, version: after.version };
  }
  throw new WorkspaceHttpError(409, "文件正在被修改，请重试。");
}

async function isNovelBookDirectory(realm: WorkspaceRealm, bookTarget: FsTarget, signal?: AbortSignal): Promise<boolean> {
  const entries = await realm.fs.listDir(bookTarget, signal).catch(() => []);
  const dirs = new Set(entries.filter((entry) => entry.type === "directory").map((entry) => entry.name));
  const files = new Set(entries.filter((entry) => entry.type === "file").map((entry) => entry.name));
  if (dirs.has("正文") || dirs.has("追踪") || dirs.has("大纲") || files.has("正文.md")) return true;
  if (files.has("设定.md") && files.has("小节大纲.md")) return true;
  if (dirs.has("设定")) {
    const settingTarget = entries.find((entry) => entry.type === "directory" && entry.name === "设定")?.target;
    if (settingTarget !== undefined) {
      const settingEntries = await realm.fs.listDir(settingTarget, signal).catch(() => []);
      if (settingEntries.some((entry) => entry.type === "file" && entry.name === "题材定位.md")) return true;
    }
  }
  return false;
}

async function listFiles(realm: WorkspaceRealm, signal?: AbortSignal): Promise<{ readonly files: WorkspaceFile[]; readonly truncated: boolean }> {
  const files: WorkspaceFile[] = [];
  const seenFiles = new Set<string>();
  const visitedDirs = new Set<string>([realm.root.targetKey]);
  let truncated = false;

  const pushFile = (entry: WorkspaceFile): boolean => {
    if (seenFiles.has(entry.path)) return true;
    if (files.length >= FILE_LIMIT) {
      truncated = true;
      return false;
    }
    seenFiles.add(entry.path);
    files.push(entry);
    return true;
  };

  const walk = async (path: string, directory: FsTarget, depth: number): Promise<void> => {
    if (truncated || depth > MAX_WALK_DEPTH || visitedDirs.has(directory.targetKey)) return;
    visitedDirs.add(directory.targetKey);
    const entries = await realm.fs.listDir(directory, signal);
    for (const entry of entries) {
      if (truncated) return;
      if (entry.name.startsWith(".") || SKIPPED_SCAN_DIRECTORIES.has(entry.name) || !realm.fs.contains(realm.root, entry.target)) continue;
      const childPath = `${path}/${entry.name}`;
      if (entry.type === "directory") {
        if (!skipVideoDirectory(childPath)) await walk(childPath, entry.target, depth + 1);
      } else if (entry.type === "file" && (editableCreativePath(childPath) || MEDIA_TYPES.has(pathExtension(entry.name)))) {
        const info = entry.version === undefined || entry.size === undefined ? await realm.fs.stat(entry.target, signal) : undefined;
        const version = entry.version ?? info?.version;
        const mimeType = MEDIA_TYPES.get(pathExtension(entry.name));
        if (version !== undefined && (!childPath.startsWith(`${VIDEO_DIRECTORY}/`) || visibleVideoPath(childPath))) {
          if (!pushFile({ path: childPath, bytes: entry.size ?? info?.size ?? 0, version, kind: mimeType === undefined ? "text" : "media", mimeType })) {
            return;
          }
        }
      }
    }
  };

  const resolveOpts = signal === undefined ? { cwd: realm.cwd } : { cwd: realm.cwd, signal };
  for (const directory of CREATIVE_DIRECTORIES) {
    if (truncated) break;
    const target = await realm.fs.resolve(directory, resolveOpts);
    if (!realm.fs.contains(realm.root, target)) continue;
    const info = await realm.fs.stat(target, signal);
    if (info?.type === "directory") await walk(directory, target, 1);
  }

  // Discover multi-book novel subdirectories (2nd-level `{书名}/正文/` etc., plus `.active-book`).
  const bookRoots = new Set<string>();
  const activeBookRaw = await workspaceText(realm, ".active-book", 4_096, signal).catch(() => undefined);
  const activeBook = activeBookRaw?.trim().replaceAll("\\", "/").replace(/\/+$/u, "");
  if (activeBook !== undefined && activeBook !== "" && !activeBook.includes("/") && safeRelativePath(activeBook) && !SKIPPED_SCAN_DIRECTORIES.has(activeBook)) {
    bookRoots.add(activeBook);
  }
  const rootEntries = await realm.fs.listDir(realm.root, signal).catch(() => []);
  const creativeDirSet = new Set<string>(CREATIVE_DIRECTORIES);
  for (const entry of rootEntries) {
    if (truncated) break;
    if (entry.name.startsWith(".") || SKIPPED_SCAN_DIRECTORIES.has(entry.name) || !realm.fs.contains(realm.root, entry.target)) continue;
    if (entry.type === "file" && isPublishRootFile(entry.name)) {
      const info = entry.version === undefined || entry.size === undefined ? await realm.fs.stat(entry.target, signal) : undefined;
      const version = entry.version ?? info?.version;
      if (version !== undefined) pushFile({ path: entry.name, bytes: entry.size ?? info?.size ?? 0, version, kind: "text" });
    } else if (entry.type === "directory" && !creativeDirSet.has(entry.name)) {
      if (bookRoots.has(entry.name) || await isNovelBookDirectory(realm, entry.target, signal)) {
        bookRoots.add(entry.name);
      }
    }
  }

  for (const book of [...bookRoots].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))) {
    if (truncated) break;
    const bookTarget = await realm.fs.resolve(book, resolveOpts).catch(() => undefined);
    if (bookTarget === undefined || !realm.fs.contains(realm.root, bookTarget)) continue;
    const bookEntries = await realm.fs.listDir(bookTarget, signal).catch(() => []);
    const storyDirSet = new Set<string>(STORY_DIRECTORIES);
    const shortFileSet = new Set<string>(SHORT_STORY_FILES);
    for (const entry of bookEntries) {
      if (truncated) break;
      if (entry.name.startsWith(".") || SKIPPED_SCAN_DIRECTORIES.has(entry.name) || !realm.fs.contains(bookTarget, entry.target)) continue;
      const childPath = `${book}/${entry.name}`;
      if (entry.type === "directory" && storyDirSet.has(entry.name)) {
        await walk(childPath, entry.target, 2);
      } else if (entry.type === "file" && (shortFileSet.has(entry.name) || isPublishRootFile(entry.name))) {
        const info = entry.version === undefined || entry.size === undefined ? await realm.fs.stat(entry.target, signal) : undefined;
        const version = entry.version ?? info?.version;
        if (version !== undefined) pushFile({ path: childPath, bytes: entry.size ?? info?.size ?? 0, version, kind: "text" });
      }
    }
  }

  for (const path of ROOT_FILES) {
    if (truncated) break;
    const target = await creativeTarget(realm, path, "text", signal).catch(() => undefined);
    if (target === undefined) continue;
    const info = await realm.fs.stat(target, signal);
    if (info?.type === "file") pushFile({ path, bytes: info.size ?? 0, version: info.version, kind: "text" });
  }
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN")),
    truncated
  };
}

async function metadataError(realm: WorkspaceRealm, files: readonly WorkspaceFile[], path: string, maxBytes: number, signal?: AbortSignal): Promise<string | undefined> {
  if (!files.some((file) => file.path === path)) return undefined;
  try {
    const target = await creativeTarget(realm, path, "text", signal);
    JSON.parse((await readVersionedFile(realm.fs, target, maxBytes, signal)).content);
    return undefined;
  } catch (error) {
    return error instanceof SyntaxError ? `${path} 不是有效的 JSON。` : `${path} 暂时无法读取。`;
  }
}

export function gameRoot(path: string): boolean {
  // Reject only what is actually unsafe; fs.resolve + fs.contains remain the real boundary.
  // A stricter slug allowlist silently hid legitimate project names (spaces, ·, leading _, NFD).
  const parts = path.split("/");
  const name = parts[1];
  return parts.length === 2 && parts[0] === GAME_DIRECTORY && name !== undefined
    && name !== "" && name !== "." && name !== ".." && name.length <= 128
    && !name.startsWith(".") && !name.includes("\\");
}

async function workspaceText(realm: WorkspaceRealm, path: string, maxBytes: number, signal?: AbortSignal): Promise<string | undefined> {
  const target = await realm.fs.resolve(path, signal === undefined ? { cwd: realm.cwd } : { cwd: realm.cwd, signal });
  if (!realm.fs.contains(realm.root, target) || (await realm.fs.stat(target, signal))?.type !== "file") return undefined;
  return (await readVersionedFile(realm.fs, target, maxBytes, signal)).content;
}

async function previewDigest(realm: WorkspaceRealm, projectRoot: string, signal?: AbortSignal): Promise<{ readonly ready: boolean; readonly version: string }> {
  const appPath = `${projectRoot}/build/app`;
  const app = await realm.fs.resolve(appPath, signal === undefined ? { cwd: realm.cwd } : { cwd: realm.cwd, signal });
  if (!realm.fs.contains(realm.root, app) || (await realm.fs.stat(app, signal))?.type !== "directory") return { ready: false, version: "missing" };
  const entries: string[] = [];
  const visited = new Set<string>();
  let ready = false;
  const visit = async (directory: FsTarget, path: string, depth: number): Promise<void> => {
    if (depth > MAX_WALK_DEPTH || visited.has(directory.targetKey)) return;
    visited.add(directory.targetKey);
    for (const entry of await realm.fs.listDir(directory, signal)) {
      if (entry.name.startsWith(".") || SKIPPED_SCAN_DIRECTORIES.has(entry.name) || !realm.fs.contains(app, entry.target)) continue;
      const childPath = path === "" ? entry.name : `${path}/${entry.name}`;
      if (entry.type === "directory") await visit(entry.target, childPath, depth + 1);
      else if (entry.type === "file") {
        const info = entry.version === undefined ? await realm.fs.stat(entry.target, signal) : undefined;
        const version = entry.version ?? info?.version;
        if (version !== undefined) entries.push(`${childPath}\0${version}`);
        if (childPath === "index.html") ready = true;
      }
      if (entries.length >= 5_000) return;
    }
  };
  await visit(app, "", 0);
  return { ready, version: createHash("sha256").update(entries.sort().join("\n")).digest("hex").slice(0, 16) };
}

/**
 * The game's name from its brief's first heading, e.g. `# PRODUCT_BRIEF — 《雪夜渡》` → `雪夜渡`.
 * The Studio adds its own 书名号 and separators, so neither the file label nor the work's
 * 书名号 belong in the name.
 */
export function gameProjectTitle(content: string | undefined, fallback: string): string {
  const heading = content?.split(/\r?\n/u).find((line) => /^#\s+/u.test(line));
  const title = heading?.replace(/^#\s+/u, "")
    .replace(/^(?:PRODUCT[_ ]BRIEF|产品简报)/iu, "")
    .replace(/^[\s·・:：|—–-]+/u, "")
    .trim()
    .replace(/^《([^《》]+)》$/u, "$1")
    .trim();
  return title || fallback;
}

async function workspaceGameProjects(
  realm: WorkspaceRealm,
  files: readonly WorkspaceFile[],
  maxBytes: number,
  previewSecret: Uint8Array,
  signal?: AbortSignal
): Promise<GameProjectSummary[]> {
  const roots = [...new Set(files.flatMap((file) => {
    const parts = file.path.split("/");
    return parts[0] === GAME_DIRECTORY && parts[1] !== undefined ? [`${GAME_DIRECTORY}/${parts[1]}`] : [];
  }))].filter(gameRoot).sort();
  return Promise.all(roots.map(async (root) => {
    const id = root.slice(`${GAME_DIRECTORY}/`.length);
    // Isolate per-project metadata failures: an unreadable brief or a build/app subtree removed
    // mid-rebuild must degrade this one card, never abort the shared workspace listing.
    const [brief, preview] = await Promise.all([
      workspaceText(realm, `${root}/PRODUCT_BRIEF.md`, maxBytes, signal).catch(() => undefined),
      previewDigest(realm, root, signal).catch(() => ({ ready: false, version: "unavailable" }))
    ]);
    return {
      id,
      root,
      title: gameProjectTitle(brief, id),
      previewReady: preview.ready,
      previewUrl: preview.ready
        ? `/oh-story/game-preview/${mintPreviewToken(previewSecret, { sessionId: realm.sessionId, root })}/index.html`
        : undefined,
      previewVersion: preview.version
    };
  }));
}

async function workspaceVideoProjects(realm: WorkspaceRealm, files: readonly WorkspaceFile[], maxBytes: number, signal?: AbortSignal): Promise<VideoProjectSummary[]> {
  const roots = [...new Set(files.flatMap((file) => {
    const root = videoProjectRoot(file.path);
    return root === undefined ? [] : [root];
  }))].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  return Promise.all(roots.map(async (root) => {
    const findPath = (name: string): string | undefined => {
      const matches = files.filter((file) => file.path.startsWith(`${root}/`) && file.path.split("/").at(-1) === name);
      return matches.length === 1 ? matches[0]?.path : undefined;
    };
    const readTextFile = async (name: string): Promise<string | undefined> => {
      const path = findPath(name);
      if (path === undefined) return undefined;
      return workspaceText(realm, path, maxBytes, signal).catch(() => undefined);
    };
    const readJson = async (name: string): Promise<unknown> => {
      const content = await readTextFile(name);
      if (content === undefined) return undefined;
      try { return JSON.parse(content) as unknown; }
      catch { return undefined; }
    };
    const [
      project,
      runManifest,
      assembly,
      narration,
      validatedClips,
      visualAudioBoard,
      storyPlan,
      timeline,
      qualityCheck,
      storyboard,
      script
    ] = await Promise.all([
      readJson("project.json"),
      readJson("recap_run_manifest.json"),
      readJson("assembly_manifest.json"),
      readJson("narration.json"),
      readJson("clip_plan_validated.json"),
      readJson("visual_audio_board.json"),
      readJson("recap_story_plan.json"),
      readJson("timeline.json"),
      readJson("check.json"),
      readTextFile("STORYBOARD.md"),
      readTextFile("SCRIPT.md")
    ]);
    return summarizeVideoProject(root, files, {
      project,
      runManifest,
      assembly,
      narration,
      validatedClips,
      visualAudioBoard,
      storyPlan,
      timeline,
      qualityCheck,
      storyboard,
      script
    });
  }));
}

export function previewContentType(path: string): string {
  switch (extname(path).toLocaleLowerCase()) {
    case ".html":
    case ".htm": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".webmanifest": return "application/manifest+json; charset=utf-8";
    case ".txt": return "text/plain; charset=utf-8";
    case ".xml": return "application/xml; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".ico": return "image/x-icon";
    case ".avif": return "image/avif";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    case ".ttf": return "font/ttf";
    case ".otf": return "font/otf";
    case ".wasm": return "application/wasm";
    case ".mp3": return "audio/mpeg";
    case ".ogg": return "audio/ogg";
    case ".wav": return "audio/wav";
    case ".m4a": return "audio/mp4";
    case ".aac": return "audio/aac";
    case ".flac": return "audio/flac";
    case ".mp4": return "video/mp4";
    case ".webm": return "video/webm";
    case ".mov": return "video/quicktime";
    case ".mkv": return "video/x-matroska";
    case ".glb": return "model/gltf-binary";
    case ".gltf": return "model/gltf+json";
    default: return "application/octet-stream";
  }
}

const GAME_PREVIEW_ERROR_BRIDGE = `<script>(function(){if(window.__ohStoryErrorBridge)return;window.__ohStoryErrorBridge=true;var post=function(m,f,l,c){try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:"oh-story:game-preview-error",message:String(m||"Unknown error").slice(0,500),filename:typeof f==="string"?f.slice(0,300):undefined,lineno:typeof l==="number"&&isFinite(l)?l:undefined,colno:typeof c==="number"&&isFinite(c)?c:undefined},"*");}}catch(_){}};window.addEventListener("error",function(e){if(!e)return;var t=e.target;if(t&&t!==window&&(t.src||t.href)){post("Resource failed to load: "+(t.src||t.href),t.src||t.href);return;}post(e.message||(e.error&&e.error.message)||"Script error",e.filename,e.lineno,e.colno);},true);window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;post(r&&typeof r==="object"&&"message"in r?r.message:String(r||"Unhandled promise rejection"));});})();</script>`;

/**
 * Inject a tiny read-only runtime error bridge into preview HTML documents so the parent
 * Game Studio can surface uncaught JS errors and subresource load failures without blocking
 * game execution or exposing secrets.
 */
export function injectGamePreviewErrorBridge(html: string): string {
  if (html.includes("__ohStoryErrorBridge")) return html;
  const closeHead = /<\/head>/iu.exec(html);
  if (closeHead !== null) {
    return `${html.slice(0, closeHead.index)}${GAME_PREVIEW_ERROR_BRIDGE}${html.slice(closeHead.index)}`;
  }
  const doctype = /^<!doctype[^>]*>\s*/iu.exec(html);
  if (doctype !== null) {
    return `${doctype[0]}${GAME_PREVIEW_ERROR_BRIDGE}${html.slice(doctype[0].length)}`;
  }
  return `${GAME_PREVIEW_ERROR_BRIDGE}${html}`;
}

function previewAssetSources(request: IncomingMessage): string {
  const authority = request.headers.host;
  if (authority === undefined) return "'none'";
  const prefix = `${authority}/oh-story/game-preview/`;
  return `http://${prefix} https://${prefix}`;
}

/**
 * Emitted for EVERY preview response, not just HTML. previewContentType serves .svg as
 * image/svg+xml — an active document type — so a game that self-navigates its frame to a scripted
 * SVG would otherwise land in a document with no policy at all, while the iframe sandbox flags
 * (which do persist across that navigation) still grant it script execution. The `sandbox`
 * directive makes each response self-confining regardless of the iframe attribute.
 */
export function previewContentSecurityPolicy(assets: string): string {
  return [
    "sandbox allow-scripts allow-forms allow-modals allow-downloads allow-same-origin",
    "default-src 'none'",
    `script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: ${assets}`,
    `style-src 'unsafe-inline' ${assets}`,
    `img-src data: blob: ${assets}`,
    `media-src data: blob: ${assets}`,
    `font-src data: ${assets}`,
    `connect-src ${assets}`,
    `worker-src blob: ${assets}`,
    `manifest-src ${assets}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*"
  ].join("; ");
}

function previewSecurityHeaders(request: IncomingMessage): Record<string, string> {
  const assets = previewAssetSources(request);
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "cross-origin",
    "access-control-allow-origin": "*",
    "content-security-policy": previewContentSecurityPolicy(assets)
  };
}

interface ResolvedPreviewAsset {
  readonly realm: WorkspaceRealm;
  readonly target: FsTarget;
  readonly info: FsInfo;
  readonly path: string;
  readonly mimeType: string;
}

async function resolvePreviewAsset(
  context: Context,
  pathname: string,
  previewSecret: Uint8Array,
  signal: AbortSignal
): Promise<ResolvedPreviewAsset> {
  let segments: string[];
  try {
    segments = pathname.split("/").slice(3).map((segment) => decodeURIComponent(segment));
  } catch {
    throw new WorkspaceHttpError(400, "游戏预览地址无效。");
  }
  const signedToken = segments.shift();
  const path = segments.join("/") || "index.html";
  if (signedToken === undefined || signedToken === "" || !safeRelativePath(path)) {
    throw new WorkspaceHttpError(400, "游戏预览地址无效。");
  }
  const verified = verifyPreviewToken(signedToken, previewSecret);
  const realm = await workspaceRealmForSession(context, verified.sessionId, signal);
  const root = verified.root;
  const fullRelative = `${root}/build/app/${path}`;
  await assertNoSymlinkSegments(realm, fullRelative, signal);
  const resolveOpts = { cwd: realm.cwd, signal };
  const [appRoot, target] = await Promise.all([
    realm.fs.resolve(`${root}/build/app`, resolveOpts),
    realm.fs.resolve(fullRelative, resolveOpts)
  ]);
  if (!realm.fs.contains(realm.root, appRoot) || !realm.fs.contains(appRoot, target)) {
    throw new WorkspaceHttpError(403, "预览资源离开了游戏目录。");
  }
  const info = requireRegularFile(await realm.fs.stat(target, signal));
  const mimeType = previewContentType(path);
  return { realm, target, info, path, mimeType };
}

async function sendPreviewAsset(
  request: IncomingMessage,
  response: ServerResponse,
  asset: ResolvedPreviewAsset,
  signal: AbortSignal
): Promise<void> {
  const security = previewSecurityHeaders(request);
  if (asset.mimeType.startsWith("audio/") || asset.mimeType.startsWith("video/")) {
    await sendWorkspaceMedia(request, response, asset.realm, asset.target, asset.info, asset.mimeType, signal, security, PREVIEW_FILE_LIMIT);
    return;
  }
  if (asset.info.size !== undefined && asset.info.size > PREVIEW_FILE_LIMIT) {
    throw new WorkspaceHttpError(413, "预览资源过大。");
  }
  const rawBytes = await asset.realm.fs.readBytes(asset.target, signal, PREVIEW_FILE_LIMIT);
  let body: Uint8Array = rawBytes;
  if (asset.mimeType.startsWith("text/html")) {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
      body = Buffer.from(injectGamePreviewErrorBridge(decoded), "utf8");
    } catch {
      body = rawBytes;
    }
  }
  response.writeHead(200, {
    "content-type": asset.mimeType,
    "content-length": body.byteLength,
    ...security
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function mapFsError(error: unknown): WorkspaceHttpError | undefined {
  if (!(error instanceof FsError)) return undefined;
  switch (error.code) {
    case "FS_NOT_FOUND": return new WorkspaceHttpError(404, "文件不存在。");
    case "FS_TOO_LARGE": return new WorkspaceHttpError(413, "文件超过工作台大小限制。");
    case "FS_NOT_TEXT":
    case "FS_NOT_REGULAR_FILE": return new WorkspaceHttpError(415, "目标不是可编辑的文本文件。");
    case "FS_PERMISSION_DENIED":
    case "FS_SANDBOX_DENIED": return new WorkspaceHttpError(403, "当前 DSH 权限不允许修改该文件。");
    case "FS_STALE_VERSION":
    case "FS_NOT_OBSERVED": return new WorkspaceHttpError(412, "文件已在磁盘上更新。请处理冲突后再保存。");
    case "FS_ABORTED": return new WorkspaceHttpError(409, "文件操作已取消。");
    default: return new WorkspaceHttpError(500, "DSH 文件系统操作失败。");
  }
}

function assertAdmittedWorkspaceRequest(context: Context, request: IncomingMessage, options: WorkspaceRouteOptions): void {
  const webServer = context.get("webServer") as { readonly host?: string; readonly protocol?: "http:" | "https:" } | undefined;
  if (!isTrustedWorkspaceRequest(request, options.trustedHosts ?? [], webServer?.host, webServer?.protocol ?? "http:")) {
    throw new WorkspaceHttpError(403, "请求来源不受信任。");
  }
  const connection = context.get("connection") as ConnectionAdmissionService | undefined;
  if (connection !== undefined) {
    const admission = connection.admit(request);
    if ("rejection" in admission) {
      throw new WorkspaceHttpError(
        admission.rejection,
        admission.rejection === 401 ? "需要通过 DSH 登录验证。" : "请求来源不受信任。"
      );
    }
  }
}

async function handle(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  options: WorkspaceRouteOptions,
  previewSecret: Uint8Array
): Promise<void> {
  const abortController = new AbortController();
  response.once("close", () => { if (!response.writableEnded) abortController.abort(); });
  const { signal } = abortController;
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const gamePreview = url.pathname.startsWith("/oh-story/game-preview/");
    if (gamePreview) {
      const webServer = context.get("webServer") as { readonly host?: string; readonly protocol?: "http:" | "https:" } | undefined;
      if (!isTrustedPreviewAssetRequest(request, options.trustedHosts ?? [], webServer?.host, webServer?.protocol ?? "http:")) {
        throw new WorkspaceHttpError(403, "请求来源不受信任。");
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        send(response, 405, { error: "Method not allowed." });
        return;
      }
      const asset = await resolvePreviewAsset(context, url.pathname, previewSecret, signal);
      await sendPreviewAsset(request, response, asset, signal);
      return;
    }

    assertAdmittedWorkspaceRequest(context, request, options);

    if (url.pathname === "/oh-story/config" && request.method === "GET") {
      send(response, 200, { welcomeGuide: options.welcomeGuide?.() ?? true });
      return;
    }
    if (url.pathname === "/oh-story/workspace" && request.method === "GET") {
      const realm = await workspaceRealm(context, url, signal);
      const { files, truncated } = await listFiles(realm, signal);
      const [trackingError, dramaError, games, videos] = await Promise.all([
        metadataError(realm, files, "追踪/_tracking-state.json", options.maxBytes, signal),
        metadataError(realm, files, "short-drama.json", options.maxBytes, signal),
        workspaceGameProjects(realm, files, options.maxBytes, previewSecret, signal),
        workspaceVideoProjects(realm, files, options.maxBytes, signal)
      ]);
      const metadataErrors = [trackingError, dramaError].filter((value): value is string => value !== undefined);
      const payload: WorkspacePayload = {
        cwd: realm.cwd,
        files,
        truncated,
        games,
        videos,
        metadataErrors,
        welcomeGuide: options.welcomeGuide?.() ?? true
      };
      send(response, 200, payload);
      return;
    }
    if (url.pathname === "/oh-story/video-preflight" && request.method === "GET") {
      send(response, 200, await videoPreflight());
      return;
    }
    if (url.pathname === "/oh-story/drama-preflight" && request.method === "GET") {
      send(response, 200, await dramaPreflight());
      return;
    }
    if (url.pathname === "/oh-story/file" && request.method === "GET") {
      const realm = await workspaceRealm(context, url, signal);
      const path = url.searchParams.get("path");
      if (path === null) throw new WorkspaceHttpError(400, "缺少文件路径。");
      const file = await readVersionedFile(realm.fs, await creativeTarget(realm, path, "text", signal), options.maxBytes, signal);
      send(response, 200, { path, ...file });
      return;
    }
    if (url.pathname === "/oh-story/media" && (request.method === "GET" || request.method === "HEAD")) {
      const realm = await workspaceRealm(context, url, signal);
      const path = url.searchParams.get("path");
      if (path === null) throw new WorkspaceHttpError(400, "缺少媒体文件路径。");
      const target = await creativeTarget(realm, path, "media", signal);
      const info = requireRegularFile(await realm.fs.stat(target, signal));
      await sendWorkspaceMedia(request, response, realm, target, info, mediaMimeTypeForPath(path)!, signal);
      return;
    }
    if (url.pathname === "/oh-story/file" && request.method === "PUT") {
      const realm = await workspaceRealm(context, url, signal);
      const path = url.searchParams.get("path");
      if (path === null) throw new WorkspaceHttpError(400, "缺少文件路径。");
      const input = await jsonBody(request, options.maxBytes * 6 + 1_024);
      if (typeof input.content !== "string") throw new WorkspaceHttpError(400, "content 必须是字符串。");
      if (typeof input.baseVersion !== "string" || input.baseVersion === "") throw new WorkspaceHttpError(400, "baseVersion 必须是有效版本。");
      if (Buffer.byteLength(input.content) > options.maxBytes) throw new WorkspaceHttpError(413, "文件超过工作台大小限制。");
      const outcome = await realm.fs.writeText(
        await creativeTarget(realm, path, "text", signal),
        input.content,
        { kind: "replaceIfVersion", version: input.baseVersion as FsVersion },
        signal,
        realm.sandboxPolicy.resolve({ session: realm.agent.session })
      );
      send(response, 200, { path, content: outcome.after, bytes: Buffer.byteLength(outcome.after), version: outcome.version });
      return;
    }
    send(response, 404, { error: "Oh Story route not found." });
  } catch (error) {
    if (response.writableEnded || response.destroyed) return;
    const mapped = error instanceof WorkspaceHttpError ? error : mapFsError(error);
    if (mapped === undefined) context.logger("oh-story").error("workspace route failed", error);
    send(response, mapped?.status ?? 500, { error: mapped?.message ?? "Oh Story workspace operation failed." });
  }
}

/** Mount the narrow editor API on DSH's official web-server extension seam. */
export function registerWorkspaceRoute(context: Context, options: WorkspaceRouteOptions): void {
  const previewSecret = options.previewTokenSecret ?? createPreviewTokenSecret();
  context.effect(() => {
    const dispose = context.webServer.register({
      kind: "prefix",
      path: "/oh-story",
      handler: (request, response) => handle(context, request, response, options, previewSecret)
    });
    return () => {
      dispose();
      resetPreflightCaches();
    };
  }, "oh-story: DSH-session workspace API");
}
