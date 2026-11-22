import type { Context } from "@deepseek-ai/cordis";
import type { FileSystem, FsDirEntry, FsTarget } from "@deepseek-ai/dsh-fs";
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
 * Split a workspace-relative path into the book that owns its prose file and the
 * file name:
 * - Long-form: `正文/第N章*.md` or `{书名}/正文/第N章*.md` (`kind: "long"`)
 * - Short-story: `正文.md` or `{书名}/正文.md` (`kind: "short"`)
 * The book is "" when the workspace root is the book (the DSH single-book layout).
 */
interface ProseLocation {
  readonly book: string;
  readonly name: string;
  readonly kind: "long" | "short";
}

function proseLocation(path: string): ProseLocation | undefined {
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";
  if (name === "正文.md") {
    return { book: segments.slice(0, -1).join("/"), name, kind: "short" };
  }
  if (segments.length < 2) return undefined;
  const index = segments.lastIndexOf("正文", segments.length - 2);
  if (index < 0) return undefined;
  return { book: segments.slice(0, index).join("/"), name, kind: "long" };
}

function inBook(book: string, path: string): string {
  return book === "" ? path : `${book}/${path}`;
}

function lastSegment(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter((part) => part !== "").at(-1) ?? "";
}

interface ResolvedStoryMutation {
  readonly mutation: StoryMutation;
  readonly book: string;
  readonly kind: "long" | "short";
}

function storyMutationAt(root: string, relativePath: string): ResolvedStoryMutation | undefined {
  const normalized = normalizedRelativePath(relativePath);
  if (normalized === undefined) return undefined;
  const location = proseLocation(normalized);
  if (location === undefined) return undefined;
  const chapterText = location.kind === "long" ? /^第0*(\d+)章/u.exec(location.name)?.[1] : undefined;
  return {
    mutation: { root, path: normalized, ...(chapterText === undefined ? {} : { chapter: Number(chapterText) }) },
    book: location.book,
    kind: location.kind
  };
}

function insideRootDisplay(root: string, candidate: string): boolean {
  return /^[a-z]:\//iu.test(root)
    ? candidate.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    : candidate.startsWith(`${root}/`);
}

export function detectStoryMutation(name: string, args: unknown, cwd: string | undefined): StoryMutation | undefined {
  const rawPath = mutationPath(name, args);
  if (cwd === undefined || rawPath === undefined) return undefined;
  const root = cwd.replaceAll("\\", "/").replace(/\/$/u, "");
  const candidate = rawPath.replaceAll("\\", "/");
  const absolute = candidate.startsWith("/") || /^[a-z]:\//iu.test(candidate) || /^[a-z][a-z\d+.-]*:\/\//iu.test(candidate);
  if (absolute && !insideRootDisplay(root, candidate)) return undefined;
  return storyMutationAt(root, absolute ? candidate.slice(root.length + 1) : candidate)?.mutation;
}

type StoryFileSystem = Pick<FileSystem, "resolve" | "contains" | "stat" | "listDir"> & Partial<Pick<FileSystem, "readBytes">>;

async function storyMutation(exec: ToolExecution, fs: StoryFileSystem): Promise<ResolvedStoryMutation | undefined> {
  const cwd = exec.agent?.session.header.cwd;
  const path = mutationPath(exec.name, exec.arguments);
  if (cwd === undefined || path === undefined) return undefined;
  let rootTarget: FsTarget;
  let mutationTarget: FsTarget;
  try {
    [rootTarget, mutationTarget] = await Promise.all([
      fs.resolve(cwd, { signal: exec.signal }),
      fs.resolve(path, { cwd, signal: exec.signal })
    ]);
    if (!fs.contains(rootTarget, mutationTarget)) return undefined;
  } catch { return undefined; }
  const rootDisplay = rootTarget.displayPath.replaceAll("\\", "/").replace(/\/$/u, "");
  const mutationDisplay = mutationTarget.displayPath.replaceAll("\\", "/");
  if (insideRootDisplay(rootDisplay, mutationDisplay)) {
    return storyMutationAt(rootDisplay, mutationDisplay.slice(rootDisplay.length + 1));
  }
  const fallback = detectStoryMutation(exec.name, exec.arguments, cwd);
  const location = fallback === undefined ? undefined : proseLocation(fallback.path);
  return fallback === undefined || location === undefined ? undefined : { mutation: fallback, book: location.book, kind: location.kind };
}

