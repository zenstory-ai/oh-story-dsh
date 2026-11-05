import type { DramaDocumentTarget, DramaEpisodeProduction } from "./drama-production.js";
import type { CanvasPoint } from "./production-runtime.js";

export type ProductionCanvasNodeKind = "story" | "asset" | "shot";
export type ProductionCanvasEdgeKind = "story" | "reference" | "sequence";

export interface ProductionCanvasNode {
  readonly id: string;
  readonly title: string;
  readonly kind: ProductionCanvasNodeKind;
  readonly eyebrow: string;
  readonly description?: string | undefined;
  readonly prompt?: string | undefined;
  readonly videoPrompt?: string | undefined;
  readonly initial: CanvasPoint;
  readonly width: number;
  readonly height: number;
  readonly target?: DramaDocumentTarget | undefined;
}

export interface ProductionCanvasEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: ProductionCanvasEdgeKind;
  readonly label: string;
}

const STORY_SIZE = { width: 260, height: 210 } as const;
const ASSET_SIZE = { width: 248, height: 270 } as const;
const SHOT_SIZE = { width: 292, height: 310 } as const;
const ORIGIN = { x: 80, y: 80 } as const;
const COLUMN_GAP = 36;
const ROW_GAP = 40;
const GROUP_GAP = 180;

const ASSET_LABEL = {
  character: "人物参考",
  scene: "场景参考",
  prop: "道具参考",
  state: "状态参考",
  unknown: "视觉设定"
} as const;

export function productionCanvasNodes(production: DramaEpisodeProduction, documents: Readonly<Record<string, string>> = {}): ProductionCanvasNode[] {
  const screenplayPath = `${production.episodeDirectory}/剧本.md`;
  const documentScenes = screenplayScenes(screenplayPath, documents[screenplayPath]);
  const sceneIds = unique([...documentScenes.map((scene) => scene.id), ...production.shots.flatMap((shot) => shot.sceneIds.length > 0
    ? shot.sceneIds
    : shot.source === undefined ? [] : [shot.source])]);
  const story = sceneIds.map((id, index) => {
    const related = production.shots.filter((shot) => shot.sceneIds.includes(id) || (shot.sceneIds.length === 0 && shot.source === id));
    const documentScene = documentScenes.find((scene) => scene.id === id);
    const target = production.targets.get(id) ?? documentScene?.target;
    const excerpt = documentScene ?? storyExcerpt(target, documents);
    return {
      id,
      title: excerpt?.title.replace(/^[A-Z0-9]+-SC\d+\s*[·｜|]?\s*/iu, "") || `场次 ${String(index + 1)}`,
      kind: "story" as const,
      eyebrow: "剧本场次",
      description: excerpt?.body ?? (related.length === 0 ? undefined : `延展为 ${String(related.length)} 个镜头`),
      target
    };
  });

  const declaredTitles = new Set(production.assets.map((asset) => asset.title));
  const assetSources = [
    ...production.assets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      description: asset.purpose ?? asset.reference ?? asset.description,
      prompt: asset.prompt ?? asset.description,
      target: production.targets.get(asset.id)
    })),
    ...production.visualAssets.filter((asset) => !declaredTitles.has(asset.title)).map((asset) => ({
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      description: asset.description,
      prompt: asset.description,
      target: production.targets.get(asset.id)
    }))
  ];
  const assets = assetSources.map((asset) => ({
    ...asset,
    kind: "asset" as const,
    eyebrow: ASSET_LABEL[asset.kind]
  }));
  const shots = production.shots.map((shot, index) => ({
    id: shot.id,
    title: shot.title,
    kind: "shot" as const,
    eyebrow: `${String(index + 1).padStart(2, "0")} · 镜头${shot.durationSeconds === undefined ? "" : ` · ${String(shot.durationSeconds)}s`}`,
    description: shot.purpose ?? shot.shotSpec ?? shot.start,
    prompt: shot.keyframePrompt,
    videoPrompt: shot.motion?.prompt,
    target: production.targets.get(shot.id)
  }));

  const storyLayout = layoutGrid(story.length, ORIGIN, STORY_SIZE, 1);
  const storyRight = gridRight(storyLayout, STORY_SIZE, ORIGIN.x);
  const assetOrigin = { x: storyRight + GROUP_GAP, y: ORIGIN.y };
  const assetLayout = layoutGrid(assets.length, assetOrigin, ASSET_SIZE, 2);
  const assetRight = gridRight(assetLayout, ASSET_SIZE, assetOrigin.x);
  const shotOrigin = { x: assetRight + GROUP_GAP, y: ORIGIN.y };
  const shotLayout = layoutGrid(shots.length, shotOrigin, SHOT_SIZE, 3);

  return [
    ...story.map((node, index) => ({ ...node, initial: storyLayout[index]!, ...STORY_SIZE })),
    ...assets.map((node, index) => ({ ...node, initial: assetLayout[index]!, ...ASSET_SIZE })),
    ...shots.map((node, index) => ({ ...node, initial: shotLayout[index]!, ...SHOT_SIZE }))
  ];
}

