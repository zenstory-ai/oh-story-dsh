export type DramaProductionSection = "shots" | "assets" | "tasks" | "sequence" | "canvas";

export type DramaAssetKind = "character" | "scene" | "prop" | "state" | "unknown";
export const PRODUCTION_PROTOCOL_VERSION = "short-drama/v1";

export interface DramaProductionDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly path: string;
  readonly offset: number;
  readonly line: number;
  readonly targetId?: string | undefined;
  readonly message: string;
}

export interface DramaDocumentTarget {
  readonly path: string;
  readonly offset: number;
  readonly id: string;
}

export interface DramaMotionGroup {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly offset: number;
  readonly memberMotionIds: readonly string[];
  readonly memberShotIds: readonly string[];
  readonly durationSeconds?: number | undefined;
  readonly reason?: string | undefined;
  readonly prompt?: string | undefined;
}

export interface DramaMusicPrompt {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly offset: number;
  readonly range?: string | undefined;
  readonly purpose?: string | undefined;
  readonly mood?: string | undefined;
  readonly avoid?: string | undefined;
  readonly prompt?: string | undefined;
}

export interface DramaShot {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly offset: number;
  readonly source?: string | undefined;
  /** Screenplay scene IDs named by 来源, in document order; empty when the field names none. */
  readonly sceneIds: readonly string[];
  readonly durationSeconds?: number | undefined;
  readonly purpose?: string | undefined;
  readonly shotSpec?: string | undefined;
  readonly start?: string | undefined;
  readonly end?: string | undefined;
  readonly references: readonly string[];
  readonly keyframePrompt?: string | undefined;
  readonly motion?: DramaMotionPrompt | undefined;
  readonly group?: DramaMotionGroup | undefined;
}

export interface DramaAsset {
  readonly id: string;
  readonly title: string;
  readonly kind: DramaAssetKind;
  readonly path: string;
  readonly offset: number;
  readonly purpose?: string | undefined;
  readonly reference?: string | undefined;
  readonly prompt?: string | undefined;
}

export interface DramaMotionPrompt {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly offset: number;
  readonly shotId?: string | undefined;
  readonly durationSeconds?: number | undefined;
  readonly startFrame?: string | undefined;
  readonly end?: string | undefined;
  readonly prompt?: string | undefined;
}

export interface DramaVisualAsset {
  readonly id: string;
  readonly title: string;
  readonly kind: DramaAssetKind;
  readonly path: string;
  readonly offset: number;
  readonly description: string;
  readonly stableId: boolean;
  readonly declaredId?: string | undefined;
}

export interface DramaEpisodeProduction {
  readonly protocolVersion: typeof PRODUCTION_PROTOCOL_VERSION;
  readonly episodeDirectory: string;
  readonly shots: readonly DramaShot[];
  readonly assets: readonly DramaAsset[];
  readonly visualAssets: readonly DramaVisualAsset[];
  readonly motions: readonly DramaMotionPrompt[];
  readonly groups: readonly DramaMotionGroup[];
  readonly music: readonly DramaMusicPrompt[];
  readonly targets: ReadonlyMap<string, DramaDocumentTarget>;
  readonly documentPaths: readonly string[];
  readonly diagnostics: readonly DramaProductionDiagnostic[];
}

interface MarkdownSection {
  readonly heading: string;
  readonly body: string;
  readonly offset: number;
}

const CREATOR_DOCUMENT_NAMES = new Set(["剧本.md", "视觉设定.md", "分镜.md", "图片提示词.md", "视频提示词.md"]);

export function episodeDirectoryForPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const match = /^(剧集\/[^/]+)\/[^/]+$/u.exec(path);
  return match?.[1];
}

export function isCreatorDocumentPath(path: string): boolean {
  const directory = episodeDirectoryForPath(path);
  const name = path.split("/").at(-1);
  return directory !== undefined && name !== undefined && CREATOR_DOCUMENT_NAMES.has(name);
}

export function creatorDocumentPaths(files: readonly { readonly path: string }[], episodeDirectory: string): string[] {
  return files
    .map((file) => file.path)
    .filter((path) => path.startsWith(`${episodeDirectory}/`) && CREATOR_DOCUMENT_NAMES.has(path.slice(episodeDirectory.length + 1)))
    .sort((left, right) => creatorDocumentOrder(left) - creatorDocumentOrder(right) || left.localeCompare(right, "zh-Hans-CN"));
}

