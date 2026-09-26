import type { Context } from "@deepseek-ai/cordis";
import type { FileSystem, FsTarget } from "@deepseek-ai/dsh-fs";
import { boundContextSummary, createUserMessage, type ContextFormed } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-session";
import type { PostToolDecision, PreToolDecision, ToolExecution } from "@deepseek-ai/dsh-tools";
import { observeOhStoryRoleDescriptor, ohStoryRoleOfSession } from "./role-identity.js";

declare module "@deepseek-ai/dsh-llm" {
  interface MessageSourceMap {
    /** DSH 0.1.7 dropped the shared `plugin` kind: each producer declares its own. */
    "oh-story-post-write": { kind: "oh-story-post-write" } & ContextFormed;
  }
}

const MUTATION_TOOLS = new Set(["write", "edit", "str_replace_editor"]);

export interface StoryMutation {
  readonly root: string;
  /** Workspace-relative path of the mutated 正文 file. */
  readonly path: string;
  readonly chapter?: number;
}

function argumentRecord(args: unknown): Record<string, unknown> | undefined {
  return typeof args === "object" && args !== null && !Array.isArray(args) ? args as Record<string, unknown> : undefined;
}

function mutationPath(name: string, args: unknown): string | undefined {
  const record = argumentRecord(args);
  if (!MUTATION_TOOLS.has(name) || record === undefined) return undefined;
  if (name === "str_replace_editor") {
    if (!new Set(["create", "str_replace", "insert"]).has(String(record.command))) return undefined;
    return typeof record.path === "string" && record.path.trim() !== "" ? record.path : undefined;
  }
  return typeof record.file_path === "string" && record.file_path.trim() !== "" ? record.file_path : undefined;
}

function normalizedRelativePath(path: string): string | undefined {
  const segments: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else segments.push(part);
  }
  return segments.join("/");
}

/**
 * Split a workspace-relative path into the book that owns its 正文/ directory
 * and the file name. The book is "" when the workspace root is the book (the
 * DSH single-book layout); upstream imports and multi-book workspaces put it
 * in a subdirectory such as `{书名}/正文/`.
 */
function proseLocation(path: string): { readonly book: string; readonly name: string } | undefined {
  const segments = path.split("/");
  if (segments.length < 2) return undefined;
  const index = segments.lastIndexOf("正文", segments.length - 2);
  if (index < 0) return undefined;
  return { book: segments.slice(0, index).join("/"), name: segments.at(-1) ?? "" };
}

function inBook(book: string, path: string): string {
  return book === "" ? path : `${book}/${path}`;
}

function lastSegment(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter((part) => part !== "").at(-1) ?? "";
}

export function detectStoryMutation(name: string, args: unknown, cwd: string | undefined): StoryMutation | undefined {
  const rawPath = mutationPath(name, args);
  if (cwd === undefined || rawPath === undefined) return undefined;
  const root = cwd.replaceAll("\\", "/").replace(/\/$/u, "");
  const candidate = rawPath.replaceAll("\\", "/");
  const absolute = candidate.startsWith("/") || /^[a-z]:\//iu.test(candidate) || /^[a-z][a-z\d+.-]*:\/\//iu.test(candidate);
  const insideRoot = /^[a-z]:\//iu.test(root)
    ? candidate.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    : candidate.startsWith(`${root}/`);
  if (absolute && !insideRoot) return undefined;
  const normalized = normalizedRelativePath(absolute ? candidate.slice(root.length + 1) : candidate);
  if (normalized === undefined) return undefined;
  const location = proseLocation(normalized);
  if (location === undefined) return undefined;
  const chapterText = /^第0*(\d+)章/u.exec(location.name)?.[1];
  return { root, path: normalized, ...(chapterText === undefined ? {} : { chapter: Number(chapterText) }) };
}

type StoryFileSystem = Pick<FileSystem, "resolve" | "contains" | "stat" | "listDir">;

async function storyMutation(exec: ToolExecution, fs: StoryFileSystem): Promise<StoryMutation | undefined> {
  const cwd = exec.agent?.session.header.cwd;
  const path = mutationPath(exec.name, exec.arguments);
  if (cwd === undefined || path === undefined) return undefined;
  try {
    const [rootTarget, mutationTarget] = await Promise.all([
      fs.resolve(cwd, { signal: exec.signal }),
      fs.resolve(path, { cwd, signal: exec.signal })
    ]);
    if (!fs.contains(rootTarget, mutationTarget)) return undefined;
  } catch { return undefined; }
  return detectStoryMutation(exec.name, exec.arguments, cwd);
}

async function target(fs: StoryFileSystem, root: string, path: string, signal?: AbortSignal): Promise<FsTarget> {
  return fs.resolve(path, { cwd: root, ...(signal === undefined ? {} : { signal }) });
}

