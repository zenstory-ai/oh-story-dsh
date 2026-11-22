import { describe, expect, it } from "vitest";
import { skipVideoDirectory, summarizeVideoProject, videoProjectRoot, visibleVideoPath, type VideoWorkspaceFile } from "../src/video-project.js";

function file(path: string, kind: "text" | "media" = "text", mimeType?: string): VideoWorkspaceFile {
  return { path, kind, mimeType, bytes: 42, version: `v:${path}` };
}

describe("video recap project projection", () => {
  it("keeps the Studio manifest-driven and hides high-volume working files", () => {
    expect(visibleVideoPath("video-recaps/demo/work/recap_run_manifest.json")).toBe(true);
    expect(visibleVideoPath("video-recaps/demo/work/frames/frame-00001.jpg")).toBe(false);
    expect(visibleVideoPath("video-recaps/demo/work/tts_segments/segment-001.wav")).toBe(false);
    expect(visibleVideoPath("video-recaps/demo/sources/input.mp4")).toBe(true);
    expect(skipVideoDirectory("video-recaps/demo/work/frames")).toBe(true);
  });

  it("summarizes authoritative artifacts without creating a second lifecycle truth", () => {
    const root = "video-recaps/demo";
    const files = [
      file(`${root}/project.json`),
      file(`${root}/sources/source.mp4`, "media", "video/mp4"),
      file(`${root}/work/recap_run_manifest.json`),
      file(`${root}/work/clip_plan.json`),
      file(`${root}/work/edited_source.mp4`, "media", "video/mp4"),
      file(`${root}/work/assembly_manifest.json`),
      file(`${root}/outputs/recap_demo.mp4`, "media", "video/mp4")
    ];
    const summary = summarizeVideoProject(root, files, {
      project: { title: "Demo Recap" },
      runManifest: { source_video: `${root}/sources/source.mp4`, settings: { edit_mode: "cut" } },
      assembly: { final_output: "/workspace/video-recaps/demo/outputs/recap_demo.mp4" }
    });
    expect(summary.title).toBe("Demo Recap");
    expect(summary.state).toBe("ready");
    expect(summary.stageLabel).toBe("成片已就绪");
    expect(summary.previews.map((item) => item.role)).toEqual(["source", "edited", "final"]);
  });

  it("surfaces optional reference and 0.7.1 packaging/promo artifacts without inventing a production stage", () => {
    const root = "video-recaps/reference";
    const names = ["production_reference.json", "reference_measurements.json", "reference_breakdown.json", "promo_copy.json", "sfx_plan.json", "original_subtitles.json", "narration_lint.json"];
    const files = names.map((name) => file(`${root}/work/${name}`));
    for (const entry of files) expect(visibleVideoPath(entry.path)).toBe(true);
    const summary = summarizeVideoProject(root, files);
    expect(summary).toMatchObject({ state: "not-started", stage: "source", nextArtifact: undefined });
    expect(summary.artifacts.map((artifact) => artifact.label).sort()).toEqual(["制作参考", "参考拆解", "参考测量", "原声字幕", "宣发文案", "解说词校验", "音效方案"].sort());
    expect(visibleVideoPath(`${root}/work/golden_eval.json`)).toBe(false);
    expect(visibleVideoPath(`${root}/work/mimo_qc.json`)).toBe(false);
  });

  it("reports the two upstream cut-mode pauses", () => {
    const root = "video-recaps/cut";
    const base = [file(`${root}/sources/source.mp4`, "media", "video/mp4"), file(`${root}/work/recap_run_manifest.json`)];
    const passOne = summarizeVideoProject(root, base, { runManifest: { settings: { edit_mode: "cut" } } });
    expect(passOne).toMatchObject({ state: "waiting", nextArtifact: "clip_plan.json" });
    const passTwo = summarizeVideoProject(root, [...base, file(`${root}/work/clip_plan.json`), file(`${root}/work/edited_source.mp4`, "media", "video/mp4")], { runManifest: { settings: { edit_mode: "cut" } } });
    expect(passTwo).toMatchObject({ state: "waiting", nextArtifact: "narration.json" });
  });

  it("skips the narration pause for runs that keep the source audio", () => {
    const root = "video-recaps/mix";
    const base = [file(`${root}/sources/source.mp4`, "media", "video/mp4"), file(`${root}/work/recap_run_manifest.json`)];
    const cut = { settings: { edit_mode: "cut" }, audio: { mode: "source-mix" } };
    expect(summarizeVideoProject(root, base, { runManifest: cut })).toMatchObject({ state: "waiting", nextArtifact: "clip_plan.json" });
    const edited = [...base, file(`${root}/work/clip_plan.json`), file(`${root}/work/edited_source.mp4`, "media", "video/mp4")];
    expect(summarizeVideoProject(root, edited, { runManifest: cut })).toMatchObject({ state: "working", stage: "assemble", nextArtifact: undefined });
    const full = { settings: { edit_mode: "full" }, audio: { mode: "source-mix" } };
    expect(summarizeVideoProject(root, base, { runManifest: full })).toMatchObject({ state: "working", stage: "assemble", nextArtifact: undefined });
  });

  it("validates one-level project roots", () => {
    expect(videoProjectRoot("video-recaps/我的项目/work/timeline.json")).toBe("video-recaps/我的项目");
    expect(videoProjectRoot("video-recaps/.hidden/work/timeline.json")).toBeUndefined();
    expect(videoProjectRoot("正文/demo.md")).toBeUndefined();
  });

  it("binds a narrative projection to the unique narration file without dropping lifecycle facts", () => {
    const root = "video-recaps/narrative";
    const summary = summarizeVideoProject(root, [
      file(`${root}/sources/source.mp4`, "media", "video/mp4"),
      file(`${root}/work/recap_run_manifest.json`),
      file(`${root}/work/narration.json`)
    ], {
      runManifest: { settings: { edit_mode: "full" } },
      narration: [{ start: 1, end: 3, narration: "只投影创作事实。", emotion: "平静" }]
    });
    expect(summary).toMatchObject({
      narrationPath: `${root}/work/narration.json`,
      narrationVersion: `v:${root}/work/narration.json`,
      narrative: {
        authoredClock: "source",
        facts: { narrationCount: 1, mappedNarrationCount: 1 },
        segments: [{ index: 0, text: "只投影创作事实。", sourceMapping: "identity" }]
      }
    });
    expect(summary.state).toBe("working");
    expect(summary.stage).toBe("voiceover");
  });

  it("supports video-recap 0.8.0 Markdown workspace, timeline v3, check.json, and out/ previews", () => {
    const root = "video-recaps/v08";
    const files = [
      file(`${root}/sources/source.mp4`, "media", "video/mp4"),
      file(`${root}/work/BRIEF.md`),
      file(`${root}/work/MEDIA_NOTES.md`),
      file(`${root}/work/EDIT_PLAN.md`),
      file(`${root}/work/PROMO.md`),
      file(`${root}/work/timeline.json`),
      file(`${root}/work/check.json`),
      file(`${root}/work/out/preview.mp4`, "media", "video/mp4"),
      file(`${root}/work/out/final.mp4`, "media", "video/mp4")
    ];
    for (const entry of files) expect(visibleVideoPath(entry.path), entry.path).toBe(true);
    const summary = summarizeVideoProject(root, files);
    expect(summary.state).toBe("ready");
    expect(summary.stageLabel).toBe("成片已就绪");
    expect(summary.editedKind).toBe("preview");
    expect(summary.previews.map((item) => [item.role, item.label, item.editedKind])).toEqual([
      ["source", "原片", undefined],
      ["edited", "粗剪预览", "preview"],
      ["final", "最终成片", undefined]
    ]);
    expect(summary.artifacts.map((artifact) => artifact.label)).toEqual(expect.arrayContaining([
      "需求与画幅", "素材笔记", "剪辑与旁白方案", "宣发文案", "成片时间线", "成片体检"
    ]));
  });

  it("parses check.json v1 review hints with timeline timestamps, falls back title to timeline.meta.title, and surfaces v0.8.0 reference/srt/out files", () => {
    const root = "video-recaps/v08-rich";
    const files = [
      file(`${root}/sources/ep1.mp4`, "media", "video/mp4"),
      file(`${root}/work/REFERENCE_NOTES.md`),
      file(`${root}/work/reference_metrics.json`),
      file(`${root}/work/timeline.json`),
      file(`${root}/work/check.json`),
      file(`${root}/work/out/custom_cut.srt`),
      file(`${root}/work/out/custom_cut.mp4`, "media", "video/mp4")
    ];
    for (const entry of files) expect(visibleVideoPath(entry.path), entry.path).toBe(true);
    const summary = summarizeVideoProject(root, files, {
      storyboard: "没有一级标题的分镜说明\n",
      timeline: {
        schema_version: 3,
        meta: { title: "第一集精剪复盘" },
        sources: { s1: "../sources/ep1.mp4" },
        video: [{ id: "v1", source: "s1", in: 5, out: 15 }],
        audio: { narration: [{ id: "n1", at: 1, duration: 3, text: "开篇解说" }] }
      },
      qualityCheck: {
        schema_version: 1,
        media: `${root}/work/out/custom_cut.mp4`,
        ok: true,
        checks: {
          container_valid: { status: "pass", detail: "mp4" },
          visual_health: { status: "warn", detail: "black_spans=1, freeze_spans=0" },
          audio_health: { status: "warn", detail: "-14.0 LUFS" }
        },
        review_hints: [
          { check: "visual_health", code: "black_span", start: 2.5, end: 3.2, duration: 0.7 },
          { check: "audio_health", code: "edge_speech_truncation", clip_id: "v1", edge: "out", rms_dbfs: -18.5 }
        ]
      }
    });
    expect(summary.title).toBe("第一集精剪复盘");
    expect(summary.state).toBe("ready");
    expect(summary.previews.find((item) => item.role === "final")?.path).toBe(`${root}/work/out/custom_cut.mp4`);
    expect(summary.timelinePath).toBe(`${root}/work/timeline.json`);
    expect(summary.narrative?.authoredClock).toBe("output");
    expect(summary.artifacts.map((item) => item.path)).toEqual(expect.arrayContaining([
      `${root}/work/REFERENCE_NOTES.md`,
      `${root}/work/reference_metrics.json`,
      `${root}/work/out/custom_cut.srt`
    ]));
    expect(summary.qualityCheck).toMatchObject({
      ok: true,
      status: "warn",
      media: `${root}/work/out/custom_cut.mp4`,
      mediaRole: "final",
      path: `${root}/work/check.json`
    });
    expect(summary.qualityCheck?.reviewHints).toEqual([
      expect.objectContaining({ code: "black_span", label: "黑屏片段", severity: "warn", timestamp: 2.5, endTimestamp: 3.2 }),
      expect.objectContaining({ code: "edge_speech_truncation", label: "切点人声截断", severity: "warn", timestamp: 10 })
    ]);
  });

  it("excludes timeline.overlays alpha assets from source/final previews, maps check.json.media to edited role, and falls back title to BRIEF.md / EDIT_PLAN.md", () => {
    const root = "video-recaps/overlay-case";
    const files = [
      file(`${root}/sources/bgm.wav`, "media", "audio/wav"),
      file(`${root}/sources/ep1.mp4`, "media", "video/mp4"),
      file(`${root}/work/out/title_card.mov`, "media", "video/quicktime"),
      file(`${root}/work/out/preview.mp4`, "media", "video/mp4"),
      file(`${root}/work/timeline.json`),
      file(`${root}/work/check.json`),
      file(`${root}/work/BRIEF.md`)
    ];
    const summary = summarizeVideoProject(root, files, {
      brief: "# 雨夜追凶解说需求\n\n竖屏 9:16",
      timeline: {
        schema_version: 3,
        sources: {
          ov1: "out/title_card.mov",
          bgm: "../sources/bgm.wav",
          main: "../sources/ep1.mp4"
        },
        video: [{ id: "v1", source: "main", in: 0, out: 12 }],
        overlays: [{ id: "o1", source: "ov1", at: 0, duration: 2 }]
      },
      qualityCheck: {
        schema_version: 1,
        media: "work/out/preview.mp4",
        ok: true,
        checks: { container_valid: { status: "pass", detail: "mp4" } },
        review_hints: []
      }
    });
    expect(summary.title).toBe("雨夜追凶解说需求");
    // Must pick timeline.video[0].source (`ep1.mp4`), NOT overlay `title_card.mov` or `bgm.wav`.
    expect(summary.previews.find((item) => item.role === "source")?.path).toBe(`${root}/sources/ep1.mp4`);
    // Overlay `title_card.mov` must NOT be misclassified as `final`.
    expect(summary.previews.find((item) => item.role === "final")).toBeUndefined();
    expect(summary.previews.find((item) => item.role === "edited")?.path).toBe(`${root}/work/out/preview.mp4`);
    expect(summary.qualityCheck?.media).toBe(`${root}/work/out/preview.mp4`);
    expect(summary.qualityCheck?.mediaRole).toBe("edited");

    // Falls back to EDIT_PLAN.md heading when BRIEF.md has no heading.
    const editPlanTitle = summarizeVideoProject(root, files, {
      brief: "纯文本无标题",
      editPlan: "# 剪辑方案：雪夜突围\n"
    });
    expect(editPlanTitle.title).toBe("剪辑方案：雪夜突围");
  });

  it("does not choose an ambiguous narration file for editing", () => {
    const root = "video-recaps/ambiguous";
    const summary = summarizeVideoProject(root, [
      file(`${root}/work/narration.json`),
      file(`${root}/archive/narration.json`)
    ], { narration: [] });
    expect(summary.narrationPath).toBeUndefined();
    expect(summary.narrationVersion).toBeUndefined();
    expect(summary.narrative).toBeDefined();
  });
});
