import type { CanvasPoint } from "./production-runtime.js";
import type { GameProject, GameWorkspaceFile } from "./game-workspace-types.js";

export type GameCreativeDocumentKind = "brief" | "source" | "concept" | "design" | "art" | "build";
export type GameCanvasNodeKind = GameCreativeDocumentKind | "character" | "world" | "preview";

export interface GameCreativeDocument {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly kind: GameCreativeDocumentKind;
  readonly eyebrow: string;
}

export interface GameCanvasNode {
  readonly id: string;
  readonly kind: GameCanvasNodeKind;
  readonly title: string;
  readonly eyebrow: string;
  readonly path?: string | undefined;
  readonly excerpt?: string | undefined;
  readonly initial: CanvasPoint;
  readonly width: number;
  readonly height: number;
}

export interface GameCanvasEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

interface KnownCreativeDocument {
  readonly relativePath: string;
  readonly title: string;
  readonly kind: GameCreativeDocumentKind;
  readonly eyebrow: string;
  readonly initial: CanvasPoint;
}

const DOCUMENT_WIDTH = 292;
const DOCUMENT_HEIGHT = 188;
const PREVIEW_WIDTH = 316;
const PREVIEW_HEIGHT = 208;

const KNOWN_CREATIVE_DOCUMENTS: readonly KnownCreativeDocument[] = [
  { relativePath: "PRODUCT_BRIEF.md", title: "我们想做的游戏", kind: "brief", eyebrow: "创作方向", initial: { x: 80, y: 96 } },
  { relativePath: "analysis/SOURCE_BIBLE.md", title: "原著与故事依据", kind: "source", eyebrow: "故事来源", initial: { x: 80, y: 342 } },
  { relativePath: "concepts/CONCEPT.md", title: "玩家为什么想继续", kind: "concept", eyebrow: "核心构想", initial: { x: 80, y: 588 } },
  { relativePath: "design/GAME_DESIGN.md", title: "选择与玩法", kind: "design", eyebrow: "游戏设计", initial: { x: 472, y: 342 } },
  { relativePath: "design/ART_DIRECTION.md", title: "画面与氛围", kind: "art", eyebrow: "视觉表达", initial: { x: 864, y: 96 } },
  { relativePath: "build/BUILD_BRIEF.md", title: "这一版想做什么", kind: "build", eyebrow: "试玩构想", initial: { x: 864, y: 342 } }
] as const;

/** Returns only known creative Markdown files that actually exist inside this project. */
export function gameCreativeDocuments(project: GameProject, files: readonly GameWorkspaceFile[]): readonly GameCreativeDocument[] {
  const root = normalizeRoot(project.root);
  const textPaths = new Set(files.filter((file) => file.kind === "text").map((file) => normalizePath(file.path)));
  return KNOWN_CREATIVE_DOCUMENTS.flatMap((known) => {
    const path = `${root}/${known.relativePath}`;
    if (!textPaths.has(path)) return [];
    return [{
      id: `game:${project.id}:document:${known.relativePath}`,
      title: known.title,
      path,
      kind: known.kind,
      eyebrow: known.eyebrow
    }];
  });
}

export function gameCanvasNodes(project: GameProject, files: readonly GameWorkspaceFile[], documents: Readonly<Record<string, string>>): GameCanvasNode[] {
  const knownByPath = new Map(KNOWN_CREATIVE_DOCUMENTS.map((known) => [`${normalizeRoot(project.root)}/${known.relativePath}`, known]));
  const nodes: GameCanvasNode[] = gameCreativeDocuments(project, files).map((document) => {
    const known = knownByPath.get(document.path);
    const content = documents[document.path];
    return {
      ...document,
      title: markdownTitle(content) ?? document.title,
      excerpt: markdownExcerpt(content),
      initial: known?.initial ?? { x: 0, y: 0 },
      width: DOCUMENT_WIDTH,
      height: DOCUMENT_HEIGHT
    };
  });
  const design = nodes.find((node) => node.kind === "design");
  if (design?.path !== undefined) {
    const sections = gameDesignSections(documents[design.path]);
    for (const section of sections) nodes.push({
      id: `${design.id}:section:${section.kind}`,
      kind: section.kind,
      title: section.title,
      eyebrow: section.kind === "character" ? "人物与关系" : "世界与场景",
      path: design.path,
      excerpt: section.excerpt,
      initial: section.kind === "character" ? { x: 864, y: 588 } : { x: 864, y: 834 },
      width: DOCUMENT_WIDTH,
      height: DOCUMENT_HEIGHT
    });
  }
  if (project.previewReady) nodes.push({
    id: `game:${project.id}:preview`,
    kind: "preview",
    title: project.title.trim() || "可试玩版本",
    eyebrow: "可试玩版本",
    initial: { x: 1256, y: 342 },
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT
  });
  return nodes;
}

