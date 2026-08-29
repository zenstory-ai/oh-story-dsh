import { createHash } from "node:crypto";
import { readFile as readNodeFile, stat as nodeStat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { FsError, type FileSystem, type FsInfo, type FsTarget, type FsVersion } from "@deepseek-ai/dsh-fs";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type { SandboxPolicyService } from "@deepseek-ai/dsh-sandbox-policy";
import { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-typert-registry";
import { type GameVerificationBinding, WorkspaceVerificationTracker } from "./game-verification.js";
import { defaultNovelToGameSkillRoot } from "./skill-provider.js";
import { isTrustedPreviewNavigation, isTrustedWorkspaceRequest } from "./workspace-request-trust.js";

const STORY_DIRECTORIES = ["正文", "大纲", "设定", "追踪", "对标", "参考资料"] as const;
const DRAMA_DIRECTORIES = ["输入", "项目开发", "设定集", "剧集", "交付", "创作者决策", "审查"] as const;
const GAME_DIRECTORY = "game-adaptations";
const CREATIVE_DIRECTORIES = [...STORY_DIRECTORIES, ...DRAMA_DIRECTORIES, GAME_DIRECTORY] as const;
const ROOT_FILES = new Set(["short-drama.json"]);
const EDITABLE_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl"]);
const GAME_EDITABLE_EXTENSIONS = new Set([...EDITABLE_EXTENSIONS, ".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const MEDIA_TYPES: ReadonlyMap<string, string> = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".gif", "image/gif"],
  [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"],
  [".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".m4a", "audio/mp4"]
]);
const MEDIA_MAX_BYTES = 256 * 1_024 * 1_024;
const FILE_LIMIT = 1_000;
const PREVIEW_FILE_LIMIT = 32 * 1024 * 1024;
const BUNDLED_GAME_EXAMPLE = "jin-ping-mei";
const workspaceVerificationTracker = new WorkspaceVerificationTracker();

interface WorkspaceRouteOptions {
  readonly maxBytes: number;
  readonly trustedHosts?: readonly string[];
}

interface WorkspaceFile {
  readonly path: string;
  readonly bytes: number;
  readonly version: string;
  readonly kind: "text" | "media";
  readonly mimeType?: string | undefined;
}

interface GameVerificationSummary {
  readonly status: "NOT_RUN" | "FAIL" | "PASS";
  readonly checks: Readonly<Record<string, "NOT_RUN" | "FAIL" | "PASS">>;
  readonly runId?: string | undefined;
  readonly limitations: readonly { readonly scope: string; readonly reason: string }[];
  readonly binding: GameVerificationBinding;
  readonly verifiedPreviewVersion?: string | undefined;
}

interface GameProjectSummary {
  readonly id: string;
  readonly root: string;
  readonly title: string;
  readonly source: "workspace" | "example";
  readonly previewReady: boolean;
  readonly previewUrl?: string | undefined;
  readonly previewVersion: string;
  readonly verification: GameVerificationSummary;
}

interface WorkspaceRealm {
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

function sendMedia(request: IncomingMessage, response: ServerResponse, bytes: Uint8Array, mimeType: string): void {
  const range = request.headers.range;
  let start = 0;
  let end = bytes.byteLength - 1;
  let status = 200;
  if (typeof range === "string") {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(range.trim());
    if (match !== null) {
      const requestedStart = match[1] === "" ? 0 : Number(match[1]);
      const requestedEnd = match[2] === "" ? end : Number(match[2]);
      if (Number.isSafeInteger(requestedStart) && Number.isSafeInteger(requestedEnd) && requestedStart >= 0 && requestedStart <= requestedEnd && requestedStart < bytes.byteLength) {
        start = requestedStart;
        end = Math.min(requestedEnd, end);
        status = 206;
      }
    }
  }
  const body = bytes.subarray(start, end + 1);
  response.writeHead(status, {
    "content-type": mimeType,
    "content-length": body.byteLength,
    "cache-control": "private, max-age=60",
    "accept-ranges": "bytes",
    ...(status === 206 ? { "content-range": `bytes ${String(start)}-${String(end)}/${String(bytes.byteLength)}` } : {}),
    "x-content-type-options": "nosniff"
  });
  response.end(Buffer.from(body));
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

function safeRelativePath(path: string): boolean {
  return path !== ""
    && !path.startsWith("/")
    && !path.includes("\\")
    && !path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function editablePath(path: string): boolean {
  const extensions = path.startsWith(`${GAME_DIRECTORY}/`) ? GAME_EDITABLE_EXTENSIONS : EDITABLE_EXTENSIONS;
  return extensions.has(extname(path).toLocaleLowerCase());
}

export function assertCreativePath(path: string, kind: "text" | "media"): void {
  if (kind === "text" ? !editablePath(path) : !MEDIA_TYPES.has(extname(path).toLocaleLowerCase())) {
    throw new WorkspaceHttpError(415, kind === "text" ? "工作台不支持编辑该文件类型。" : "目标不是受支持的短剧媒体文件。");
  }
  if (!safeRelativePath(path)) {
    throw new WorkspaceHttpError(403, "文件路径不在创作工作台中。");
  }
  const root = path.split("/", 1)[0];
  if (!CREATIVE_DIRECTORIES.some((directory) => directory === root) && !ROOT_FILES.has(path)) {
    throw new WorkspaceHttpError(403, "文件路径不在创作工作台中。");
  }
}

export function mediaMimeTypeForPath(path: string): string | undefined {
  return MEDIA_TYPES.get(extname(path).toLocaleLowerCase());
}

async function workspaceRealmForSession(context: Context, rawId: string): Promise<WorkspaceRealm> {
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
  return { agent, fs, sandboxPolicy, cwd, root: await fs.resolve(cwd) };
}

async function workspaceRealm(context: Context, url: URL): Promise<WorkspaceRealm> {
  const rawId = url.searchParams.get("sessionId");
  if (rawId === null) throw new WorkspaceHttpError(400, "缺少 DSH sessionId。");
  return workspaceRealmForSession(context, rawId);
}

async function creativeTarget(realm: WorkspaceRealm, path: string, kind: "text" | "media" = "text"): Promise<FsTarget> {
  assertCreativePath(path, kind);
  const target = await realm.fs.resolve(path, { cwd: realm.cwd });
  if (!realm.fs.contains(realm.root, target)) throw new WorkspaceHttpError(403, "文件路径离开了 DSH 工作目录。");
  return target;
}

function requireRegularFile(info: FsInfo | undefined): FsInfo {
  if (info === undefined) throw new WorkspaceHttpError(404, "文件不存在。");
  if (info.type !== "file") throw new WorkspaceHttpError(415, "目标不是可编辑的普通文件。");
  return info;
}

/** Read bytes and a matching opaque version, retrying if a writer wins the read window. */
async function readVersionedFile(fs: FileSystem, target: FsTarget, maxBytes: number): Promise<ReadFileResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = requireRegularFile(await fs.stat(target));
    if (before.size !== undefined && before.size > maxBytes) throw new WorkspaceHttpError(413, "文件超过工作台大小限制。");
    const bytes = await fs.readBytes(target, undefined, maxBytes);
    const after = requireRegularFile(await fs.stat(target));
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

async function listFiles(realm: WorkspaceRealm): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];
  const walk = async (path: string, directory: FsTarget): Promise<void> => {
    for (const entry of await realm.fs.listDir(directory)) {
      if (entry.name.startsWith(".") || !realm.fs.contains(realm.root, entry.target)) continue;
      const childPath = `${path}/${entry.name}`;
      if (entry.type === "directory") await walk(childPath, entry.target);
      else if (entry.type === "file" && (editablePath(childPath) || MEDIA_TYPES.has(extname(entry.name).toLocaleLowerCase()))) {
        const info = entry.version === undefined || entry.size === undefined ? await realm.fs.stat(entry.target) : undefined;
        const version = entry.version ?? info?.version;
        const mimeType = MEDIA_TYPES.get(extname(entry.name).toLocaleLowerCase());
        if (version !== undefined) files.push({ path: childPath, bytes: entry.size ?? info?.size ?? 0, version, kind: mimeType === undefined ? "text" : "media", mimeType });
      }
      if (files.length >= FILE_LIMIT) return;
    }
  };
  for (const directory of CREATIVE_DIRECTORIES) {
    const target = await realm.fs.resolve(directory, { cwd: realm.cwd });
    if (!realm.fs.contains(realm.root, target)) continue;
    const info = await realm.fs.stat(target);
    if (info?.type === "directory") await walk(directory, target);
    if (files.length >= FILE_LIMIT) break;
  }
  for (const path of ROOT_FILES) {
    const target = await creativeTarget(realm, path);
    const info = await realm.fs.stat(target);
    if (info?.type === "file") files.push({ path, bytes: info.size ?? 0, version: info.version, kind: "text" });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"));
}

async function metadata(realm: WorkspaceRealm, files: readonly WorkspaceFile[], path: string, maxBytes: number): Promise<{ readonly value: unknown; readonly error?: string }> {
  if (!files.some((file) => file.path === path)) return { value: null };
  try {
    const target = await creativeTarget(realm, path);
    return { value: JSON.parse((await readVersionedFile(realm.fs, target, maxBytes)).content) as unknown };
  } catch (error) {
    return { value: null, error: error instanceof SyntaxError ? `${path} 不是有效的 JSON。` : `${path} 暂时无法读取。` };
  }
}

function token(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function untoken(value: string): string {
  try { return Buffer.from(value, "base64url").toString("utf8"); }
  catch { throw new WorkspaceHttpError(400, "游戏预览标识无效。"); }
}

function gameRoot(path: string): boolean {
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === GAME_DIRECTORY && parts[1] !== undefined && /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(parts[1]);
}

function normalizedVerification(
  value: unknown,
  binding: GameVerificationBinding,
  verifiedPreviewVersion?: string
): GameVerificationSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { status: "NOT_RUN", checks: {}, limitations: [], binding };
  }
  const record = value as Record<string, unknown>;
  const status = record.status === "PASS" || record.status === "FAIL" ? record.status : "NOT_RUN";
  const rawChecks = typeof record.checks === "object" && record.checks !== null && !Array.isArray(record.checks)
    ? record.checks as Record<string, unknown>
    : {};
  const checks: Record<string, "NOT_RUN" | "FAIL" | "PASS"> = {};
  for (const name of ["launch", "render", "input", "coreLoop", "outcome", "restart"]) {
    const check = rawChecks[name];
    checks[name] = check === "PASS" || check === "FAIL" ? check : "NOT_RUN";
  }
  const completeRun = typeof record.completeRun === "object" && record.completeRun !== null && !Array.isArray(record.completeRun)
    ? record.completeRun as Record<string, unknown>
    : {};
  const limitations = Array.isArray(record.limitations) ? record.limitations.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return typeof item.scope === "string" && typeof item.reason === "string"
      ? [{ scope: item.scope, reason: item.reason }]
      : [];
  }) : [];
  return {
    status,
    checks,
    runId: typeof completeRun.id === "string" ? completeRun.id : undefined,
    limitations,
    binding,
    verifiedPreviewVersion
  };
}

async function workspaceText(realm: WorkspaceRealm, path: string, maxBytes: number): Promise<string | undefined> {
  const target = await realm.fs.resolve(path, { cwd: realm.cwd });
  if (!realm.fs.contains(realm.root, target) || (await realm.fs.stat(target))?.type !== "file") return undefined;
  return (await readVersionedFile(realm.fs, target, maxBytes)).content;
}

async function previewDigest(realm: WorkspaceRealm, projectRoot: string): Promise<{ readonly ready: boolean; readonly version: string }> {
  const appPath = `${projectRoot}/build/app`;
  const app = await realm.fs.resolve(appPath, { cwd: realm.cwd });
  if (!realm.fs.contains(realm.root, app) || (await realm.fs.stat(app))?.type !== "directory") return { ready: false, version: "missing" };
  const entries: string[] = [];
  let ready = false;
  const visit = async (directory: FsTarget, path: string): Promise<void> => {
    for (const entry of await realm.fs.listDir(directory)) {
      if (entry.name.startsWith(".") || !realm.fs.contains(app, entry.target)) continue;
      const childPath = path === "" ? entry.name : `${path}/${entry.name}`;
      if (entry.type === "directory") await visit(entry.target, childPath);
      else if (entry.type === "file") {
        const info = entry.version === undefined ? await realm.fs.stat(entry.target) : undefined;
        const version = entry.version ?? info?.version;
        if (version !== undefined) entries.push(`${childPath}\0${version}`);
        if (childPath === "index.html") ready = true;
      }
      if (entries.length >= 5_000) return;
    }
  };
  await visit(app, "");
  return { ready, version: createHash("sha256").update(entries.sort().join("\n")).digest("hex").slice(0, 16) };
}

function headingTitle(content: string | undefined, fallback: string): string {
  const heading = content?.split(/\r?\n/u).find((line) => /^#\s+/u.test(line));
  return heading?.replace(/^#\s+/u, "").replace(/^PRODUCT_BRIEF\s*[·・:]?\s*/iu, "").trim() || fallback;
}

async function workspaceGameProjects(
  realm: WorkspaceRealm,
  files: readonly WorkspaceFile[],
  sessionId: string,
  maxBytes: number
): Promise<GameProjectSummary[]> {
  const roots = [...new Set(files.flatMap((file) => {
    const parts = file.path.split("/");
    return parts[0] === GAME_DIRECTORY && parts[1] !== undefined ? [`${GAME_DIRECTORY}/${parts[1]}`] : [];
  }))].filter(gameRoot).sort();
  return Promise.all(roots.map(async (root) => {
    const id = root.slice(`${GAME_DIRECTORY}/`.length);
    const qaPath = `${root}/qa/verification.json`;
    const qaFile = files.find((file) => file.path === qaPath);
    const [brief, qa, preview] = await Promise.all([
      workspaceText(realm, `${root}/PRODUCT_BRIEF.md`, maxBytes),
      workspaceText(realm, qaPath, maxBytes),
      previewDigest(realm, root)
    ]);
    let verification: unknown;
    try { verification = qa === undefined ? undefined : JSON.parse(qa) as unknown; }
    catch { verification = undefined; }
    const freshness = workspaceVerificationTracker.observe(`${sessionId}\0${root}`, qaFile?.version, preview.version);
    return {
      id: `workspace:${id}`,
      root,
      title: headingTitle(brief, id),
      source: "workspace" as const,
      previewReady: preview.ready,
      previewUrl: preview.ready
        ? `/oh-story/game-preview/workspace/${token(sessionId)}/${token(root)}/index.html`
        : undefined,
      previewVersion: preview.version,
      verification: normalizedVerification(verification, freshness.binding, freshness.verifiedPreviewVersion)
    };
  }));
}

function bundledExampleRoot(): string {
  return resolve(defaultNovelToGameSkillRoot(), `../examples/${BUNDLED_GAME_EXAMPLE}`);
}

async function bundledGameExample(): Promise<GameProjectSummary> {
  const root = bundledExampleRoot();
  const [example, verification, manifest] = await Promise.all([
    readNodeFile(resolve(root, "example.json"), "utf8"),
    readNodeFile(resolve(root, "qa/verification.json"), "utf8"),
    readNodeFile(resolve(defaultNovelToGameSkillRoot(), "../manifest.json"), "utf8")
  ]);
  const exampleJson = JSON.parse(example) as { readonly title?: unknown };
  const manifestJson = JSON.parse(manifest) as { readonly upstream?: { readonly commit?: unknown } };
  const previewVersion = typeof manifestJson.upstream?.commit === "string" ? manifestJson.upstream.commit.slice(0, 16) : "bundled";
  return {
    id: `example:${BUNDLED_GAME_EXAMPLE}`,
    root: `examples/${BUNDLED_GAME_EXAMPLE}`,
    title: typeof exampleJson.title === "string" ? exampleJson.title : "金瓶梅 · 风月总账",
    source: "example",
    previewReady: true,
    previewUrl: `/oh-story/game-preview/example/${BUNDLED_GAME_EXAMPLE}/index.html`,
    previewVersion,
    verification: normalizedVerification(JSON.parse(verification) as unknown, "PINNED", previewVersion)
  };
}

function previewContentType(path: string): string {
  switch (extname(path).toLocaleLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    case ".wasm": return "application/wasm";
    case ".mp3": return "audio/mpeg";
    case ".ogg": return "audio/ogg";
    default: return "application/octet-stream";
  }
}

function previewAssetSources(request: IncomingMessage): string {
  const authority = request.headers.host;
  if (authority === undefined) return "'none'";
  const prefix = `${authority}/oh-story/game-preview/`;
  return `http://${prefix} https://${prefix}`;
}

function sendPreview(request: IncomingMessage, response: ServerResponse, path: string, bytes: Uint8Array): void {
  const html = extname(path).toLocaleLowerCase() === ".html";
  const assets = previewAssetSources(request);
  response.writeHead(200, {
    "content-type": previewContentType(path),
    "content-length": bytes.byteLength,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "cross-origin",
    "access-control-allow-origin": "*",
    ...(html ? {
      "content-security-policy": [
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
        "frame-ancestors 'self' http://127.0.0.1:* http://localhost:*"
      ].join("; ")
    } : {})
  });
  response.end(bytes);
}

async function previewBytes(context: Context, pathname: string): Promise<{ readonly path: string; readonly bytes: Uint8Array }> {
  const segments = pathname.split("/").slice(3).map((segment) => decodeURIComponent(segment));
  const kind = segments.shift();
  if (kind === "example") {
    const id = segments.shift();
    const path = segments.join("/") || "index.html";
    if (id !== BUNDLED_GAME_EXAMPLE || !safeRelativePath(path)) throw new WorkspaceHttpError(404, "游戏示例不存在。");
    const appRoot = resolve(bundledExampleRoot(), "build/app");
    const target = resolve(appRoot, path);
    const escaped = relative(appRoot, target);
    if (escaped.startsWith("..") || isAbsolute(escaped)) throw new WorkspaceHttpError(403, "预览资源离开了游戏目录。");
    const info = await nodeStat(target).catch(() => undefined);
    if (!info?.isFile()) throw new WorkspaceHttpError(404, "预览资源不存在。");
    if (info.size > PREVIEW_FILE_LIMIT) throw new WorkspaceHttpError(413, "预览资源过大。");
    return { path, bytes: await readNodeFile(target) };
  }
  if (kind === "workspace") {
    const session = segments.shift();
    const project = segments.shift();
    const path = segments.join("/") || "index.html";
    if (session === undefined || project === undefined || !safeRelativePath(path)) throw new WorkspaceHttpError(400, "游戏预览地址无效。");
    const realm = await workspaceRealmForSession(context, untoken(session));
    const root = untoken(project);
    if (!gameRoot(root)) throw new WorkspaceHttpError(403, "游戏项目路径无效。");
    const appRoot = await realm.fs.resolve(`${root}/build/app`, { cwd: realm.cwd });
    const target = await realm.fs.resolve(`${root}/build/app/${path}`, { cwd: realm.cwd });
    if (!realm.fs.contains(realm.root, appRoot) || !realm.fs.contains(appRoot, target)) {
      throw new WorkspaceHttpError(403, "预览资源离开了游戏目录。");
    }
    const info = requireRegularFile(await realm.fs.stat(target));
    if (info.size !== undefined && info.size > PREVIEW_FILE_LIMIT) throw new WorkspaceHttpError(413, "预览资源过大。");
    return { path, bytes: await realm.fs.readBytes(target, undefined, PREVIEW_FILE_LIMIT) };
  }
  throw new WorkspaceHttpError(404, "游戏预览不存在。");
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

async function handle(context: Context, request: IncomingMessage, response: ServerResponse, options: WorkspaceRouteOptions): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const gamePreview = url.pathname.startsWith("/oh-story/game-preview/");
    const trusted = gamePreview
      ? isTrustedPreviewNavigation(request, options.trustedHosts ?? [])
      : isTrustedWorkspaceRequest(request, options.trustedHosts ?? []);
    if (!trusted) throw new WorkspaceHttpError(403, "请求来源不受信任。");
    if (gamePreview && request.method === "GET") {
      const preview = await previewBytes(context, url.pathname);
      sendPreview(request, response, preview.path, preview.bytes);
      return;
    }
    if (url.pathname === "/oh-story/workspace" && request.method === "GET") {
      const realm = await workspaceRealm(context, url);
      const files = await listFiles(realm);
      const tracking = await metadata(realm, files, "追踪/_tracking-state.json", options.maxBytes);
      const shortDrama = await metadata(realm, files, "short-drama.json", options.maxBytes);
      const metadataErrors = [tracking.error, shortDrama.error].filter((value): value is string => value !== undefined);
      const sessionId = url.searchParams.get("sessionId");
      if (sessionId === null) throw new WorkspaceHttpError(400, "缺少 DSH sessionId。");
      const games = [
        ...await workspaceGameProjects(realm, files, sessionId, options.maxBytes),
        await bundledGameExample()
      ];
      send(response, 200, { cwd: realm.cwd, files, games, tracking: tracking.value, shortDrama: shortDrama.value, metadataErrors, mode: "dsh-session" });
      return;
    }
    if (url.pathname === "/oh-story/file" && request.method === "GET") {
      const realm = await workspaceRealm(context, url);
      const path = url.searchParams.get("path");
      if (path === null) throw new WorkspaceHttpError(400, "缺少文件路径。");
      const file = await readVersionedFile(realm.fs, await creativeTarget(realm, path), options.maxBytes);
      send(response, 200, { path, ...file });
      return;
    }
    if (url.pathname === "/oh-story/media" && request.method === "GET") {
      const realm = await workspaceRealm(context, url);
      const path = url.searchParams.get("path");
      if (path === null) throw new WorkspaceHttpError(400, "缺少媒体文件路径。");
      const mimeType = mediaMimeTypeForPath(path);
      if (mimeType === undefined) throw new WorkspaceHttpError(415, "目标不是受支持的短剧媒体文件。");
      const target = await creativeTarget(realm, path, "media");
      const info = requireRegularFile(await realm.fs.stat(target));
      if (info.size !== undefined && info.size > MEDIA_MAX_BYTES) throw new WorkspaceHttpError(413, "媒体文件超过工作台预览大小限制。");
      sendMedia(request, response, await realm.fs.readBytes(target, undefined, MEDIA_MAX_BYTES), mimeType);
      return;
    }
    if (url.pathname === "/oh-story/file" && request.method === "PUT") {
      const realm = await workspaceRealm(context, url);
      const path = url.searchParams.get("path");
      if (path === null) throw new WorkspaceHttpError(400, "缺少文件路径。");
      const input = await jsonBody(request, options.maxBytes * 6 + 1_024);
      if (typeof input.content !== "string") throw new WorkspaceHttpError(400, "content 必须是字符串。");
      if (typeof input.baseVersion !== "string" || input.baseVersion === "") throw new WorkspaceHttpError(400, "baseVersion 必须是有效版本。");
      if (Buffer.byteLength(input.content) > options.maxBytes) throw new WorkspaceHttpError(413, "文件超过工作台大小限制。");
      const outcome = await realm.fs.writeText(
        await creativeTarget(realm, path),
        input.content,
        { kind: "replaceIfVersion", version: input.baseVersion as FsVersion },
        undefined,
        realm.sandboxPolicy.resolve({ session: realm.agent.session })
      );
      send(response, 200, { path, content: outcome.after, bytes: Buffer.byteLength(outcome.after), version: outcome.version });
      return;
    }
    send(response, 404, { error: "Oh Story route not found." });
  } catch (error) {
    const mapped = error instanceof WorkspaceHttpError ? error : mapFsError(error);
    if (mapped === undefined) context.logger("oh-story").error("workspace route failed", error);
    send(response, mapped?.status ?? 500, { error: mapped?.message ?? "Oh Story workspace operation failed." });
  }
}

/** Mount the narrow editor API on DSH's official web-server extension seam. */
export function registerWorkspaceRoute(context: Context, options: WorkspaceRouteOptions): void {
  context.effect(() => context.webServer.register({
    kind: "prefix",
    path: "/oh-story",
    handler: (request, response) => handle(context, request, response, options)
  }), "oh-story: DSH-session workspace API");
}