async function exists(fs: StoryFileSystem, root: string, path: string, signal?: AbortSignal): Promise<boolean> {
  return target(fs, root, path, signal)
    .then((value) => fs.stat(value, signal))
    .then((info) => info !== undefined, () => false);
}

/** A long-form book has 大纲/ or 追踪/; plain workspaces that merely contain 正文/ stay unguarded. */
async function isLongFormBook(fs: StoryFileSystem, root: string, book: string, signal?: AbortSignal): Promise<boolean> {
  return await exists(fs, root, inBook(book, "大纲"), signal) || await exists(fs, root, inBook(book, "追踪"), signal);
}

async function hasChapterOutline(fs: StoryFileSystem, root: string, book: string, chapter: number, signal?: AbortSignal): Promise<boolean> {
  const entries = await target(fs, root, inBook(book, "大纲"), signal)
    .then((directory) => fs.listDir(directory, signal))
    .catch(() => []);
  return entries.some((entry) => entry.type === "file"
    && Number(/^细纲_第0*(\d+)章.*\.md$/u.exec(entry.name)?.[1]) === chapter);
}

/**
 * Upstream's only bypass: story-import copies an existing manuscript into
 * 正文/ before it runs `tracking_commit.py init`, while `拆文库/{书名}/` holds
 * the import analysis. Once the book's Tracking state exists the bypass ends,
 * even though the analysis directory is kept.
 */
async function isImportBootstrap(fs: StoryFileSystem, root: string, book: string, signal?: AbortSignal): Promise<boolean> {
  const bookName = book === "" ? lastSegment(root) : lastSegment(book);
  return bookName !== ""
    && await exists(fs, root, `拆文库/${bookName}`, signal)
    && !(await exists(fs, root, inBook(book, "追踪/_tracking-state.json"), signal));
}

/**
 * Mirror of upstream Oh Story's prose guard (`proseBlockReason`): creating a
 * new chapter file in a long-form book requires its `大纲/细纲_第N章*.md`,
 * whether or not Tracking exists yet — since 0.7.11 Tracking is initialised
 * only right before the first chapter, so its absence no longer means
 * "bootstrap". Rewriting an existing chapter is not gated on its outline.
 */
export async function validateStoryMutation(
  fs: StoryFileSystem,
  mutation: StoryMutation,
  signal?: AbortSignal
): Promise<string | undefined> {
  const location = proseLocation(mutation.path);
  if (mutation.chapter === undefined || location === undefined) return undefined;
  const { book } = location;
  if (!(await isLongFormBook(fs, mutation.root, book, signal))) return undefined;
  if (await exists(fs, mutation.root, mutation.path, signal)) return undefined;
  if (await isImportBootstrap(fs, mutation.root, book, signal)) return undefined;
  if (await hasChapterOutline(fs, mutation.root, book, mutation.chapter, signal)) return undefined;
  const padded = String(mutation.chapter).padStart(3, "0");
  return `Oh Story 阻止写入第 ${String(mutation.chapter)} 章：未找到对应的 ${inBook(book, "大纲")}/细纲_第${padded}章*.md。请先完成细纲。`;
}

export async function decideStoryMutation(
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>
): Promise<PreToolDecision> {
  const fs = exec.agent?.ctx.get("fs");
  if (fs === undefined) return next();
  const mutation = await storyMutation(exec, fs);
  if (mutation === undefined) return next();
  const reason = await validateStoryMutation(fs, mutation, exec.signal);
  if (reason !== undefined) return { kind: "deny", reason };
  return next();
}

const ANALYSIS_INPUT = /^输入-(RAW|REUSE)-(\d+)-(\d+)\.md$/u;
const ANALYSIS_INPUT_RULE = "只允许写调用方给的 {拆文目录}/_analysis_cache/输入-{批次ID}.md（批次 ID 如 RAW-4-6），不写其他文件。";

function isFileMutationCall(name: string, args: unknown): boolean {
  if (name === "write" || name === "edit") return true;
  return name === "str_replace_editor" && argumentRecord(args)?.command !== "view";
}

function displayParent(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? path.slice(0, index + 1) : path.slice(0, index);
}

function displayName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

async function isAnalysisDirectory(fs: StoryFileSystem, directory: string, signal?: AbortSignal): Promise<boolean> {
  return await exists(fs, directory, "chapter_index.csv", signal) || await exists(fs, directory, "_progress.md", signal);
}

/**
 * Mirror of upstream's `analysis-input-guard` (story_hook_cli.js): the
 * chapter-extractor may write or edit only
 * `{拆文目录}/_analysis_cache/输入-{RAW|REUSE}-{起章}-{止章}.md`, where the
 * 拆文目录 holds `chapter_index.csv` or `_progress.md` and lies inside the
 * workspace. The commit script still validates the file's content.
 */