async function target(fs: StoryFileSystem, root: string, path: string, signal?: AbortSignal): Promise<FsTarget> {
  return fs.resolve(path, { cwd: root, ...(signal === undefined ? {} : { signal }) });
}

async function exists(fs: StoryFileSystem, root: string, path: string, signal?: AbortSignal): Promise<boolean> {
  return target(fs, root, path, signal)
    .then((value) => fs.stat(value, signal))
    .then((info) => info !== undefined, () => false);
}

async function existsDirectory(fs: StoryFileSystem, root: string, path: string, signal?: AbortSignal): Promise<boolean> {
  return target(fs, root, path, signal)
    .then((value) => fs.stat(value, signal))
    .then((info) => info?.type === "directory", () => false);
}

/** A long-form book has 大纲/ or 追踪/; plain workspaces that merely contain 正文/ stay unguarded. */
async function isLongFormBook(fs: StoryFileSystem, root: string, book: string, signal?: AbortSignal): Promise<boolean> {
  return await exists(fs, root, inBook(book, "大纲"), signal) || await exists(fs, root, inBook(book, "追踪"), signal);
}

/** Post-write hard-defect checks also cover books with only 设定/ (or 设定.md), matching upstream isProsePath. */
async function isPostWriteProseBook(
  fs: StoryFileSystem,
  root: string,
  book: string,
  kind: "long" | "short",
  signal?: AbortSignal
): Promise<boolean> {
  if (kind === "short") {
    return exists(fs, root, inBook(book, "设定.md"), signal);
  }
  return await isLongFormBook(fs, root, book, signal)
    || await existsDirectory(fs, root, inBook(book, "设定"), signal)
    || await exists(fs, root, inBook(book, "设定.md"), signal);
}

/** Upstream story_hook_core.js `OUTLINE_MIN_CHARS` (Oh Story 0.8.1). */
const OUTLINE_MIN_CHARS = 30;
const OUTLINE_READ_LIMIT = 64 * 1024;

/**
 * Upstream `outlineIsEmpty`: after a BOM and each line's leading `#`s, fewer than
 * {@link OUTLINE_MIN_CHARS} characters other than whitespace (full-width space
 * included). A file that cannot be read or is not UTF-8 counts as written, as upstream.
 */
async function outlineIsEmpty(fs: StoryFileSystem, outline: FsTarget, signal?: AbortSignal): Promise<boolean> {
  if (fs.readBytes === undefined) return false;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await fs.readBytes(outline, signal, OUTLINE_READ_LIMIT)); }
  catch { return false; }
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  const body = text.split("\n").map((line) => line.replace(/^[ \t]*#+/u, "")).join("");
  return Array.from(body.replace(/[ \t\r\n\f\v\u3000]/gu, "")).length < OUTLINE_MIN_CHARS;
}

/** The chapter's 细纲 files; any one with content satisfies the gate, as upstream. */
async function chapterOutlines(fs: StoryFileSystem, root: string, book: string, chapter: number, signal?: AbortSignal): Promise<FsDirEntry[]> {
  const entries = await target(fs, root, inBook(book, "大纲"), signal)
    .then((directory) => fs.listDir(directory, signal))
    .catch(() => []);
  return entries.filter((entry) => entry.type === "file"
    && Number(/^细纲_第0*(\d+)章.*\.md$/u.exec(entry.name)?.[1]) === chapter)
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

const TRACKING_STATE = "追踪/_tracking-state.json";
const TRACKING_STATE_READ_LIMIT = 2 * 1024 * 1024;

/**
 * DSH's explicit import-window marker, relative to the book directory (the
 * workspace root in DSH's single-book layout). The story-import overlay has
 * the model create it before copying chapters and delete it once
 * `tracking_commit.js init` and `check` succeed.
 */
export const IMPORT_MARKER = ".story/work/导入中.md";

async function hasTrackingState(fs: StoryFileSystem, root: string, book: string, signal?: AbortSignal): Promise<boolean> {
  return exists(fs, root, inBook(book, TRACKING_STATE), signal);
}

/**
 * Mirror Oh Story v0.11.0 `inspectTrackingCheckpoint` hard gate when
 * `追踪/_tracking-state.json` (or `{书名}/追踪/_tracking-state.json`) exists:
 * rejects corrupt JSON, non-v4 schema, or missing integer `state_revision` /
 * `last_committed_chapter`. Returns `undefined` when the state file is absent
 * (fresh books initialize Tracking before first commit).
 */
async function trackingCheckpointHardIssue(
  fs: StoryFileSystem,
  root: string,
  book: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  const statePath = inBook(book, TRACKING_STATE);
  if (!(await exists(fs, root, statePath, signal))) return undefined;
  if (fs.readBytes === undefined) return undefined;
  let parsed: unknown;
  try {
    const file = await target(fs, root, statePath, signal);
    const bytes = await fs.readBytes(file, signal, TRACKING_STATE_READ_LIMIT);
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)) as unknown;
  } catch {
    return `${statePath} 无法解析；停止写正文并重新 /story-import，不能猜测或手补状态`;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return `${statePath} 不是当前 schema_version=4；停止写正文并重新 /story-import，不保留旧结构兼容路径`;
  }
  const document = parsed as Record<string, unknown>;
  if (document.schema_version !== 4) {
    return `${statePath} 不是当前 schema_version=4；停止写正文并重新 /story-import，不保留旧结构兼容路径`;
  }
  if (!Number.isInteger(document.state_revision)) {
    return `${statePath} 缺少整数 state_revision；停止写正文并重新 /story-import`;
  }
  if (!Number.isInteger(document.last_committed_chapter)) {
    return `${statePath} 缺少整数 last_committed_chapter；停止写正文并重新 /story-import`;
  }
  return undefined;
}

