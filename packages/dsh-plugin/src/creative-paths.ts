export const STORY_DIRECTORIES = ["正文", "大纲", "设定", "追踪", "对标", "参考资料"] as const;
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

const STORY_DIRECTORY_SET: ReadonlySet<string> = new Set<string>(STORY_DIRECTORIES);
const DRAMA_DIRECTORY_SET: ReadonlySet<string> = new Set<string>(DRAMA_DIRECTORIES);
const CREATIVE_DIRECTORY_SET: ReadonlySet<string> = new Set<string>(CREATIVE_DIRECTORIES);

const EDITABLE_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl"]);
const GAME_EDITABLE_EXTENSIONS = new Set([...EDITABLE_EXTENSIONS, ".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const VIDEO_EDITABLE_EXTENSIONS = new Set([...EDITABLE_EXTENSIONS, ".srt", ".ass"]);

export function pathExtension(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash < 0 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

export function safeRelativePath(path: string): boolean {
  return path !== ""
    && !path.startsWith("/")
    && !path.includes("\\")
    && !path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

export function isCreativeRootPath(path: string): boolean {
  const root = path.split("/", 1)[0];
  return (root !== undefined && CREATIVE_DIRECTORY_SET.has(root)) || ROOT_FILES.has(path);
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