export function productionCanvasEdges(production: DramaEpisodeProduction): ProductionCanvasEdge[] {
  const nodeIds = new Set(productionCanvasNodes(production).map((node) => node.id));
  const edges: ProductionCanvasEdge[] = [];
  for (const [index, shot] of production.shots.entries()) {
    const stories = shot.sceneIds.length > 0 ? shot.sceneIds : shot.source === undefined ? [] : [shot.source];
    for (const id of stories) if (nodeIds.has(id)) edges.push({ from: id, to: shot.id, kind: "story", label: "故事里的镜头" });
    for (const id of shot.references) if (nodeIds.has(id)) edges.push({ from: id, to: shot.id, kind: "reference", label: "画面参考" });
    const next = production.shots[index + 1];
    if (next !== undefined) edges.push({ from: shot.id, to: next.id, kind: "sequence", label: "接着发生" });
  }
  return uniqueBy(edges, (edge) => `${edge.kind}:${edge.from}:${edge.to}`);
}

export function layoutGrid(count: number, origin: CanvasPoint, size: { readonly width: number; readonly height: number }, columns: number): CanvasPoint[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  return Array.from({ length: count }, (_, index) => ({
    x: origin.x + (index % safeColumns) * (size.width + COLUMN_GAP),
    y: origin.y + Math.floor(index / safeColumns) * (size.height + ROW_GAP)
  }));
}

function gridRight(points: readonly CanvasPoint[], size: { readonly width: number }, fallback: number): number {
  return points.length === 0 ? fallback : Math.max(...points.map((point) => point.x + size.width));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function storyExcerpt(target: DramaDocumentTarget | undefined, documents: Readonly<Record<string, string>>): { readonly title: string; readonly body?: string | undefined } | undefined {
  if (target === undefined) return undefined;
  const document = documents[target.path];
  if (document === undefined) return undefined;
  const section = document.slice(target.offset).split(/\n(?=#{1,2}\s)/u, 1)[0]?.trim();
  if (section === undefined || section === "") return undefined;
  const lines = section.split("\n");
  const heading = lines.shift()?.replace(/^#{1,6}\s*/u, "").trim();
  if (heading === undefined || heading === "") return undefined;
  const body = lines.join(" ").replace(/(?:^|\s)[-*]\s+/gu, " ").replace(/\s+/gu, " ").trim();
  return { title: heading, body: body === "" ? undefined : body.slice(0, 150) };
}

function screenplayScenes(path: string, document: string | undefined): Array<{ readonly id: string; readonly title: string; readonly body?: string | undefined; readonly target: DramaDocumentTarget }> {
  if (document === undefined) return [];
  const headings = [...document.matchAll(/^##\s+([^\n]+)$/gmu)];
  return headings.flatMap((match, index) => {
    const heading = match[1]?.trim();
    const offset = match.index;
    if (heading === undefined || offset === undefined) return [];
    const id = /^([A-Z][A-Z0-9-]{3,})(?:\s|$)/u.exec(heading)?.[1];
    if (id === undefined) return [];
    const end = headings[index + 1]?.index ?? document.length;
    const body = document.slice(offset + match[0].length, end).replace(/\s+/gu, " ").trim();
    return [{ id, title: heading, body: body === "" ? undefined : body.slice(0, 150), target: { path, offset, id } }];
  });
}
