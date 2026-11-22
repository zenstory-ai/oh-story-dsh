export type VideoNarrativeKind = "narration" | "original";

export interface VideoTimeRange {
  readonly start: number;
  readonly end: number;
  readonly sourceId?: string | undefined;
  readonly sourcePath?: string | undefined;
}

export interface VideoTimelineClip {
  readonly id: string;
  readonly sourceId?: string | undefined;
  readonly sourcePath?: string | undefined;
  readonly source: VideoTimeRange;
  readonly output: VideoTimeRange;
}

export interface VideoNarrativeSegment {
  readonly id: string;
  /** Narration array position. Save code must clone that item and retain fields not projected here. */
  readonly index?: number | undefined;
  readonly kind: VideoNarrativeKind;
  readonly text?: string | undefined;
  readonly output: VideoTimeRange;
  readonly sourceRanges: readonly VideoTimeRange[];
  readonly sourceMapping: "identity" | "validated-clips" | "explicit-board" | "timeline-v3" | "unavailable";
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
  /** Ordered output→source clip spans when projected from `timeline.json` v3. */
  readonly clips?: readonly VideoTimelineClip[] | undefined;
  readonly creative: VideoCreativeSummary;
  readonly facts: {
    readonly narrationCount: number;
    readonly originalCount: number;
    readonly mappedNarrationCount: number;
    readonly outputExtent?: VideoTimeRange | undefined;
  };
  readonly warnings: readonly ("invalid-narration" | "invalid-clip-map" | "invalid-original-audio-beat" | "invalid-timeline")[];
}

export interface VideoNarrativeInput {
  /** Video Recap 0.8.0 canonical `timeline.json` v3 document. Takes precedence when valid v3. */
  readonly timeline?: unknown;
  /** Optional resolver normalizing `timeline.sources` entries into workspace-relative paths. */
  readonly resolveSourcePath?: ((raw: string) => string | undefined) | undefined;
  readonly narration?: unknown;
  readonly validatedClips?: unknown;
  readonly visualAudioBoard?: unknown;
  readonly storyPlan?: unknown;
  /** `full` is the upstream identity-picture mode; `preserve` is accepted for compatible manifests. */
  readonly editMode?: unknown;
}