/**
 * Upstream story-import's long-form structure migration (structure-mapping-long.md)
 * creates 大纲/ and 追踪/ (Step 1) and copies the manuscript into 正文/ (Step 2)
 * long before it reverse-builds 细纲 (Step 10) and Phase 4 runs
 * `tracking_commit.js init`. Upstream recognises that window by
 * `拆文库/{basename(书目录)}`; in DSH's single-book layout the book is the
 * workspace root, so that key must equal the workspace folder name and rarely
 * does. DSH therefore also accepts its own marker, {@link IMPORT_MARKER}.
 * Any other `拆文库/*` entry — an analysed 对标 book — is never a signal.
 */
async function hasImportSignal(fs: StoryFileSystem, root: string, book: string, signal?: AbortSignal): Promise<boolean> {
  if (await exists(fs, root, inBook(book, IMPORT_MARKER), signal)) return true;
  const bookName = book === "" ? lastSegment(root) : lastSegment(book);
  return bookName !== "" && await exists(fs, root, `拆文库/${bookName}`, signal);
}

/**
 * Mirrors Oh Story v0.11.0's sole prose hard gate (`proseBlockReason`) for books
 * with 大纲/ or 追踪/: creating a new `正文/第N章*.md` requires a non-empty
 * `大纲/细纲_第N章*.md` (at least {@link OUTLINE_MIN_CHARS} non-whitespace/non-#
 * characters), whether or not Tracking exists yet. The one bypass is an import
 * window — an import signal while the book has no `追踪/_tracking-state.json`.
 * Rewriting an existing chapter is not gated on its outline.
 *
 * Per Oh Story v0.11.0's soft-gate model, prior-chapter quality/style/length
 * checks are NOT hard write blocks: they run at commit time via
 * `storyctl.js chapter commit` (supporting `review_required` + `--ack`), while
 * deterministic post-write hard-defect notices ride DSH's `tools/post-execute`
 * `additionalContexts`. Shell-write targets (redirection, cp, tee, scripts) are
 * outside DSH file-tool hooks (the story-long-write overlay asks for write/edit),
 * and workspaces with 正文/ but neither 大纲/ nor 追踪/ stay unguarded.
 */