export function parseEpisodeProduction(documents: Readonly<Record<string, string>>, episodeDirectory: string): DramaEpisodeProduction {
  const storyboardPath = `${episodeDirectory}/分镜.md`;
  const imagePromptPath = `${episodeDirectory}/图片提示词.md`;
  const videoPromptPath = `${episodeDirectory}/视频提示词.md`;
  const visualPath = `${episodeDirectory}/视觉设定.md`;
  const shots = parseStoryboard(storyboardPath, documents[storyboardPath] ?? "");
  const assets = parseImagePrompts(imagePromptPath, documents[imagePromptPath] ?? "");
  const motions = parseVideoPrompts(videoPromptPath, documents[videoPromptPath] ?? "");
  const rawGroups = parseVideoGroups(videoPromptPath, documents[videoPromptPath] ?? "");
  const music = parseMusicPrompts(videoPromptPath, documents[videoPromptPath] ?? "");
  const visualAssets = parseVisualAssets(visualPath, documents[visualPath] ?? "");
  const motionById = new Map(motions.map((motion) => [motion.id, motion] as const));
  const motionByShot = new Map(motions.flatMap((motion) => motion.shotId === undefined ? [] : [[motion.shotId, motion] as const]));
  const groups = rawGroups.map((group): DramaMotionGroup => {
    const resolvedShots = new Set<string>(group.memberShotIds);
    for (const memberId of group.memberMotionIds) {
      const shotId = motionById.get(memberId)?.shotId;
      if (shotId !== undefined) resolvedShots.add(shotId);
    }
    return { ...group, memberShotIds: [...resolvedShots] };
  });
  const groupByShot = new Map<string, DramaMotionGroup>();
  for (const group of groups) {
    for (const shotId of group.memberShotIds) {
      if (!groupByShot.has(shotId)) groupByShot.set(shotId, group);
    }
  }
  const linkedShots = shots.map((shot) => ({
    ...shot,
    motion: motionByShot.get(shot.id),
    group: groupByShot.get(shot.id)
  }));
  const targets = new Map<string, DramaDocumentTarget>();
  for (const item of [...linkedShots, ...assets, ...motions, ...groups, ...music, ...visualAssets]) {
    targets.set(item.id, { path: item.path, offset: item.offset, id: item.id });
  }
  const screenplayPath = `${episodeDirectory}/剧本.md`;
  for (const shot of linkedShots) {
    for (const id of sourceKeys(shot)) {
      const target = sectionTarget(screenplayPath, documents[screenplayPath] ?? "", id);
      if (target === undefined) continue;
      targets.set(id, target);
    }
  }
  const diagnostics = validateProductionProtocol({
    documents,
    episodeDirectory,
    shots: linkedShots,
    assets,
    visualAssets,
    motions,
    groups,
    music
  });
  return {
    protocolVersion: PRODUCTION_PROTOCOL_VERSION,
    episodeDirectory,
    shots: linkedShots,
    assets,
    visualAssets,
    motions,
    groups,
    music,
    targets,
    documentPaths: Object.keys(documents).filter((path) => path.startsWith(`${episodeDirectory}/`)),
    diagnostics
  };
}

