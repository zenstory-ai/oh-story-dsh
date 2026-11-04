export type VideoNarrativeKind = "narration" | "original";

export interface VideoTimeRange {
  readonly start: number;
  readonly end: number;
  readonly sourceId?: string | undefined;
  readonly sourcePath?: string | undefined;
}

export interface VideoNarrativeSegment {
  readonly id: string;
  /** Narration array position. Save code must clone that item and retain fields not projected here. */
  readonly index?: number | undefined;
  readonly kind: VideoNarrativeKind;
  readonly text?: string | undefined;
  readonly output: VideoTimeRange;
  readonly sourceRanges: readonly VideoTimeRange[];
  readonly sourceMapping: "identity" | "validated-clips" | "explicit-board" | "unavailable";
  readonly beatId?: string | undefined;
  readonly audioOwner?: "original_dialogue" | "action_sound" | "ambience" | "music" | undefined;
}

export interface VideoCreativeSummary {
  readonly viewerPromise?: string | undefined;
  readonly pov?: string | undefined;
  readonly dramaticQuestion?: string | undefined;
  readonly emotionalStart?: string | undefined;
  readonly emotionalEnd?: string | undefined;
  readonly endingAftertaste?: string | undefined;
  readonly spine?: string | undefined;
}

export interface VideoNarrativeProjection {
  /** Clock used by the authored narration file; every segment.output is still the playback clock. */
  readonly authoredClock: "source" | "output" | "unknown";
  readonly segments: readonly VideoNarrativeSegment[];
  readonly creative: VideoCreativeSummary;
  readonly facts: {
    readonly narrationCount: number;
    readonly originalCount: number;
    readonly mappedNarrationCount: number;
    readonly outputExtent?: VideoTimeRange | undefined;
  };
  readonly warnings: readonly ("invalid-narration" | "invalid-clip-map" | "invalid-original-audio-beat")[];
}

export interface VideoNarrativeInput {
  readonly narration?: unknown;
  readonly validatedClips?: unknown;
  readonly visualAudioBoard?: unknown;
  readonly storyPlan?: unknown;
  /** `full` is the upstream identity-picture mode; `preserve` is accepted for compatible manifests. */
  readonly editMode?: unknown;
}

interface ClipRange extends VideoTimeRange {
  readonly outputStart: number;
  readonly outputEnd: number;
}