export async function validateStoryMutation(
  fs: StoryFileSystem,
  mutation: StoryMutation,
  signal?: AbortSignal
): Promise<string | undefined> {
  const location = proseLocation(mutation.path);
  if (location === undefined) return undefined;
  const { book, kind } = location;

  // Short-story hard gate (`story_hook_core.js:790-799`): creating `正文.md`
  // (root or `{书名}/正文.md`) when `设定.md` exists requires同目录 `小节大纲.md`.
  if (kind === "short") {
    if (await exists(fs, mutation.root, mutation.path, signal)) return undefined;
    if (await hasImportSignal(fs, mutation.root, book, signal)) return undefined;
    if (!(await exists(fs, mutation.root, inBook(book, "设定.md"), signal))) return undefined;
    if (!(await exists(fs, mutation.root, inBook(book, "小节大纲.md"), signal))) {
      return `Oh Story 阻止写入短篇正文 ${mutation.path}：缺少同目录 ${inBook(book, "小节大纲.md")}。先按 story-short-write 完成「小节大纲.md」再写正文。`;
    }
    return undefined;
  }

  if (mutation.chapter === undefined) return undefined;
  if (!(await isLongFormBook(fs, mutation.root, book, signal))) return undefined;
  const trackingPresent = await hasTrackingState(fs, mutation.root, book, signal);
  if (!trackingPresent && await hasImportSignal(fs, mutation.root, book, signal)) {
    return undefined;
  }
  const existingChapter = await exists(fs, mutation.root, mutation.path, signal);
  if (!existingChapter) {
    const outlines = await chapterOutlines(fs, mutation.root, book, mutation.chapter, signal);
    const [first] = outlines;
    if (first !== undefined) {
      let hasContent = false;
      for (const outline of outlines) {
        if (!(await outlineIsEmpty(fs, outline.target, signal))) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) {
        return `Oh Story 阻止写入第 ${String(mutation.chapter)} 章：细纲 ${inBook(book, "大纲")}/${first.name} 是空的（不计 # 号和空白不到 ${String(OUTLINE_MIN_CHARS)} 字）。`
          + "先按 story-long-write 单章流程把细纲写完整（这章发生什么、主角做什么选择），再写正文。";
      }
    } else {
      const padded = String(mutation.chapter).padStart(3, "0");
      return `Oh Story 阻止写入第 ${String(mutation.chapter)} 章：未找到对应的 ${inBook(book, "大纲")}/细纲_第${padded}章*.md。`
        + "先按 story-long-write 单章流程补建细纲再写正文。";
    }
  }
  if (trackingPresent) {
    const checkpointIssue = await trackingCheckpointHardIssue(fs, mutation.root, book, signal);
    if (checkpointIssue !== undefined) {
      return `Oh Story 阻止写入第 ${String(mutation.chapter)} 章：${checkpointIssue}。`;
    }
  }
  return undefined;
}

export async function decideStoryMutation(
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>
): Promise<PreToolDecision> {
  const fs = exec.agent?.ctx.get("fs");
  if (fs === undefined) return next();
  const resolved = await storyMutation(exec, fs);
  if (resolved === undefined) return next();
  const reason = await validateStoryMutation(fs, resolved.mutation, exec.signal);
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
  const insideWorkspace = fs.contains(rootTarget, fileTarget);
  const cacheDirectory = displayParent(fileTarget.displayPath);
  if (displayName(cacheDirectory) !== "_analysis_cache") reasons.push("只能写在拆文目录的 _analysis_cache/ 下");
  else if (insideWorkspace && !(await isAnalysisDirectory(fs, displayParent(cacheDirectory), signal))) {
    reasons.push("上级目录不是拆文目录（缺 chapter_index.csv 与 _progress.md）");
  }
  if (!insideWorkspace) reasons.push("路径在项目目录之外");
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

const PROSE_INSPECT_LIMIT = 128 * 1024;
const PROSE_SHORT_WRITE_BYTES = 200;
const QUOTED_DIALOGUE_LINE = /「[^」]*」|『[^』]*』|【[^】]*】|“[^”]*”|"[^"]*"/gu;
const TERMINAL_PUNCTUATION = new Set(Array.from("。！？…”』」）)!?.~—】\""));
const END_SIGNOFF_LINE = /^[-—~～＜<【[（(《\s]*(?:全文完|正文完|全书完|本卷完|完结|完|END|End|end|THE\s+END|The\s+End|the\s+end)[-—~～＞>】\]）)》.。！!\s]*$/u;

function isSkippableProseLine(line: string): boolean {
  return line === "" || line.startsWith("#") || line === "---" || /^[-—=*·•\s]+$/u.test(line) || END_SIGNOFF_LINE.test(line);
}