/** Relations are emitted only when both real artifacts exist. */
export function gameCanvasEdges(nodes: readonly GameCanvasNode[]): GameCanvasEdge[] {
  const byKind = new Map(nodes.map((node) => [node.kind, node]));
  const candidates: readonly [GameCanvasNodeKind, GameCanvasNodeKind, string][] = [
    ["source", "design", "故事与选择"],
    ["brief", "design", "体验目标"],
    ["concept", "design", "核心乐趣"],
    ["design", "preview", "在这里玩起来"],
    ["art", "preview", "画面与氛围"],
    ["build", "preview", "这一版想调整"],
    ["character", "preview", "和谁相遇"],
    ["world", "preview", "在哪里探索"]
  ];
  return candidates.flatMap(([fromKind, toKind, label]) => {
    const from = byKind.get(fromKind);
    const to = byKind.get(toKind);
    return from === undefined || to === undefined ? [] : [{ from: from.id, to: to.id, label }];
  });
}

interface GameDesignSection {
  readonly kind: "character" | "world";
  readonly title: string;
  readonly excerpt: string;
}

function gameDesignSections(content: string | undefined): GameDesignSection[] {
  if (content === undefined) return [];
  const headings = [...content.matchAll(/^(#{1,6})\s+(.+)$/gmu)];
  const sections: GameDesignSection[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    if (match === undefined) continue;
    const rawTitle = match[2];
    const start = match.index;
    if (rawTitle === undefined || start === undefined) continue;
    const title = cleanMarkdownText(rawTitle.replace(/\s+#+\s*$/u, ""));
    const kind = gameDesignSectionKind(title);
    if (kind === undefined || sections.some((section) => section.kind === kind)) continue;
    const bodyStart = start + match[0].length;
    const nextHeading = headings.slice(index + 1).find((candidate) => (candidate[1]?.length ?? 7) <= (match[1]?.length ?? 0));
    const body = content.slice(bodyStart, nextHeading?.index ?? content.length);
    const excerpt = markdownExcerpt(body);
    if (excerpt === undefined || /^(?:TODO|TBD|待补|待定|暂无)[。.!！]?$/iu.test(excerpt)) continue;
    sections.push({ kind, title: truncate(title, 48), excerpt });
  }
  return sections;
}

function gameDesignSectionKind(title: string): GameDesignSection["kind"] | undefined {
  const normalized = title.replace(/[\s/·：:、-]+/gu, "");
  if (/^(?:主要|核心|可玩)?(?:人物|角色)(?:与关系|关系|设定|设计|介绍|档案|列表)?$/u.test(normalized)) return "character";
  if (/^(?:游戏|故事)?(?:世界|场景)(?:观|与场景|设定|设计|介绍|地图)?$/u.test(normalized)) return "world";
  return undefined;
}

function markdownTitle(content: string | undefined): string | undefined {
  if (content === undefined) return undefined;
  const heading = content.match(/^#\s+(.+)$/mu)?.[1];
  if (heading === undefined) return undefined;
  const cleaned = cleanMarkdownText(heading.replace(/\s+#+\s*$/u, ""));
  const conventional = /^(?:PRODUCT_?BRIEF|SOURCE_?BIBLE|CONCEPT|GAME_?DESIGN|ART_?DIRECTION|BUILD_?BRIEF)(?:\s*[·:：|—–-]\s*(.*))?$/u.exec(cleaned);
  const title = conventional === null ? cleaned : conventional[1]?.trim() ?? "";
  return title.length === 0 ? undefined : truncate(title, 48);
}

function markdownExcerpt(content: string | undefined): string | undefined {
  if (content === undefined) return undefined;
  let inFence = false;
  const lines: string[] = [];
  for (const raw of content.replace(/<!--[\s\S]*?(?:-->|$)/gu, " ").split(/\r?\n/u)) {
    const line = raw.trim();
    if (/^```/u.test(line)) { inFence = !inFence; continue; }
    if (inFence || line.length === 0 || /^#{1,6}\s/u.test(line) || /^\|/u.test(line) || /^\|?\s*:?-{3,}/u.test(line)) continue;
    const cleaned = cleanMarkdownText(line.replace(/^(?:[-*+]|\d+[.)])\s+/u, "").replace(/^>\s?/u, ""));
    if (cleaned.length > 0) lines.push(cleaned);
    if (lines.join(" ").length >= 132) break;
  }
  const excerpt = lines.join(" ").trim();
  return excerpt.length === 0 ? undefined : truncate(excerpt, 150);
}

function cleanMarkdownText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[*_~`]+/gu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[<>]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}…`;
}

function normalizeRoot(root: string): string {
  return normalizePath(root).replace(/\/$/u, "");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+/gu, "/");
}
