import { describe, expect, it } from "vitest";
import { projectVideoNarrative } from "../src/video-narrative.js";

describe("video narrative projection", () => {
  it("projects full-mode narration onto the identical source clock", () => {
    const projection = projectVideoNarrative({
      editMode: "full",
      narration: [{ start: 2, end: 7, narration: "这一段使用原片时间。" }]
    });
    expect(projection.segments).toEqual([expect.objectContaining({
      index: 0,
      kind: "narration",
      output: { start: 2, end: 7 },
      sourceRanges: [{ start: 2, end: 7 }],
      sourceMapping: "identity"
    })]);
    expect(projection.authoredClock).toBe("source");
  });

  it("maps one output segment across multiple validated clips without claiming continuity", () => {
    const projection = projectVideoNarrative({
      editMode: "cut",
      narration: [{ start: 4, end: 8, narration: "跨过一个剪辑点。" }],
      validatedClips: { clips: [
        { source_id: "episode-a", source_start: 100, source_end: 106, output_start: 0, output_end: 6 },
        { source_id: "episode-b", source_start: 20, source_end: 26, output_start: 6, output_end: 12 }
      ] }
    });
    expect(projection.segments[0]?.sourceRanges).toEqual([
      { start: 104, end: 106, sourceId: "episode-a", sourcePath: undefined },
      { start: 20, end: 22, sourceId: "episode-b", sourcePath: undefined }
    ]);
    expect(projection.segments[0]?.sourceMapping).toBe("validated-clips");
    expect(projection.authoredClock).toBe("output");
  });

  it("withholds source ranges when validated clips are ambiguous or do not cover the whole output segment", () => {
    const overlap = projectVideoNarrative({
      editMode: "cut",
      narration: [{ start: 1, end: 4, narration: "不能假定位。" }],
      validatedClips: { clips: [
        { source_start: 10, source_end: 13, output_start: 0, output_end: 3 },
        { source_start: 20, source_end: 23, output_start: 2, output_end: 5 }
      ] }
    });
    expect(overlap.segments[0]).toMatchObject({ sourceRanges: [], sourceMapping: "unavailable" });
    expect(overlap.warnings).toContain("invalid-clip-map");

    const gap = projectVideoNarrative({
      editMode: "cut",
      narration: [{ start: 1, end: 5, narration: "中间没有映射。" }],
      validatedClips: { clips: [
        { source_start: 10, source_end: 12, output_start: 0, output_end: 2 },
        { source_start: 20, source_end: 22, output_start: 4, output_end: 6 }
      ] }
    });
    expect(gap.segments[0]).toMatchObject({ sourceRanges: [], sourceMapping: "unavailable" });
  });

  it("only projects explicitly authored original-audio beats", () => {
    const projection = projectVideoNarrative({
      editMode: "cut",
      visualAudioBoard: { items: [
        { beat_id: "b1", source_id: "ep-3", source_start: 1292, source_end: 1305.24, output_start: 9.206, output_end: 22.446, audio_owner: "original_dialogue", original_audio_anchor: "完整保留这句对白", narration_job: "none" },
        { beat_id: "b2", output_start: 23, output_end: 25, audio_owner: "silence", narration_job: "none" },
        { beat_id: "b3", output_start: 25, output_end: 28, audio_owner: "narration" }
      ] }
    });
    expect(projection.segments).toEqual([expect.objectContaining({
      id: "original-1",
      kind: "original",
      text: "完整保留这句对白",
      sourceRanges: [{ start: 1292, end: 1305.24, sourceId: "ep-3", sourcePath: undefined }],
      sourceMapping: "explicit-board",
      audioOwner: "original_dialogue"
    })]);
    expect(projection.facts.originalCount).toBe(1);
  });

  it("uses explicit cut output time for original audio and does not fall back to source time", () => {
    const missingOutput = projectVideoNarrative({
      editMode: "cut",
      visualAudioBoard: { items: [{ source_start: 50, source_end: 55, audio_owner: "ambience" }] }
    });
    expect(missingOutput.segments).toEqual([]);
    expect(missingOutput.warnings).toContain("invalid-original-audio-beat");

    const full = projectVideoNarrative({
      editMode: "full",
      visualAudioBoard: { items: [{ source_start: 50, source_end: 55, audio_owner: "ambience" }] }
    });
    expect(full.segments[0]).toMatchObject({ output: { start: 50, end: 55 }, sourceMapping: "explicit-board" });
  });

  it("projects only explicit creative decisions and bounded valid narration", () => {
    const projection = projectVideoNarrative({
      editMode: "full",
      storyPlan: {
        director_intent: { viewer_promise: "看懂关系变化", dramatic_question: "她为什么回来？", pov: "跟随主角" },
        chosen_hypothesis: "h2",
        hypotheses: [{ id: "h1", spine: "未采用" }, { id: "h2", spine: "从误会走向确认" }]
      },
      narration: [
        { start: 0, end: 4, narration: "有效段落。" },
        { start: 4, end: 4, narration: "零长度" },
        { start: 5, end: 7, narration: "" }
      ]
    });
    expect(projection.creative).toMatchObject({
      viewerPromise: "看懂关系变化",
      dramaticQuestion: "她为什么回来？",
      pov: "跟随主角",
      spine: "从误会走向确认"
    });
    expect(projection.facts).toEqual({ narrationCount: 1, originalCount: 0, mappedNarrationCount: 1, outputExtent: { start: 0, end: 4 } });
    expect(projection.warnings).toEqual(["invalid-narration"]);
  });

  it("marks an unproven authored clock and source mapping unavailable", () => {
    const projection = projectVideoNarrative({
      narration: [{ start: 3, end: 6, narration: "时间存在，但时钟来源未知。" }]
    });
    expect(projection.authoredClock).toBe("unknown");
    expect(projection.segments[0]).toMatchObject({
      output: { start: 3, end: 6 },
      sourceRanges: [],
      sourceMapping: "unavailable"
    });
  });
});