const HARD_DEFECT_PATTERNS: readonly { readonly pattern: RegExp; readonly label: string; readonly stripDialogue?: boolean }[] = [
  { pattern: /\uFFFD/u, label: "出现乱码替换字符（）" },
  { pattern: /^(?:Sure|Certainly|Here'?s|As an AI|I (?:cannot|can't|am unable|apologize))\b/u, label: "出现英文 AI 元信息前缀", stripDialogue: true },
  {
    pattern: /我(?:无法|不能)(?:继续(?:写|创作|生成|下去|输出)?|生成(?:内容|文本|正文)?|创作|续写|写作|完成(?:这个|本)?(?:章|篇|创作|请求)?)/u,
    label: "叙述中出现生成拒绝语",
    stripDialogue: true
  },
  { pattern: /[（(](?:此处|以下|这里|下文|后续)?[^）)]{0,10}(?:省略|略去|略过|略)[^）)]{0,10}[）)]/u, label: "出现括号省略占位符" },
  { pattern: /(?:未完待续|TODO|占位符|placeholder|待补充|此处待填|此处待补)/u, label: "出现未完成占位词" },
  {
    pattern: /作为(?:一个)?(?:AI|人工智能|大?语言模型|智能助手|聊天助手)(?:语言模型|大?模型|助手|机器人)?(?=[，,。、；;：:！!？?\s）)」』"】]|我|无法|不能|没法|$)/u,
    label: "叙述中出现 AI 自指元信息",
    stripDialogue: true
  },
  {
    pattern: /细纲|(?<!剧)情节点|卷纲|功能标签|目标情绪|字数目标|字数口径|章首钩子|章尾钩子|这章不能说破|本章禁止提前释放|排纲笔记|排纲底稿|任务描述/u,
    label: "叙述中泄漏写作工程词",
    stripDialogue: true
  }
];

/**
 * Deterministic, high-precision post-write hard-defect scan mirroring Oh Story
 * v0.11.0's non-blocking `proseDegenerationFindings`. Masks quoted dialogue
 * per line so one unclosed quote never suppresses checks on later paragraphs.
 */
export function detectProseHardDefects(content: string): string[] {
  const warnings = new Set<string>();
  const proseLines: string[] = [];
  for (const raw of content.split(/\r?\n/u)) {
    const line = raw.trim();
    if (isSkippableProseLine(line)) continue;
    proseLines.push(line);
    const outsideQuotes = line.replace(QUOTED_DIALOGUE_LINE, "");
    for (const rule of HARD_DEFECT_PATTERNS) {
      const sample = rule.stripDialogue === true ? outsideQuotes : line;
      if (rule.pattern.test(sample)) warnings.add(rule.label);
    }
  }
  for (let index = 1; index < proseLines.length; index += 1) {
    const current = proseLines[index]!;
    if (current === proseLines[index - 1] && Array.from(current).length >= 8) {
      warnings.add("出现紧邻行重复");
      break;
    }
  }
  if (proseLines.length > 0) {
    const last = proseLines[proseLines.length - 1]!;
    const lastChar = Array.from(last).at(-1);
    if (lastChar !== undefined && !TERMINAL_PUNCTUATION.has(lastChar)) {
      warnings.add("结尾疑似截断（未以标点收束）");
    }
  }
  return [...warnings];
}

async function duplicateChapterTitleDefects(
  fs: StoryFileSystem,
  root: string,
  book: string,
  signal?: AbortSignal
): Promise<string[]> {
  const entries = await target(fs, root, inBook(book, "正文"), signal)
    .then((directory) => fs.listDir(directory, signal))
    .catch(() => []);
  const titles = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.type !== "file" || !entry.name.endsWith(".md")) continue;
    const match = /^第0*\d+章[_\- \u3000]+(.+)$/u.exec(entry.name.slice(0, -3));
    const title = match?.[1]?.trim();
    if (title === undefined || title === "") continue;
    titles.set(title, [...titles.get(title) ?? [], entry.name]);
  }
  const findings: string[] = [];
  for (const [title, files] of titles.entries()) {
    if (files.length > 1) {
      findings.push(`章节标题重复「${title}」（${files.sort().join("、").slice(0, 60)}）`);
    }
  }
  return findings;
}

async function inspectWrittenProse(
  fs: StoryFileSystem,
  root: string,
  book: string,
  path: string,
  kind: "long" | "short",
  signal?: AbortSignal
): Promise<string[]> {
  const findings: string[] = [];
  if (fs.readBytes !== undefined) {
    try {
      const file = await target(fs, root, path, signal);
      const bytes = await fs.readBytes(file, signal, PROSE_INSPECT_LIMIT);
      if (bytes.byteLength < PROSE_SHORT_WRITE_BYTES) {
        findings.push(`正文仅 ${String(bytes.byteLength)} 字节，疑似未写完或落盘不完整`);
      }
      const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      findings.push(...detectProseHardDefects(content));
    } catch {
      // Unreadable or non-UTF-8 prose stays non-blocking.
    }
  }
  if (kind === "long") {
    findings.push(...await duplicateChapterTitleDefects(fs, root, book, signal));
  }
  return findings;
}