interface ClipRange extends VideoTimeRange {
  readonly id?: string | undefined;
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

function roundTime(value: number): number {
  return Math.round(value * 10_000) / 10_000;
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
      start: roundTime(clip.start + ((overlapStart - clip.outputStart) * scale)),
      end: roundTime(clip.start + ((overlapEnd - clip.outputStart) * scale)),
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

function isTimelineV3(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  if (value === undefined) return false;
  if (value.schema_version === 3) return true;
  const video = list(value.video);
  if (video === undefined || video.length === 0) return false;
  const first = record(video[0]);
  return first !== undefined && typeof first.in === "number" && typeof first.out === "number";
}

function projectTimelineV3(
  timeline: Record<string, unknown>,
  resolveSourcePath: ((raw: string) => string | undefined) | undefined,
  storyPlan: unknown
): VideoNarrativeProjection {
  const sources = record(timeline.sources);
  const rawVideo = list(timeline.video);
  const clips: ClipRange[] = [];
  const timelineClips: VideoTimelineClip[] = [];
  const originals: VideoNarrativeSegment[] = [];
  let timelineInvalid = rawVideo === undefined || rawVideo.length > MAX_SEGMENTS;
  let cursor = 0;

  if (rawVideo !== undefined) {
    for (const [index, candidate] of rawVideo.slice(0, MAX_SEGMENTS).entries()) {
      const item = record(candidate);
      const sourceSpan = item === undefined ? undefined : range(item.in, item.out);
      if (item === undefined || sourceSpan === undefined) {
        timelineInvalid = true;
        continue;
      }
      const clipId = optionalId(item.id) ?? `v${String(index + 1)}`;
      const sourceId = optionalId(item.source);
      const mappedRawPath = sourceId !== undefined ? shortText(sources?.[sourceId]) ?? sourceId : undefined;
      const sourcePath = mappedRawPath !== undefined ? (resolveSourcePath?.(mappedRawPath) ?? mappedRawPath) : undefined;
      const duration = sourceSpan.end - sourceSpan.start;
      const outputStart = roundTime(cursor);
      const outputEnd = roundTime(cursor + duration);
      cursor += duration;

      clips.push({
        id: clipId,
        start: sourceSpan.start,
        end: sourceSpan.end,
        outputStart,
        outputEnd,
        sourceId,
        sourcePath
      });
      timelineClips.push({
        id: clipId,
        sourceId,
        sourcePath,
        source: { start: sourceSpan.start, end: sourceSpan.end, sourceId, sourcePath },
        output: { start: outputStart, end: outputEnd }
      });

      const keepWindows = list(item.keep_windows);
      if (keepWindows !== undefined) {
        for (const windowCandidate of keepWindows) {
          const pair = list(windowCandidate);
          const rawStart = pair === undefined ? undefined : finiteTime(pair[0]);
          const rawEnd = pair === undefined ? undefined : finiteTime(pair[1]);
          if (rawStart === undefined || rawEnd === undefined || rawEnd - rawStart <= EPSILON) {
            timelineInvalid = true;
            continue;
          }
          const clampedStart = Math.max(sourceSpan.start, rawStart);
          const clampedEnd = Math.min(sourceSpan.end, rawEnd);
          if (clampedEnd - clampedStart <= EPSILON) continue;
          const outStart = roundTime(outputStart + (clampedStart - sourceSpan.start));
          const outEnd = roundTime(outputStart + (clampedEnd - sourceSpan.start));
          originals.push({
            id: `original-${String(originals.length + 1)}`,
            kind: "original",
            text: shortText(item.original_audio_anchor) ?? shortText(item.note),
            output: { start: outStart, end: outEnd },
            sourceRanges: [{ start: roundTime(clampedStart), end: roundTime(clampedEnd), sourceId, sourcePath }],
            sourceMapping: "timeline-v3",
            beatId: clipId,
            audioOwner: "original_dialogue"
          });
        }
      }
    }
  }

  const rawSubtitles = list(timeline.subtitles) ?? [];
  const parsedSubtitles: { readonly start: number; readonly end: number; readonly text: string; readonly style?: string | undefined }[] = [];
  for (const candidate of rawSubtitles.slice(0, MAX_SEGMENTS)) {
    const item = record(candidate);
    const span = item === undefined ? undefined : range(item.start, item.end);
    const subtitleText = item === undefined ? undefined : shortText(item.text);
    if (span !== undefined && subtitleText !== undefined) {
      parsedSubtitles.push({ start: span.start, end: span.end, text: subtitleText, style: shortText(item?.style) });
    }
  }

  const audio = record(timeline.audio);
  const rawNarration = list(audio?.narration);
  const narrations: VideoNarrativeSegment[] = [];
  let narrationInvalid = rawNarration !== undefined && rawNarration.length > MAX_SEGMENTS;

  if (rawNarration !== undefined && rawNarration.length > 0) {
    for (const [index, candidate] of rawNarration.slice(0, MAX_SEGMENTS).entries()) {
      const item = record(candidate);
      const at = item === undefined ? undefined : finiteTime(item.at);
      const duration = item === undefined ? undefined : finiteTime(item.duration);
      const endExplicit = item === undefined ? undefined : finiteTime(item.end);
      const text = item === undefined ? undefined : shortText(item.text) ?? shortText(item.spoken_text);
      let end: number | undefined;
      if (at !== undefined && duration !== undefined && duration > EPSILON) {
        end = roundTime(at + duration);
      } else if (at !== undefined && endExplicit !== undefined && endExplicit - at > EPSILON) {
        end = endExplicit;
      } else if (at !== undefined) {
        const matched = parsedSubtitles.find((sub) => Math.abs(sub.start - at) <= 0.05)
          ?? (text === undefined ? undefined : parsedSubtitles.find((sub) => sub.text === text && sub.start >= at - 0.1));
        if (matched !== undefined && matched.end - at > EPSILON) end = matched.end;
      }
      if (at === undefined || end === undefined || end - at <= EPSILON || text === undefined) {
        narrationInvalid = true;
        continue;
      }
      const output = { start: at, end };
      const mapped = clips.length > 0 ? mappedSourceRanges(output, clips) : undefined;
      narrations.push({
        id: optionalId(item?.id) ?? `narration-${String(index + 1)}`,
        index,
        kind: "narration",
        text,
        output,
        sourceRanges: mapped ?? [],
        sourceMapping: mapped === undefined ? "unavailable" : "timeline-v3"
      });
    }
  } else if (parsedSubtitles.length > 0) {
    const narrationSubs = parsedSubtitles.filter((sub) => sub.style === undefined || sub.style === "narration");
    for (const [index, sub] of narrationSubs.entries()) {
      const output = { start: sub.start, end: sub.end };
      const mapped = clips.length > 0 ? mappedSourceRanges(output, clips) : undefined;
      narrations.push({
        id: `subtitle-${String(index + 1)}`,
        kind: "narration",
        text: sub.text,
        output,
        sourceRanges: mapped ?? [],
        sourceMapping: mapped === undefined ? "unavailable" : "timeline-v3"
      });
    }
  }

  const segments = [...narrations, ...originals]
    .sort((left, right) => left.output.start - right.output.start || left.output.end - right.output.end || left.kind.localeCompare(right.kind));
  const warnings: VideoNarrativeProjection["warnings"][number][] = [];
  if (timelineInvalid) warnings.push("invalid-timeline");
  if (narrationInvalid) warnings.push("invalid-narration");
  const extentStarts = [
    ...segments.map((segment) => segment.output.start),
    ...timelineClips.map((clip) => clip.output.start)
  ];
  const extentEnds = [
    ...segments.map((segment) => segment.output.end),
    ...timelineClips.map((clip) => clip.output.end)
  ];
  const outputExtent = extentStarts.length === 0 ? undefined : {
    start: Math.min(...extentStarts),
    end: Math.max(...extentEnds)
  };
  return {
    authoredClock: "output",
    segments,
    clips: timelineClips,
    creative: creativeSummary(storyPlan),
    facts: {
      narrationCount: narrations.length,
      originalCount: originals.length,
      mappedNarrationCount: narrations.filter((segment) => segment.sourceRanges.length > 0).length,
      outputExtent
    },
    warnings
  };
}

export function projectVideoNarrative(input: VideoNarrativeInput): VideoNarrativeProjection {
  const timelineRecord = record(input.timeline);
  if (isTimelineV3(timelineRecord)) {
    return projectTimelineV3(timelineRecord, input.resolveSourcePath, input.storyPlan);
  }
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