const MAX_SEGMENTS = 200;
const MAX_SOURCE_RANGES = 32;
const MAX_SECONDS = 24 * 60 * 60;
const MAX_TEXT = 20_000;
const EPSILON = 0.001;
const ORIGINAL_AUDIO_OWNERS = new Set(["original_dialogue", "action_sound", "ambience", "music"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function list(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function finiteTime(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_SECONDS ? value : undefined;
}

function shortText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const valueTrimmed = value.trim();
  return valueTrimmed === "" ? undefined : valueTrimmed.slice(0, MAX_TEXT);
}

function optionalId(value: unknown): string | undefined {
  return shortText(value)?.slice(0, 256);
}

function range(startValue: unknown, endValue: unknown): VideoTimeRange | undefined {
  const start = finiteTime(startValue);
  const end = finiteTime(endValue);
  return start !== undefined && end !== undefined && end - start > EPSILON ? { start, end } : undefined;
}

function outputRange(value: Record<string, unknown>, allowSourceFallback: boolean): VideoTimeRange | undefined {
  return range(value.output_start, value.output_end)
    ?? (allowSourceFallback ? range(value.source_start, value.source_end) : undefined);
}

function validatedClipMap(value: unknown): readonly ClipRange[] | undefined {
  const clips = list(record(value)?.clips);
  if (clips === undefined || clips.length === 0 || clips.length > MAX_SEGMENTS) return undefined;
  const normalized: ClipRange[] = [];
  for (const candidate of clips) {
    const item = record(candidate);
    const source = item === undefined ? undefined : range(item.source_start, item.source_end);
    const output = item === undefined ? undefined : range(item.output_start, item.output_end);
    if (item === undefined || source === undefined || output === undefined) return undefined;
    normalized.push({
      start: source.start,
      end: source.end,
      outputStart: output.start,
      outputEnd: output.end,
      sourceId: optionalId(item.source_id),
      sourcePath: shortText(item.source_path)
    });
  }
  normalized.sort((left, right) => left.outputStart - right.outputStart || left.outputEnd - right.outputEnd);
  if (normalized.some((clip, index) => index > 0 && clip.outputStart < normalized[index - 1]!.outputEnd - EPSILON)) return undefined;
  return normalized;
}

function mappedSourceRanges(output: VideoTimeRange, clips: readonly ClipRange[]): readonly VideoTimeRange[] | undefined {
  const overlapping = clips.filter((clip) => clip.outputEnd > output.start + EPSILON && clip.outputStart < output.end - EPSILON);
  if (overlapping.length === 0 || overlapping.length > MAX_SOURCE_RANGES) return undefined;
  const mapped: VideoTimeRange[] = [];
  let coveredUntil = output.start;
  for (const clip of overlapping) {
    const overlapStart = Math.max(output.start, clip.outputStart);
    const overlapEnd = Math.min(output.end, clip.outputEnd);
    if (overlapStart > coveredUntil + EPSILON) return undefined;
    const outputDuration = clip.outputEnd - clip.outputStart;
    const sourceDuration = clip.end - clip.start;
    const scale = sourceDuration / outputDuration;
    mapped.push({
      start: clip.start + ((overlapStart - clip.outputStart) * scale),
      end: clip.start + ((overlapEnd - clip.outputStart) * scale),
      sourceId: clip.sourceId,
      sourcePath: clip.sourcePath
    });
    coveredUntil = Math.max(coveredUntil, overlapEnd);
  }
  return coveredUntil >= output.end - EPSILON ? mapped : undefined;
}

function identityMode(value: unknown): boolean {
  return value === "full" || value === "preserve";
}

function narrationSegments(
  value: unknown,
  clips: readonly ClipRange[] | undefined,
  identity: boolean
): { readonly segments: VideoNarrativeSegment[]; readonly invalid: boolean } {
  const raw = list(value);
  if (raw === undefined) return { segments: [], invalid: value !== undefined };
  const segments: VideoNarrativeSegment[] = [];
  let invalid = raw.length > MAX_SEGMENTS;
  for (const [index, candidate] of raw.slice(0, MAX_SEGMENTS).entries()) {
    const item = record(candidate);
    const output = item === undefined ? undefined : range(item.start, item.end);
    const text = item === undefined ? undefined : shortText(item.narration);
    if (output === undefined || text === undefined) { invalid = true; continue; }
    const mapped = identity ? [output] : clips === undefined ? undefined : mappedSourceRanges(output, clips);
    segments.push({
      id: `narration-${String(index + 1)}`,
      index,
      kind: "narration",
      text,
      output,
      sourceRanges: mapped ?? [],
      sourceMapping: identity ? "identity" : mapped === undefined ? "unavailable" : "validated-clips"
    });
  }
  return { segments, invalid };
}

function originalSegments(
  value: unknown,
  clips: readonly ClipRange[] | undefined,
  identity: boolean
): { readonly segments: VideoNarrativeSegment[]; readonly invalid: boolean } {
  const items = list(record(value)?.items);
  if (items === undefined) return { segments: [], invalid: value !== undefined };
  const segments: VideoNarrativeSegment[] = [];
  let invalid = items.length > MAX_SEGMENTS;
  for (const [index, candidate] of items.slice(0, MAX_SEGMENTS).entries()) {
    const item = record(candidate);
    if (item === undefined) { invalid = true; continue; }
    const owner = shortText(item.audio_owner);
    if (owner === undefined || !ORIGINAL_AUDIO_OWNERS.has(owner)) continue;
    const output = outputRange(item, identity);
    if (output === undefined) { invalid = true; continue; }
    const explicitSource = range(item.source_start, item.source_end);
    const mapped = explicitSource === undefined
      ? identity ? [output] : clips === undefined ? undefined : mappedSourceRanges(output, clips)
      : [{ ...explicitSource, sourceId: optionalId(item.source_id), sourcePath: shortText(item.source_path) }];
    segments.push({
      id: `original-${String(index + 1)}`,
      kind: "original",
      text: shortText(item.original_audio_anchor),
      output,
      sourceRanges: mapped ?? [],
      sourceMapping: explicitSource !== undefined ? "explicit-board" : identity ? "identity" : mapped === undefined ? "unavailable" : "validated-clips",
      beatId: optionalId(item.beat_id),
      audioOwner: owner as VideoNarrativeSegment["audioOwner"]
    });
  }
  return { segments, invalid };
}

function creativeSummary(value: unknown): VideoCreativeSummary {
  const plan = record(value);
  const intent = record(plan?.director_intent);
  const chosen = optionalId(plan?.chosen_hypothesis);
  const hypotheses = list(plan?.hypotheses) ?? [];
  const hypothesis = hypotheses.map(record).find((item) => optionalId(item?.id) === chosen);
  return {
    viewerPromise: shortText(intent?.viewer_promise),
    pov: shortText(intent?.pov),
    dramaticQuestion: shortText(intent?.dramatic_question),
    emotionalStart: shortText(intent?.emotional_start),
    emotionalEnd: shortText(intent?.emotional_end),
    endingAftertaste: shortText(intent?.ending_aftertaste),
    spine: shortText(hypothesis?.spine)
  };
}

export function projectVideoNarrative(input: VideoNarrativeInput): VideoNarrativeProjection {
  const validatedClips = validatedClipMap(input.validatedClips);
  const clips = input.editMode === "cut" ? validatedClips : undefined;
  const identity = identityMode(input.editMode);
  const narration = narrationSegments(input.narration, clips, identity);
  const original = originalSegments(input.visualAudioBoard, clips, identity);
  const segments = [...narration.segments, ...original.segments]
    .sort((left, right) => left.output.start - right.output.start || left.output.end - right.output.end || left.kind.localeCompare(right.kind));
  const warnings: VideoNarrativeProjection["warnings"][number][] = [];
  if (narration.invalid) warnings.push("invalid-narration");
  if (input.validatedClips !== undefined && validatedClips === undefined) warnings.push("invalid-clip-map");
  if (original.invalid) warnings.push("invalid-original-audio-beat");
  const outputExtent = segments.length === 0 ? undefined : {
    start: Math.min(...segments.map((segment) => segment.output.start)),
    end: Math.max(...segments.map((segment) => segment.output.end))
  };
  return {
    authoredClock: identity ? "source" : input.editMode === "cut" ? "output" : "unknown",
    segments,
    creative: creativeSummary(input.storyPlan),
    facts: {
      narrationCount: narration.segments.length,
      originalCount: original.segments.length,
      mappedNarrationCount: narration.segments.filter((segment) => segment.sourceRanges.length > 0).length,
      outputExtent
    },
    warnings
  };
}
