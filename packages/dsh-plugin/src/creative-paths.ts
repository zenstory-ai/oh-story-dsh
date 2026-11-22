export const STORY_DIRECTORIES = ["正文", "大纲", "设定", "追踪", "对标", "参考资料", "拆文库", "扫榜", "封面"] as const;
export const DRAMA_DIRECTORIES = ["输入", "项目开发", "设定集", "剧集", "交付", "创作者决策", "审查"] as const;
export const GAME_DIRECTORY = "game-adaptations";
export const VIDEO_DIRECTORY = "video-recaps";
// Preview studios need only a small manifest-driven subset, so discover them before a very large
// prose workspace can consume the shared listing budget.
export const CREATIVE_DIRECTORIES = [VIDEO_DIRECTORY, GAME_DIRECTORY, ...STORY_DIRECTORIES, ...DRAMA_DIRECTORIES] as const;
/** Oh Story short fiction keeps one book as three files at the book root (DSH: the workspace root). */
export const SHORT_STORY_FILES = ["正文.md", "设定.md", "小节大纲.md"] as const;
export const SHORT_STORY_FILE_SET: ReadonlySet<string> = new Set<string>(SHORT_STORY_FILES);
export const ROOT_FILES: ReadonlySet<string> = new Set<string>(["short-drama.json", ...SHORT_STORY_FILES]);
/** High-volume build/dependency/VCS directories never scanned or surfaced by creative routes. */
export const SKIPPED_SCAN_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".vite",
  "__pycache__"
]);

const STORY_DIRECTORY_SET: ReadonlySet<string> = new Set<string>(STORY_DIRECTORIES);
const DRAMA_DIRECTORY_SET: ReadonlySet<string> = new Set<string>(DRAMA_DIRECTORIES);
const CREATIVE_DIRECTORY_SET: ReadonlySet<string> = new Set<string>(CREATIVE_DIRECTORIES);

const EDITABLE_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl"]);
const GAME_EDITABLE_EXTENSIONS = new Set([...EDITABLE_EXTENSIONS, ".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const VIDEO_EDITABLE_EXTENSIONS = new Set([...EDITABLE_EXTENSIONS, ".srt", ".ass"]);
const PUBLISH_ROOT_FILE_PATTERN = /^发布资料(?:-[^/]+)?\.md$/u;
export const MAX_BOOK_PREFIX_DEPTH = 4;

export function pathExtension(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash < 0 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

export function isPublishRootFile(name: string): boolean {
  return !name.includes("/") && PUBLISH_ROOT_FILE_PATTERN.test(name);
}

/** Reject empty paths, absolute/backslash paths, traversal, and any dot-prefixed segment. */
export function safeRelativePath(path: string): boolean {
  return path !== ""
    && !path.startsWith("/")
    && !path.includes("\\")
    && !path.split("/").some((segment) => segment === "" || segment.startsWith("."));
}

/**
 * Match a multi-book novel layout `{bookPrefix}/{正文|大纲|设定|追踪|...}/...` or
 * `{bookPrefix}/{正文.md|设定.md|小节大纲.md|发布资料*.md}`, allowing nested book roots
 * up to depth 4 (matching Oh Story v0.11.0 `.active-book` discovery).
 */
function multiBookCreativeRoot(path: string): string | undefined {
  const parts = path.split("/");
  if (parts.length < 2) return undefined;
  const maxPrefix = Math.min(MAX_BOOK_PREFIX_DEPTH, parts.length - 1);
  for (let bookDepth = 1; bookDepth <= maxPrefix; bookDepth += 1) {
    const prefix = parts.slice(0, bookDepth);
    if (prefix.some((segment) => segment === "" || SKIPPED_SCAN_DIRECTORIES.has(segment) || CREATIVE_DIRECTORY_SET.has(segment))) {
      return undefined;
    }
    const child = parts[bookDepth]!;
    if (parts.length >= bookDepth + 2 && STORY_DIRECTORY_SET.has(child)) {
      return `${prefix.join("/")}/${child}`;
    }
    if (parts.length === bookDepth + 1 && (SHORT_STORY_FILE_SET.has(child) || isPublishRootFile(child))) {
      return prefix.join("/");
    }
  }
  return undefined;
}

/** Multi-book novel layouts keep books in `{书名}/{正文|大纲|设定|追踪|...}/` or `{书名}/正文.md` (up to depth 4). */
export function isMultiBookStoryPath(path: string): boolean {
  return multiBookCreativeRoot(path) !== undefined;
}

export function isCreativeRootPath(path: string): boolean {
  const root = path.split("/", 1)[0];
  return (root !== undefined && CREATIVE_DIRECTORY_SET.has(root))
    || ROOT_FILES.has(path)
    || isPublishRootFile(path)
    || isMultiBookStoryPath(path);
}

/**
 * The authoritative creative root directory that must contain `path` after resolution.
 * Returns `""` for workspace-root creative files (such as `正文.md`, `short-drama.json`,
 * or `发布资料*.md`), which are confined to the workspace root itself.
 */
export function creativeRootDirectory(path: string): string | undefined {
  if (!safeRelativePath(path)) return undefined;
  if (ROOT_FILES.has(path) || isPublishRootFile(path)) return "";
  const parts = path.split("/");
  const first = parts[0];
  if (first !== undefined && CREATIVE_DIRECTORY_SET.has(first)) return first;
  return multiBookCreativeRoot(path);
}

export function editableCreativePath(path: string): boolean {
  const extensions = path.startsWith(`${GAME_DIRECTORY}/`) ? GAME_EDITABLE_EXTENSIONS
    : path.startsWith(`${VIDEO_DIRECTORY}/`) ? VIDEO_EDITABLE_EXTENSIONS
      : EDITABLE_EXTENSIONS;
  return extensions.has(pathExtension(path));
}

export function isStoryDirectory(directory: string): boolean {
  return STORY_DIRECTORY_SET.has(directory);
}

export function isDramaDirectory(directory: string): boolean {
  return DRAMA_DIRECTORY_SET.has(directory);
}
