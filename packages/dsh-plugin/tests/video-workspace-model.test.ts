import { describe, expect, it } from "vitest";
import { projectVideoNarrative } from "../src/video-narrative.js";
import { editVideoNarration, videoDraftText, videoSourceRange, videoCanvasModel, videoCreativeDocuments, videoRange, type VideoProject } from "../src/client/video-workspace-model.js";
const project: VideoProject = { id: "a", root: "video-recaps/a", title: "故事", state: "working", stage: "narration", stageLabel: "解说", previews: [], artifacts: [] };
describe("video workspace facts and edits", () => {
  it("edits exactly the original narration item, preserving timing, unknown fields and original order", () => {
    const source = JSON.stringify([{ start: 1, end: 2, narration: "旧句", emotion: { tone: "quiet" }, pause_after_ms: 100 }, { start: 5, end: 8, narration: "第二句" }]);
    expect(JSON.parse(editVideoNarration(source, 0, "新的句子") ?? "null")).toEqual([{ start: 1, end: 2, narration: "新的句子", emotion: { tone: "quiet" }, pause_after_ms: 100 }, { start: 5, end: 8, narration: "第二句" }]);
    expect(editVideoNarration(source, 2, "越界")).toBeUndefined();
    expect(editVideoNarration('{"segments":[]}', 0, "不能转换未知协议")).toBeUndefined();
    expect(editVideoNarration('[{"text":"未知旧字段"}]', 0, "不能覆盖")).toBeUndefined();
  });
  it("shows revised wording without attaching an unrelated timing edit to the loaded video", () => {
    const segment = projectVideoNarrative({ editMode: "full", narration: [{ start: 1, end: 2, narration: "原配音" }] }).segments[0];
    expect(segment).toBeDefined();
    if (segment === undefined) return;
    expect(videoDraftText(segment, '[{"start":1,"end":2,"narration":"新文案"}]')).toBe("新文案");
    expect(videoDraftText(segment, '[{"start":4,"end":6,"narration":"另一个位置"}]')).toBe("原配音");
    expect(videoDraftText(segment, '{unfinished')).toBe("原配音");
  });
  it("does not invent creative cards, originals or a playable final for a source-only project", () => {
    expect(videoCanvasModel(project, undefined)).toEqual({ nodes: [], edges: [] });
    const source = { role: "source" as const, label: "原片", path: "video-recaps/a/sources/a.mp4", version: "v1", bytes: 1, mimeType: "video/mp4" };
    const model = videoCanvasModel({ ...project, previews: [source] }, undefined);
    expect(model.nodes.map((node) => node.id)).toEqual(["source"]);
    expect(model.edges).toHaveLength(0);
  });
  it("projects exact narration indexes and only validated source relationships", () => {
    const narrative = projectVideoNarrative({ editMode: "cut", narration: [{ start: 0, end: 2, narration: "一句话" }] });
    const model = videoCanvasModel({ ...project, narrationPath: "video-recaps/a/work/narration.json" }, narrative);
    expect(model.nodes[0]?.segment?.index).toBe(0);
    expect(model.nodes[0]?.excerpt).toBe("一句话");
    expect(model.edges).toHaveLength(0);
  });
  it("does not associate foreign or ambiguous source media with the current original", () => {
    const source = { role: "source" as const, label: "原片", path: "video-recaps/a/sources/a.mp4", version: "v1", bytes: 1, mimeType: "video/mp4" };
    const narrative = projectVideoNarrative({ editMode: "cut", narration: [{ start: 0, end: 2, narration: "一句话" }], validatedClips: { clips: [{ output_start: 0, output_end: 2, source_start: 3, source_end: 5 }] } });
    const current = { ...project, previews: [source], narrative };
    const segment = narrative.segments[0];
    if (segment === undefined) throw new Error("missing fixture segment");
    const file = { ...source, kind: "media" as const };
    expect(videoSourceRange(current, segment, [file])).toMatchObject({ start: 3, end: 5 });
    expect(videoSourceRange(current, segment, [file, { ...file, path: "video-recaps/a/sources/b.mp4" }])).toBeUndefined();
    const foreign = { ...segment, sourceRanges: [{ start: 3, end: 5, sourcePath: "sources/b.mp4" }] };
    expect(videoSourceRange(current, foreign, [file])).toBeUndefined();
    expect(videoCanvasModel(current, { ...narrative, segments: [foreign] }, [file]).edges).toHaveLength(0);
  });
  it("does not use a clip map without knowing the narration clock", () => {
    const projected = projectVideoNarrative({ narration: [{ start: 0, end: 2, narration: "时间基准待核对" }], validatedClips: { clips: [{ output_start: 0, output_end: 2, source_start: 10, source_end: 12 }] } });
    expect(projected.authoredClock).toBe("unknown");
    expect(projected.segments[0]?.sourceRanges).toEqual([]);
  });
  it("keeps production diagnostics out of creative documents and supports minute clocks", () => {
    expect(videoCreativeDocuments({ ...project, artifacts: [{ path: "video-recaps/a/work/final_qc.json", version: "v1", label: "质检", kind: "quality" }, { path: "video-recaps/a/work/narration.json", version: "v1", label: "解说词", kind: "script" }] }).map((file) => file.kind)).toEqual(["script"]);
    expect(videoRange({ start: 65, end: 127 })).toBe("01:05–02:07");
  });
});