export function parseStoryboard(path: string, content: string): DramaShot[] {
  return levelTwoSections(content).flatMap((section) => {
    const match = /^(SHOT-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
    if (match === null || match[1] === undefined) return [];
    const fields = bulletFields(section.body);
    const id = match[1].toLocaleUpperCase();
    const source = firstField(fields, "来源", "场次");
    const referenceText = [
      fields.get("图片提示词项"),
      fields.get("输入参考图"),
      fields.get("参考"),
      fields.get("关联资产")
    ].filter((value): value is string => value !== undefined && value !== "").join("；");
    return [{
      id,
      title: match[2]?.trim() || id,
      path,
      offset: section.offset,
      source,
      sceneIds: sourceSceneIds(source),
      durationSeconds: seconds(firstField(fields, "时长")),
      purpose: firstField(fields, "目的", "镜头目的"),
      shotSpec: firstField(fields, "景别/机位", "景别", "镜头规格"),
      start: firstField(fields, "起点", "起始"),
      end: firstField(fields, "终点", "结束"),
      references: splitReferences(referenceText),
      keyframePrompt: quoteUnderHeading(section.body, "首帧提示词") ?? quoteUnderHeading(section.body, "冻结关键帧提示词")
    }];
  });
}

export function parseImagePrompts(path: string, content: string): DramaAsset[] {
  return levelTwoSections(content).flatMap((section) => {
    const match = /^(IMG-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
    if (match === null || match[1] === undefined) return [];
    const fields = bulletFields(section.body);
    const id = match[1].toLocaleUpperCase();
    const title = match[2]?.trim() || id;
    return [{
      id,
      title,
      kind: inferAssetKind(`${id} ${title} ${firstField(fields, "用途") ?? ""}`),
      path,
      offset: section.offset,
      purpose: firstField(fields, "用途"),
      reference: firstField(fields, "参考", "参考约束"),
      prompt: quoteUnderHeading(section.body, "可复制提示词") ?? firstField(fields, "核心提示词", "可复制提示词")
    }];
  });
}

export function parseVideoPrompts(path: string, content: string): DramaMotionPrompt[] {
  return levelTwoSections(content).flatMap((section) => {
    const match = /^(MOTION-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
    if (match === null || match[1] === undefined) return [];
    const fields = bulletFields(section.body);
    const id = match[1].toLocaleUpperCase();
    const shotId = firstField(fields, "分镜", "镜头")?.match(/SHOT-[A-Z0-9-]+/iu)?.[0]?.toLocaleUpperCase();
    return [{
      id,
      title: match[2]?.trim() || id,
      path,
      offset: section.offset,
      shotId,
      durationSeconds: seconds(firstField(fields, "时长")),
      startFrame: firstField(fields, "起始帧", "开场画面", "起点"),
      end: firstField(fields, "终点", "动作过程", "结束"),
      prompt: quoteUnderHeading(section.body, "可复制提示词") ?? firstField(fields, "核心提示词", "可复制提示词")
    }];
  });
}

export function parseVideoGroups(path: string, content: string): DramaMotionGroup[] {
  return levelTwoSections(content).flatMap((section) => {
    const match = /^(GROUP-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
    if (match === null || match[1] === undefined) return [];
    const fields = bulletFields(section.body);
    const id = match[1].toLocaleUpperCase();
    const membersField = firstField(fields, "成员", "分镜", "镜头") ?? "";
    const memberMotionIds = [...new Set((membersField.match(/MOTION-[A-Z0-9-]+/giu) ?? []).map((item) => item.toLocaleUpperCase()))];
    const memberShotIds = [...new Set((membersField.match(/SHOT-[A-Z0-9-]+/giu) ?? []).map((item) => item.toLocaleUpperCase()))];
    return [{
      id,
      title: match[2]?.trim() || id,
      path,
      offset: section.offset,
      memberMotionIds,
      memberShotIds,
      durationSeconds: seconds(firstField(fields, "时长")),
      reason: firstField(fields, "理由", "合生理由"),
      prompt: quoteUnderHeading(section.body, "可复制提示词") ?? firstField(fields, "核心提示词", "可复制提示词")
    }];
  });
}

export function parseMusicPrompts(path: string, content: string): DramaMusicPrompt[] {
  return levelTwoSections(content).flatMap((section) => {
    const match = /^(MUSIC-[A-Z0-9-]+)\s*(?:[·｜|]\s*)?(.*)$/iu.exec(section.heading.trim());
    if (match === null || match[1] === undefined) return [];
    const fields = bulletFields(section.body);
    const id = match[1].toLocaleUpperCase();
    return [{
      id,
      title: match[2]?.trim() || id,
      path,
      offset: section.offset,
      range: firstField(fields, "区间", "覆盖区间"),
      purpose: firstField(fields, "剧情作用", "用途"),
      mood: firstField(fields, "情绪与乐器", "曲风", "风格"),
      avoid: firstField(fields, "禁用", "避免"),
      prompt: quoteUnderHeading(section.body, "可复制提示词") ?? firstField(fields, "核心提示词", "可复制提示词")
    }];
  });
}

export function parseVisualAssets(path: string, content: string): DramaVisualAsset[] {
  return levelTwoSections(content).flatMap((section) => {
    const match = /^(人物|角色|造型|地点|场景|道具|状态)\s*[·｜|:：]\s*(.+)$/u.exec(section.heading.trim());
    if (match === null || match[1] === undefined || match[2] === undefined) return [];
    const title = match[2].trim();
    if (title === "") return [];
    const fields = bulletFields(section.body);
    const declaredId = firstField(fields, "ID", "资产 ID", "资产ID")?.trim().toLocaleUpperCase();
    const stableId = declaredId !== undefined && /^VISUAL-[A-Z0-9-]+$/u.test(declaredId);
    const id = stableId ? declaredId : `VISUAL-${slug(`${match[1]}-${title}`)}`;
    return [{ id, title, kind: inferAssetKind(`${match[1]} ${title}`), path, offset: section.offset, description: section.body.trim(), stableId, declaredId }];
  });
}

/** Known episode production target IDs for matching workspace media paths (longest first). */
export function productionKnownTargets(production: DramaEpisodeProduction): string[] {
  return [
    ...production.shots.map((shot) => shot.id),
    ...production.assets.map((asset) => asset.id),
    ...production.visualAssets.map((asset) => asset.id),
    ...production.motions.map((motion) => motion.id),
    ...production.groups.map((group) => group.id),
    ...production.music.map((item) => item.id)
  ].sort((left, right) => right.length - left.length);
}

/** Map a matched media target ID (`MOTION-*`, `GROUP-*`, `MUSIC-*`, etc.) to its canonical display target(s). */
export function resolveMediaTargetIds(production: DramaEpisodeProduction, matchedId: string): string[] {
  const motion = production.motions.find((item) => item.id === matchedId);
  if (motion?.shotId !== undefined) return [motion.shotId];
  const group = production.groups.find((item) => item.id === matchedId);
  if (group !== undefined) {
    return group.memberShotIds.length > 0 ? [group.id, ...group.memberShotIds] : [group.id];
  }
  return [matchedId];
}

function validateProductionProtocol(input: {
  readonly documents: Readonly<Record<string, string>>;
  readonly episodeDirectory: string;
  readonly shots: readonly DramaShot[];
  readonly assets: readonly DramaAsset[];
  readonly visualAssets: readonly DramaVisualAsset[];
  readonly motions: readonly DramaMotionPrompt[];
  readonly groups: readonly DramaMotionGroup[];
  readonly music: readonly DramaMusicPrompt[];
}): DramaProductionDiagnostic[] {
  const diagnostics: DramaProductionDiagnostic[] = [];
  const add = (value: Omit<DramaProductionDiagnostic, "line">): void => {
    diagnostics.push({ ...value, line: lineAt(input.documents[value.path] ?? "", value.offset) });
  };
  const all = [...input.shots, ...input.assets, ...input.visualAssets, ...input.motions, ...input.groups, ...input.music];
  const byId = new Map<string, typeof all>();
  for (const item of all) byId.set(item.id, [...(byId.get(item.id) ?? []), item]);
  for (const [id, items] of byId) {
    if (items.length < 2) continue;
    for (const item of items) add({ severity: "error", code: "duplicate_id", path: item.path, offset: item.offset, targetId: id, message: `${id} 在当前集内重复，后出现的条目会遮蔽前一条。` });
  }

  for (const visual of input.visualAssets) {
    if (visual.stableId || visual.declaredId === undefined) continue;
    add({
      severity: "warning",
      code: "invalid_visual_id",
      path: visual.path,
      offset: visual.offset,
      targetId: visual.id,
      message: `${visual.title} 的 “- ID：${visual.declaredId}” 格式无效，已回退为按标题生成的 ID；请写成 VISUAL- 加大写字母、数字或连字符。`
    });
  }

  const knownReferences = new Set([...input.assets, ...input.visualAssets, ...input.shots, ...input.motions, ...input.groups, ...input.music].map((item) => item.id));
  const screenplayPath = `${input.episodeDirectory}/剧本.md`;
  for (const shot of input.shots) {
    for (const reference of shot.references) {
      if (reference.startsWith("REF-")) continue;
      if (!knownReferences.has(reference)) add({ severity: "warning", code: "unknown_reference", path: shot.path, offset: shot.offset, targetId: shot.id, message: `${shot.id} 引用了未解析的 ${reference}。` });
    }
    for (const id of sourceKeys(shot)) {
      if (sectionTarget(screenplayPath, input.documents[screenplayPath] ?? "", id) === undefined) {
        add({ severity: "warning", code: "unknown_source", path: shot.path, offset: shot.offset, targetId: shot.id, message: `${shot.id} 的来源 ${id} 在剧本中不存在。` });
      }
    }
  }

  const shots = new Set(input.shots.map((shot) => shot.id));
  const motionsByShot = new Map<string, DramaMotionPrompt[]>();
  for (const motion of input.motions) {
    if (motion.shotId === undefined) {
      add({ severity: "warning", code: "motion_without_shot", path: motion.path, offset: motion.offset, targetId: motion.id, message: `${motion.id} 没有可解析的 SHOT-* 分镜字段。` });
      continue;
    }
    if (!shots.has(motion.shotId)) add({ severity: "error", code: "unknown_motion_shot", path: motion.path, offset: motion.offset, targetId: motion.id, message: `${motion.id} 指向不存在的 ${motion.shotId}。` });
    motionsByShot.set(motion.shotId, [...(motionsByShot.get(motion.shotId) ?? []), motion]);
  }
  for (const [shotId, motions] of motionsByShot) {
    if (motions.length < 2) continue;
    for (const motion of motions) add({ severity: "error", code: "multiple_motions", path: motion.path, offset: motion.offset, targetId: motion.id, message: `${shotId} 同时绑定了多个 MOTION，画布只能确定一个。` });
  }

  const parsedOffsets = new Set([...input.shots, ...input.assets, ...input.motions, ...input.groups, ...input.music].map((item) => `${item.path}:${String(item.offset)}`));
  for (const [path, prefixes] of [
    [`${input.episodeDirectory}/分镜.md`, ["SHOT"]],
    [`${input.episodeDirectory}/图片提示词.md`, ["IMG"]],
    [`${input.episodeDirectory}/视频提示词.md`, ["MOTION", "GROUP", "MUSIC"]]
  ] as const) {
    for (const section of levelTwoSections(input.documents[path] ?? "")) {
      const heading = section.heading.trim();
      const upper = heading.toLocaleUpperCase();
      for (const prefix of prefixes) {
        if (upper.startsWith(prefix) && !parsedOffsets.has(`${path}:${String(section.offset)}`)) {
          add({ severity: "error", code: "malformed_heading", path, offset: section.offset, message: `无法解析标题 “${heading}”，需要稳定的 ${prefix}-* ID。` });
          break;
        }
      }
    }
  }
  return diagnostics.sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN") || left.offset - right.offset || left.code.localeCompare(right.code));
}

export function productionCompleteness(shot: DramaShot): {
  readonly keyframe: boolean;
  readonly motion: boolean;
  readonly references: boolean;
  readonly complete: boolean;
} {
  const keyframe = Boolean(shot.keyframePrompt?.trim());
  const motion = Boolean(shot.motion?.prompt?.trim() ?? shot.group?.prompt?.trim());
  const references = shot.references.length > 0;
  return { keyframe, motion, references, complete: keyframe && motion };
}

function levelTwoSections(content: string): MarkdownSection[] {
  const matches = [...content.matchAll(/^##\s+(.+)\s*$/gmu)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    return { heading: match[1] ?? "", body: content.slice(start, end), offset: match.index ?? 0 };
  });
}

function bulletFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of body.matchAll(/^\s*[-*]\s+([^：:\n]+)[：:]\s*(.+?)\s*$/gmu)) {
    const rawKey = match[1]?.trim() ?? "";
    let rawValue = match[2]?.trim() ?? "";
    const wrappedColon = (rawKey.startsWith("**") && !rawKey.endsWith("**") && rawValue.startsWith("**"))
      || (rawKey.startsWith("__") && !rawKey.endsWith("__") && rawValue.startsWith("__"));
    if (wrappedColon) rawValue = rawValue.slice(2).trim();
    const key = rawKey.replace(/^(?:\*\*|__)+|(?:\*\*|__)+$/gu, "").trim();
    if (key !== "" && rawValue !== "") fields.set(key, rawValue);
  }
  return fields;
}

function firstField(fields: ReadonlyMap<string, string>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = fields.get(name);
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function quoteUnderHeading(body: string, heading: string): string | undefined {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`^###\\s+${escaped}\\s*$([\\s\\S]*?)(?=^###\\s+|(?![\\s\\S]))`, "imu").exec(body);
  if (match?.[1] === undefined) return undefined;
  const lines = match[1].split(/\r?\n/u)
    .filter((line) => /^\s*>/u.test(line))
    .map((line) => line.replace(/^\s*>\s?/u, "").trimEnd());
  const value = lines.join("\n").trim();
  return value === "" ? undefined : value;
}

function seconds(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /([0-9]+(?:\.[0-9]+)?)\s*(?:s|秒)/iu.exec(value);
  if (match?.[1] === undefined) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function splitReferences(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") return [];
  const ids: string[] = [];
  for (const segment of value.split(/[;；]/u)) {
    const known = segment.match(/(?:IMG|SHOT|MOTION|GROUP|MUSIC)-[A-Z0-9-]+/giu);
    if (known !== null && known.length > 0) {
      ids.push(...known.map((id) => id.toLocaleUpperCase()));
      continue;
    }
    const refs = segment.match(/REF-[A-Z0-9-]+/giu);
    if (refs !== null && refs.length > 0) {
      ids.push(...refs.map((id) => id.toLocaleUpperCase()));
    }
  }
  return [...new Set(ids)];
}

function inferAssetKind(value: string): DramaAssetKind {
  if (/(人物|角色|外貌|造型(?!状态)|character|portrait|sheet)/iu.test(value)) return "character";
  if (/(地点|场景|环境|空间布局|scene|location|corridor|room|plate)/iu.test(value)) return "scene";
  if (/(道具|物件|主体|prop|object)/iu.test(value)) return "prop";
  if (/(造型状态|状态|state|look)/iu.test(value)) return "state";
  return "unknown";
}

function slug(value: string): string {
  return value.trim().toLocaleUpperCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/gu, "") || "ITEM";
}

function lineAt(content: string, offset: number): number {
  return content.slice(0, Math.max(0, offset)).split(/\r?\n/u).length;
}

// Drama Skills 0.6.5 (#100): 来源 starts with a screenplay scene ID and may
// continue with a short quote or further IDs joined by 、. The ID shape is the
// one creator_markdown_check.py uses; the checker additionally requires the
// field to *start* with an ID, which the workbench leaves to it — here an ID
// anywhere in the field still navigates.
export function sourceSceneIds(source: string | undefined): string[] {
  if (source === undefined) return [];
  return [...new Set([...source.matchAll(/(?:[A-Za-z0-9]+-)+SC[0-9]+/gu)].map((match) => match[0]))];
}

/** Scene IDs to resolve; a 来源 naming no ID falls back to matching the whole field. */
function sourceKeys(shot: DramaShot): readonly string[] {
  if (shot.sceneIds.length > 0) return shot.sceneIds;
  return shot.source === undefined ? [] : [shot.source];
}

function sectionTarget(path: string, content: string, id: string): DramaDocumentTarget | undefined {
  const offset = content.search(new RegExp(`^##\\s+${id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:\\s|$)`, "imu"));
  return offset < 0 ? undefined : { path, offset, id };
}

function creatorDocumentOrder(path: string): number {
  const name = path.split("/").at(-1);
  return ["剧本.md", "视觉设定.md", "分镜.md", "图片提示词.md", "视频提示词.md"].indexOf(name ?? "");
}

export function targetDisplayName(
  production: DramaEpisodeProduction | undefined,
  id: string,
  documents?: Readonly<Record<string, string>>
): string {
  if (id === "BATCH-KEYFRAMES") return "批量关键帧";
  if (id === "BATCH-VIDEOS") return "批量镜头视频";
  if (production === undefined) return id;
  if (id === production.episodeDirectory) return "本集成片";
  const matched = production.shots.find((item) => item.id === id)?.title
    ?? production.assets.find((item) => item.id === id)?.title
    ?? production.visualAssets.find((item) => item.id === id)?.title
    ?? production.motions.find((item) => item.id === id)?.title
    ?? production.groups.find((item) => item.id === id)?.title
    ?? production.music.find((item) => item.id === id)?.title;
  if (matched !== undefined) return matched;
  const screenplay = documents?.[`${production.episodeDirectory}/剧本.md`];
  if (screenplay !== undefined) {
    const heading = new RegExp(`^##\\s+${id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:\\s*[·｜|]?\\s*(.*))?$`, "imu").exec(screenplay)?.[1]?.trim();
    if (heading) return heading;
  }
  return id;
}
