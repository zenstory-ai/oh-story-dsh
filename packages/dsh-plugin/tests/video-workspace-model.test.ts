import { describe, expect, it } from "vitest";
import { projectVideoNarrative } from "../src/video-narrative.js";
import {
  editVideoNarration,
  videoCanvasModel,
  videoCreativeDocuments,
  videoDocumentTitle,
  videoDraftText,
  videoPreviewLabel,
  videoProductionRecords,
  videoRange,
  videoSourceRange,
  videoSubtitleArtifact,
  type VideoProject
} from "../src/client/video-workspace-model.js";

const project: VideoProject = {
  id: "a",
  root: "video-recaps/a",
  title: "故事",
  state: "working",
  stage: "narration",
  stageLabel: "解说",
  previews: [],
  artifacts: []
};

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
    expect(videoDraftText(segment, "{unfinished")).toBe("原配音");
  });

  it("does not invent creative cards, originals or a playable final for a source-only project", () => {
    expect(videoCanvasModel(project, undefined)).toEqual({ nodes: [], edges: [] });
    const source = { role: "source" as const, label: "原片", path: "video-recaps/a/sources/a.mp4", version: "v1", bytes: 1, mimeType: "video/mp4" };
    const model = videoCanvasModel({ ...project, previews: [source] }, undefined);
    expect(model.nodes.map((node) => node.id)).toEqual(["source"]);
    expect(model.edges).toHaveLength(0);
  });

  it("includes EDIT_PLAN.md, STORYBOARD.md, SCRIPT.md and timeline.json v3 segments on the canvas", () => {
    const source = { role: "source" as const, label: "原片", path: "video-recaps/a/sources/a.mp4", version: "v1", bytes: 1, mimeType: "video/mp4" };
    const preview = { role: "edited" as const, editedKind: "preview" as const, label: "粗剪预览", path: "video-recaps/a/work/out/preview.mp4", version: "v1", bytes: 2, mimeType: "video/mp4" };
    const narrative = projectVideoNarrative({
      timeline: {
        schema_version: 3,
        sources: { s1: "sources/a.mp4" },
        video: [{ id: "v1", source: "s1", in: 10, out: 15, keep_windows: [[12, 14]] }],
        audio: { narration: [{ id: "n1", at: 0, duration: 2, text: "开场解说" }] }
      },
      resolveSourcePath: (raw) => `video-recaps/a/${raw}`
    });
    const v08Project: VideoProject = {
      ...project,
      timelinePath: "video-recaps/a/work/timeline.json",
      previews: [source, preview],
      narrative,
      artifacts: [
        { path: "video-recaps/a/work/EDIT_PLAN.md", version: "v1", label: "剪辑与旁白方案", kind: "script" },
        { path: "video-recaps/a/work/STORYBOARD.md", version: "v1", label: "分镜脚本", kind: "plan" },
        { path: "video-recaps/a/work/SCRIPT.md", version: "v1", label: "解说脚本", kind: "script" },
        { path: "video-recaps/a/work/REFERENCE_NOTES.md", version: "v1", label: "参考笔记", kind: "plan" },
        { path: "video-recaps/a/work/timeline.json", version: "v1", label: "成片时间线", kind: "plan" },
        { path: "video-recaps/a/work/check.json", version: "v1", label: "成片体检", kind: "quality" }
      ]
    };
    const model = videoCanvasModel(v08Project, narrative, [{ ...source, kind: "media" }]);
    const ids = model.nodes.map((node) => node.id);
    expect(ids).toContain("document:video-recaps/a/work/EDIT_PLAN.md");
    expect(ids).toContain("document:video-recaps/a/work/STORYBOARD.md");
    expect(ids).toContain("document:video-recaps/a/work/SCRIPT.md");
    expect(ids).toContain("document:video-recaps/a/work/REFERENCE_NOTES.md");
    expect(ids).toContain("segment:n1");
    expect(ids).toContain("segment:original-1");
    expect(model.nodes.find((node) => node.id === "segment:n1")?.path).toBe("video-recaps/a/work/timeline.json");
    expect(model.nodes.find((node) => node.id === "preview")?.eyebrow).toBe("粗剪预览");
    expect(model.edges).toHaveLength(2);
    expect(model.edges[0]?.label).toBe("原片 00:10–00:12");
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

  it("keeps production diagnostics out of creative documents and surfaces v0.8.0 records cleanly", () => {
    const mixed: VideoProject = {
      ...project,
      artifacts: [
        { path: "video-recaps/a/work/final_qc.json", version: "v1", label: "质检", kind: "quality" },
        { path: "video-recaps/a/work/narration.json", version: "v1", label: "解说词", kind: "script" },
        { path: "video-recaps/a/work/timeline.json", version: "v1", label: "成片时间线", kind: "plan" },
        { path: "video-recaps/a/work/check.json", version: "v1", label: "成片体检", kind: "quality" },
        { path: "video-recaps/a/work/REFERENCE_NOTES.md", version: "v1", label: "参考笔记", kind: "plan" },
        { path: "video-recaps/a/work/reference_metrics.json", version: "v1", label: "参考指标", kind: "quality" },
        { path: "video-recaps/a/work/out/episode.srt", version: "v1", label: "SRT 字幕（episode.srt）", kind: "subtitle" }
      ]
    };
    expect(videoCreativeDocuments(mixed).map((file) => file.kind)).toEqual(["script"]);
    const records = videoProductionRecords(mixed);
    expect(records.map((file) => file.path.split("/").at(-1))).toEqual([
      "timeline.json",
      "check.json",
      "REFERENCE_NOTES.md",
      "reference_metrics.json",
      "episode.srt",
      "final_qc.json"
    ]);
    expect(videoDocumentTitle(records[0]!)).toBe("成片时间线");
    expect(videoDocumentTitle(records[1]!)).toBe("成片体检");
    expect(videoDocumentTitle(records[2]!)).toBe("参考笔记");
    expect(videoDocumentTitle(records[3]!)).toBe("参考指标");
    expect(videoSubtitleArtifact(mixed)?.path).toBe("video-recaps/a/work/out/episode.srt");
    expect(videoRange({ start: 65, end: 127 })).toBe("01:05–02:07");
  });

  it("distinguishes v0.8.0 preview.mp4 from legacy edited_source.mp4", () => {
    expect(videoPreviewLabel({ role: "edited", editedKind: "preview", label: "粗剪预览", path: "video-recaps/a/work/out/preview.mp4" })).toBe("粗剪预览");
    expect(videoPreviewLabel({ role: "edited", editedKind: "edited", label: "剪后片", path: "video-recaps/a/work/edited_source.mp4" })).toBe("剪后片");
    expect(videoPreviewLabel({ role: "edited", label: "剪后画面", path: "video-recaps/a/work/edited_source.mp4" })).toBe("剪后画面");
    expect(videoPreviewLabel({ role: "final", label: "最终成片", path: "video-recaps/a/work/out/final.mp4" })).toBe("成片");
    expect(videoPreviewLabel({ role: "source", label: "原片", path: "video-recaps/a/sources/a.mp4" })).toBe("原片");
  });
});