export interface PostWriteReminderOptions {
  /** The book has no 追踪/_tracking-state.json and no import signal. */
  readonly trackingUninitialized?: boolean;
  /** Deterministic hard-defect findings from the just-written prose file. */
  readonly hardDefects?: readonly string[];
  /** Omit long-form Tracking commit instructions (short stories or setup-only books). */
  readonly hardDefectsOnly?: boolean;
}

export function postWriteReminderText(path: string, options: PostWriteReminderOptions = {}): string {
  if (options.hardDefectsOnly === true) {
    return [
      `<oh-story-post-write>正文 ${path} 已变更。`,
      ...(options.hardDefects !== undefined && options.hardDefects.length > 0
        ? [`检测到疑似硬伤（${options.hardDefects.join("；")}），请在收尾或继续前核查并修正正文，勿将占位词或工程词留到成稿。`]
        : []),
      "</oh-story-post-write>"
    ].join("");
  }
  return [
    `<oh-story-post-write>正文 ${path} 已变更。`,
    ...(options.hardDefects !== undefined && options.hardDefects.length > 0
      ? [`检测到疑似硬伤（${options.hardDefects.join("；")}），请在收尾或继续前核查并修正正文，勿将占位词或工程词留到成稿。`]
      : []),
    "每次写入正文都会出现这条提醒，一章写到一半时也会；它不表示本章已经完成，也不是作者的新写作要求，继续当前步骤即可。",
    ...options.trackingUninitialized === true
      ? [
          "本书还没有 追踪/_tracking-state.json。新书写第一章时，draft 之前先按 story-long-write workflow-chapter 开头的初始化步骤完整读取 references/tracking-initialization.md，构造 last_chapter=0 的初始化事务存书目录 .story/work/init.json，运行 scripts/tracking_commit.js init，再运行 tracking_commit.js check，通过后删掉 init.json；",
          "书里在本章之前已有正文时不要初始化，停下来改走 story-import 的「旧追踪项目迁移」。"
        ]
      : [],
    "等本章写完收尾时再提交追踪：新章先用 story-long-write 的 scripts/tracking_commit.js draft 生成本章草稿，填好后执行 scripts/storyctl.js chapter commit（作者接受当前长度时用 chapter accept-current-length）；",
    "若 commit 返回 review_required（软门禁重点复核），优先修改对应处；如确认剧情需要保留，重新执行 commit 并附 `--ack <rule-id>:<理由>`（或 `--ack-all <理由>`）。",
    "修改已提交的章节按 workflow-revision 提交一次 mode=revision 事务；导入既有正文时由 story-import 在迁移后用 tracking_commit.js init 统一初始化。",
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
    // Tracking is committed by the main session. oh_story_role children never
    // get the reminder: narrative-writer's Role body forbids writing Tracking.
    if (ohStoryRoleOfSession(exec.agent?.session) !== undefined) return downstream;
    const fs = exec.agent?.ctx.get("fs");
    const resolved = fs === undefined ? undefined : await storyMutation(exec, fs);
    if (fs === undefined || resolved === undefined) return downstream;
    const { mutation, book, kind } = resolved;
    const { root } = mutation;
    if (!(await isPostWriteProseBook(fs, root, book, kind, exec.signal))) return downstream;
    const longFormTrackingBook = kind === "long" && await isLongFormBook(fs, root, book, exec.signal);
    const [trackingPresent, importing, hardDefects] = await Promise.all([
      longFormTrackingBook ? hasTrackingState(fs, root, book, exec.signal) : Promise.resolve(false),
      longFormTrackingBook ? hasImportSignal(fs, root, book, exec.signal) : Promise.resolve(false),
      inspectWrittenProse(fs, root, book, mutation.path, kind, exec.signal)
    ]);
    if (!longFormTrackingBook && hardDefects.length === 0) return downstream;
    const trackingUninitialized = longFormTrackingBook && !trackingPresent && !importing;
    const reminder = createUserMessage({
      source: {
        kind: "oh-story-post-write",
        form: "notice",
        summary: boundContextSummary(hardDefects.length > 0 ? `正文 ${mutation.path} 已变更（含硬伤提醒）` : `正文 ${mutation.path} 已变更`)
      },
      content: [{
        type: "text",
        text: postWriteReminderText(mutation.path, {
          trackingUninitialized,
          hardDefects,
          hardDefectsOnly: !longFormTrackingBook
        })
      }]
    });
    return {
      ...downstream,
      additionalContexts: [...downstream.additionalContexts ?? [], reminder]
    };
  });
}