export async function validateAnalysisInputWrite(
  fs: StoryFileSystem,
  cwd: string,
  path: string | undefined,
  signal?: AbortSignal
): Promise<string | undefined> {
  const deny = (shown: string, reasons: readonly string[]): string =>
    `Oh Story 阻止 chapter-extractor 写入 ${shown}：${reasons.join("；")}。${ANALYSIS_INPUT_RULE}`;
  if (path === undefined) return deny("（未给出路径）", ["写入没有给出文件路径"]);
  let rootTarget: FsTarget;
  let fileTarget: FsTarget;
  try {
    [rootTarget, fileTarget] = await Promise.all([
      fs.resolve(cwd, signal === undefined ? {} : { signal }),
      fs.resolve(path, { cwd, ...(signal === undefined ? {} : { signal }) })
    ]);
  } catch {
    return deny(path, ["路径无法解析"]);
  }
  const reasons: string[] = [];
  const match = ANALYSIS_INPUT.exec(displayName(fileTarget.displayPath));
  if (match === null) reasons.push("文件名必须是 输入-{RAW|REUSE}-{起章}-{止章}.md");
  else if (Number(match[2]) < 1 || Number(match[3]) < Number(match[2])) reasons.push("批次章号范围无效");
  const cacheDirectory = displayParent(fileTarget.displayPath);
  if (displayName(cacheDirectory) !== "_analysis_cache") reasons.push("只能写在拆文目录的 _analysis_cache/ 下");
  else if (!(await isAnalysisDirectory(fs, displayParent(cacheDirectory), signal))) {
    reasons.push("上级目录不是拆文目录（缺 chapter_index.csv 与 _progress.md）");
  }
  if (!fs.contains(rootTarget, fileTarget)) reasons.push("路径在项目目录之外");
  return reasons.length === 0 ? undefined : deny(path, reasons);
}

/**
 * Fence file mutations by a chapter-extractor child to its batch input file.
 * The child is identified by the Role DSH recorded in its Session descriptor,
 * so other Roles and the main Agent are unaffected.
 */
export async function decideChapterExtractorWrite(
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>
): Promise<PreToolDecision> {
  if (ohStoryRoleOfSession(exec.agent?.session) !== "chapter-extractor" || !isFileMutationCall(exec.name, exec.arguments)) {
    return next();
  }
  const fs = exec.agent?.ctx.get("fs");
  const cwd = exec.agent?.session.header.cwd;
  const reason = fs === undefined || cwd === undefined
    ? `Oh Story 阻止 chapter-extractor 写入：无法确认项目目录。${ANALYSIS_INPUT_RULE}`
    : await validateAnalysisInputWrite(fs, cwd, mutationPath(exec.name, exec.arguments), exec.signal);
  return reason === undefined ? next() : { kind: "deny", reason };
}

export function postWriteReminderText(path: string): string {
  return [
    `<oh-story-post-write>正文 ${path} 已变更。`,
    "每次写入正文都会出现这条提醒，一章写到一半时也会；它不表示本章已经完成，也不是作者的新写作要求，继续当前步骤即可。",
    "等本章写完收尾时再提交追踪：新章先用 story-long-write 的 scripts/tracking_commit.py draft 生成本章草稿，填好后执行 scripts/storyctl.py chapter commit（作者接受当前长度时用 chapter accept-current-length）；",
    "修改已提交的章节按 workflow-revision 提交一次 mode=revision 事务；导入既有正文时由 story-import 在迁移后用 tracking_commit.py init 统一初始化。",
    "追踪/_tracking-state.json 以及 上下文.md、角色状态/、伏笔.md、时间线/、逐章记录/ 等派生 Tracking 视图只由这些脚本写入，绝不手改。</oh-story-post-write>"
  ].join("");
}

/**
 * Native DSH equivalents of the upstream prose guards. They join DSH's typed
 * tool waterfall, so decisions remain visible in the official approval/tool UI.
 */
export function registerOhStoryHooks(context: Context): void {
  context.on("session/event", (session, event) => { observeOhStoryRoleDescriptor(session, event); });
  context.on("tools/pre-execute", decideChapterExtractorWrite);
  context.on("tools/pre-execute", decideStoryMutation);

  context.on("tools/post-execute", async (exec, result, next): Promise<PostToolDecision> => {
    const downstream = await next();
    if (result.isError || downstream.kind !== "accept") return downstream;
    const fs = exec.agent?.ctx.get("fs");
    const mutation = fs === undefined ? undefined : await storyMutation(exec, fs);
    const location = mutation === undefined ? undefined : proseLocation(mutation.path);
    if (fs === undefined || mutation === undefined || location === undefined) return downstream;
    if (!(await isLongFormBook(fs, mutation.root, location.book, exec.signal))) return downstream;
    const reminder = createUserMessage({
      source: { kind: "oh-story-post-write", form: "notice", summary: boundContextSummary(`正文 ${mutation.path} 已变更`) },
      content: [{ type: "text", text: postWriteReminderText(mutation.path) }]
    });
    return {
      ...downstream,
      additionalContexts: [...downstream.additionalContexts ?? [], reminder]
    };
  });
}
