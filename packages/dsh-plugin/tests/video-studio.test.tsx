import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { projectVideoNarrative } from "../src/video-narrative.js";
import type { GameDocumentEditor } from "../src/client/game-documents.js";
import {
  openDialogSafely,
  resolveVideoDetailsArtifact,
  resolveVideoDetailsError,
  VideoDetails
} from "../src/client/video-details.js";
import {
  acknowledgePreviewVersion,
  applyLoadedSeek,
  discoverNewerPreview,
  mapPreviewSwitchTime,
  observeStudioNarrow,
  previewAssetVersionKey,
  resolveReviewHintSeek,
  VideoQualityCheckPanel,
  VideoStudio,
  type VideoPreviewAsset,
  type VideoProject,
  type VideoQualityCheckSummary
} from "../src/client/video-studio.js";

const editor: GameDocumentEditor = {
  selected: undefined,
  buffers: {},
  mode: "preview",
  textareaRef: createRef<HTMLTextAreaElement>(),
  errors: {},
  onSelect: vi.fn(),
  onEdit: vi.fn(),
  onSave: vi.fn(),
  onMode: vi.fn(),
  onConflict: vi.fn(),
  onDiscard: vi.fn(),
  onRememberPosition: vi.fn(),
  onRetry: vi.fn()
};

const asset = (
  role: VideoPreviewAsset["role"],
  path: string,
  extra: Partial<VideoPreviewAsset> = {}
): VideoPreviewAsset => ({
  role,
  label: role === "source" ? "原片" : role === "final" ? "最终成片" : "粗剪预览",
  path,
  version: "v1",
  bytes: 1024,
  mimeType: "video/mp4",
  ...extra
});

const sampleQualityCheck: VideoQualityCheckSummary = {
  ok: true,
  status: "warn",
  summary: "物理体检通过，2 条待复核",
  path: "video-recaps/recap/work/check.json",
  version: "v1",
  checks: [
    { key: "container_valid", label: "容器格式", status: "pass", detail: "mp4" },
    { key: "audio_health", label: "音频响度与边缘", status: "warn", detail: "1 处切点人声截断" },
    { key: "visual_health", label: "画面黑屏与定格", status: "warn", detail: "1 处黑屏" }
  ],
  reviewHints: [
    {
      check: "visual_health",
      code: "black_span",
      label: "黑屏片段",
      message: "12.5s–14s 检测到黑屏（1.5s）",
      severity: "warn",
      timestamp: 12.5,
      endTimestamp: 14
    },
    {
      check: "audio_health",
      code: "edge_speech_truncation",
      label: "切点人声截断",
      message: "v2 出点疑似切到人声",
      severity: "warn",
      timestamp: 28
    }
  ]
};

beforeAll(() => {
  vi.stubGlobal("location", { origin: "http://localhost" });
});

describe("VideoStudio preview version discovery (version-aware + no final -> preview downgrade)", () => {
  it("acknowledges lower-tier edited/preview versions when loading final so banner never downgrades", () => {
    const source = asset("source", "video-recaps/a/sources/in.mp4");
    const preview = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview" });
    const final = asset("final", "video-recaps/a/work/out/final.mp4");

    // Started with only source acknowledged
    const ack = new Map<VideoPreviewAsset["role"], string>([["source", previewAssetVersionKey(source)]]);
    // Both preview.mp4 and final.mp4 arrive together -> discovers final (highest tier)
    expect(discoverNewerPreview([source, preview, final], "source", ack)).toEqual(final);

    // User clicks "载入新版本" -> loads final and acknowledges lower tiers too
    acknowledgePreviewVersion(ack, [source, preview, final], final);
    expect(ack.get("edited")).toBe(previewAssetVersionKey(preview));
    expect(discoverNewerPreview([source, preview, final], "final", ack)).toBeUndefined();
  });

  it("never offers edited/preview when user is already playing final even if edited is regenerated", () => {
    const source = asset("source", "video-recaps/a/sources/in.mp4");
    const previewV2 = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview", version: "v2" });
    const final = asset("final", "video-recaps/a/work/out/final.mp4");
    const ack = new Map<VideoPreviewAsset["role"], string>([
      ["source", previewAssetVersionKey(source)],
      ["final", previewAssetVersionKey(final)]
    ]);
    expect(discoverNewerPreview([source, previewV2, final], "final", ack)).toBeUndefined();
  });

  it("discovers regenerated final.mp4 (v2) when user is viewing source or edited", () => {
    const source = asset("source", "video-recaps/a/sources/in.mp4");
    const preview = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview" });
    const finalV1 = asset("final", "video-recaps/a/work/out/final.mp4", { version: "v1" });
    const finalV2 = asset("final", "video-recaps/a/work/out/final.mp4", { version: "v2" });
    const ack = new Map<VideoPreviewAsset["role"], string>([
      ["source", previewAssetVersionKey(source)],
      ["edited", previewAssetVersionKey(preview)],
      ["final", previewAssetVersionKey(finalV1)]
    ]);
    expect(discoverNewerPreview([source, preview, finalV1], "source", ack)).toBeUndefined();
    expect(discoverNewerPreview([source, preview, finalV2], "source", ack)).toEqual(finalV2);
    expect(discoverNewerPreview([source, preview, finalV2], "edited", ack)).toEqual(finalV2);
  });

  it("still discovers final when user is viewing preview", () => {
    const preview = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview" });
    const final = asset("final", "video-recaps/a/work/out/final.mp4");
    const ack = new Map<VideoPreviewAsset["role"], string>([
      ["edited", previewAssetVersionKey(preview)]
    ]);
    expect(discoverNewerPreview([preview, final], "edited", ack)).toEqual(final);
  });
});

describe("VideoStudio mismatch notice survival, review hint clamping & mediaRole routing", () => {
  it("preserves mismatch notice when preserveNotice is true during programmatic metadata seek", () => {
    const videoEl = { currentTime: 0, duration: 60, readyState: 1 };
    const result = applyLoadedSeek(videoEl, { role: "source", time: 15, preserveNotice: true });
    expect(result).toEqual({ status: "applied", clearNotice: false, range: undefined });
    expect(videoEl.currentTime).toBe(15);
  });

  it("clears notice on a normal aligned seek and reports out-of-range times unless clampToDuration is set", () => {
    const videoEl = { currentTime: 0, duration: 30, readyState: 1 };
    expect(applyLoadedSeek(videoEl, { role: "final", time: 10 })).toEqual({
      status: "applied",
      clearNotice: true,
      range: undefined
    });
    expect(videoEl.currentTime).toBe(10);

    const oob = applyLoadedSeek(videoEl, { role: "final", time: 45 });
    expect(oob.status).toBe("out-of-range");
    expect(oob.notice).toContain("超出当前视频范围");

    // Tail review hint (e.g. subtitle_past_video_end at duration or edge === "out") clamps cleanly inside duration.
    const clamped = applyLoadedSeek(videoEl, {
      role: "final",
      time: 30,
      range: { start: 30, end: 31.5 },
      clampToDuration: true
    });
    expect(clamped).toEqual({
      status: "applied",
      clearNotice: true,
      range: { start: 29.75, end: 30 }
    });
    expect(videoEl.currentTime).toBe(29.75);

    const deferred = applyLoadedSeek({ currentTime: 0, duration: 30, readyState: 0 }, { role: "final", time: 5 });
    expect(deferred.status).toBe("deferred");
  });

  it("respects qualityCheck.mediaRole and never seeks raw source with output-clock review hints", () => {
    const source = asset("source", "video-recaps/a/sources/in.mp4");
    const preview = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview" });
    const final = asset("final", "video-recaps/a/work/out/final.mp4");
    const tailHint = {
      check: "subtitle_and_timing",
      code: "subtitle_past_video_end",
      label: "字幕超出片尾",
      message: "字幕超出片尾",
      severity: "warn" as const,
      timestamp: 30,
      endTimestamp: 31.2
    };

    const forFinal = resolveReviewHintSeek(
      { previews: [source, preview, final], qualityCheck: { ...sampleQualityCheck, mediaRole: "final" } },
      "edited",
      tailHint
    );
    expect(forFinal).toEqual({
      request: { role: "final", time: 30, range: { start: 30, end: 31.2 }, clampToDuration: true }
    });

    const forEdited = resolveReviewHintSeek(
      { previews: [source, preview, final], qualityCheck: { ...sampleQualityCheck, mediaRole: "edited" } },
      "final",
      tailHint
    );
    expect(forEdited).toEqual({
      request: { role: "edited", time: 30, range: { start: 30, end: 31.2 }, clampToDuration: true }
    });

    const sourceOnly = resolveReviewHintSeek(
      { previews: [source], qualityCheck: { ...sampleQualityCheck, mediaRole: "final" } },
      "source",
      tailHint
    );
    expect(sourceOnly).toEqual({ notice: "暂无成片或粗剪预览，无法按质检时间戳跳转。" });
  });
});

describe("VideoStudio timeline.json v3 clips switchPreview mapping", () => {
  it("maps output<->source across pauses, non-narration cuts, and multi-clip spans using narrative.clips", () => {
    const sourceA = asset("source", "video-recaps/a/sources/a.mp4");
    const final = asset("final", "video-recaps/a/work/out/final.mp4");
    const narrative = projectVideoNarrative({
      timeline: {
        schema_version: 3,
        sources: { s1: "sources/a.mp4", s2: "sources/b.mp4" },
        video: [
          { id: "v1", source: "s1", in: 10, out: 20 },
          { id: "v2", source: "s1", in: 50, out: 60 },
          { id: "v3", source: "s2", in: 5, out: 15 }
        ],
        audio: {
          narration: [
            { id: "n1", at: 0, duration: 3, text: "开场" },
            { id: "n2", at: 8, duration: 5, text: "跨两段镜头" }
          ]
        }
      },
      resolveSourcePath: (raw) => `video-recaps/a/${raw}`
    });
    const proj = { root: "video-recaps/a", previews: [sourceA, final], narrative };
    const files = [{ ...sourceA, kind: "media" as const }];

    // Pause between narrations (t=5s in output -> 15s in sourceA via clip v1)
    expect(mapPreviewSwitchTime({
      project: proj, files, narrative, fromRole: "final", toRole: "source", currentTime: 5
    })).toEqual({ time: 15, mapped: true });

    // Inside multi-clip narration on second clip (t=11s in output -> 51s in sourceA via clip v2)
    expect(mapPreviewSwitchTime({
      project: proj, files, narrative, fromRole: "final", toRole: "source", currentTime: 11
    })).toEqual({ time: 51, mapped: true });

    // Source -> output via clip v2 (55s in sourceA -> 15s in output)
    expect(mapPreviewSwitchTime({
      project: proj, files, narrative, fromRole: "source", toRole: "final", currentTime: 55
    })).toEqual({ time: 15, mapped: true });

    // Foreign source clip v3 (sources/b.mp4 != sources/a.mp4) must NOT map to sourceA
    expect(mapPreviewSwitchTime({
      project: proj, files, narrative, fromRole: "final", toRole: "source", currentTime: 22, fallbackTime: 4
    })).toEqual({ time: 4, mapped: false });
  });
});

describe("VideoStudio ResizeObserver narrow measurement", () => {
  it("tracks container width transitions via ResizeObserver and disconnects on cleanup", () => {
    let observedCallback: (() => void) | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    class MockResizeObserver {
      constructor(callback: () => void) {
        observedCallback = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    try {
      const box = { clientWidth: 1024 };
      const values: boolean[] = [];
      const cleanup = observeStudioNarrow(box, (narrow) => { values.push(narrow); });
      expect(values).toEqual([false]);
      expect(observe).toHaveBeenCalledTimes(1);

      box.clientWidth = 640;
      observedCallback?.();
      expect(values).toEqual([false, true]);

      box.clientWidth = 900;
      observedCallback?.();
      expect(values).toEqual([false, true, false]);

      cleanup();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal("location", { origin: "http://localhost" });
    }
  });
});

describe("VideoStudio v0.8.0 surface, qualityCheck, labels & optional controls", () => {
  const v08Project: VideoProject = {
    id: "recap-v08",
    root: "video-recaps/recap-v08",
    title: "雪夜来信",
    state: "ready",
    stage: "complete",
    stageLabel: "成片已就绪",
    editedKind: "preview",
    previews: [
      asset("source", "video-recaps/recap-v08/sources/raw.mp4"),
      asset("edited", "video-recaps/recap-v08/work/out/preview.mp4", { editedKind: "preview" }),
      asset("final", "video-recaps/recap-v08/work/out/final.mp4")
    ],
    artifacts: [
      { path: "video-recaps/recap-v08/work/EDIT_PLAN.md", version: "v1", label: "剪辑与旁白方案", kind: "script" },
      { path: "video-recaps/recap-v08/work/out/recap.srt", version: "v1", label: "SRT 字幕（recap.srt）", kind: "subtitle" }
    ],
    qualityCheck: sampleQualityCheck
  };

  it("renders stageLabel, 粗剪预览 tab label, qualityCheck pill, optional refresh and create project option", () => {
    const html = renderToStaticMarkup(<VideoStudio
      sessionId="s1"
      projects={[v08Project]}
      files={[]}
      running={false}
      projectId={v08Project.id}
      tab="preview"
      hidden={false}
      paneId="pane"
      labelledBy="tab"
      onProject={vi.fn()}
      onTab={vi.fn()}
      onWorkbench={vi.fn()}
      onCollapse={vi.fn()}
      chatOpen={false}
      onChatOpen={vi.fn()}
      onContinueInChat={vi.fn()}
      editor={editor}
      canvasByProject={{}}
      onCanvasChange={vi.fn()}
      onRefresh={vi.fn()}
      onCreateProject={vi.fn()}
    />);
    expect(html).toContain("成片已就绪");
    expect(html).toContain(">粗剪预览</button>");
    expect(html).toContain(">成片</button>");
    expect(html).toContain("需复核 · 2");
    expect(html).toContain("物理体检通过，2 条待复核");
    expect(html).toContain('aria-label="刷新视频项目"');
    expect(html).toContain("+ 新建视频项目");
    expect(html).toContain('aria-expanded="false"');
  });

  it("renders failing checks ABOVE reviewHints simultaneously instead of hiding hard failures", () => {
    const failedQc: VideoQualityCheckSummary = {
      ...sampleQualityCheck,
      ok: false,
      status: "fail",
      summary: "物理体检未通过（1 项失败）",
      checks: [
        { key: "container_valid", label: "容器格式", status: "pass", detail: "mp4" },
        { key: "av_sync", label: "音画同步", status: "fail", detail: "音视频时长差 1.2s" },
        { key: "visual_health", label: "画面黑屏与定格", status: "warn", detail: "1 处黑屏" }
      ]
    };
    const html = renderToStaticMarkup(<VideoQualityCheckPanel
      qualityCheck={failedQc}
      initialOpen
      onSeekHint={vi.fn()}
      onDiscussHint={vi.fn()}
    />);
    expect(html).toContain('aria-expanded="true"');
    const checkPos = html.indexOf("音画同步");
    const hintPos = html.indexOf("黑屏片段");
    expect(checkPos).toBeGreaterThan(-1);
    expect(hintPos).toBeGreaterThan(checkPos);
    expect(html).toContain("音视频时长差 1.2s");
    expect(html).toContain("12.5s–14s 检测到黑屏（1.5s）");
    expect(html).toContain("跳到 00:12–00:14");
    expect(html).toContain("跳到 00:28");
    expect(html).toContain("带到 Chat 讨论");
  });

  it("enters creation empty state when projectId is empty string while keeping existing projects selectable", () => {
    const html = renderToStaticMarkup(<VideoStudio
      sessionId="s1"
      projects={[v08Project]}
      files={[]}
      running={false}
      projectId=""
      tab="preview"
      hidden={false}
      paneId="pane"
      labelledBy="tab"
      onProject={vi.fn()}
      onTab={vi.fn()}
      onWorkbench={vi.fn()}
      onCollapse={vi.fn()}
      chatOpen={false}
      onChatOpen={vi.fn()}
      onContinueInChat={vi.fn()}
      editor={editor}
      canvasByProject={{}}
      onCanvasChange={vi.fn()}
      onCreateProject={vi.fn()}
    />);
    expect(html).toContain("把这段故事，讲给更多人听");
    expect(html).toContain("新建视频项目");
    expect(html).toContain("雪夜来信");
    expect(html).toContain("+ 新建视频项目");
    expect(html).not.toContain('aria-label="视频项目" disabled=""');
  });

  it("renders workspaceError alert with retry button and truncated warning banner", () => {
    const html = renderToStaticMarkup(<VideoStudio
      sessionId="s1"
      projects={[v08Project]}
      files={[]}
      running={false}
      projectId={v08Project.id}
      tab="preview"
      hidden={false}
      paneId="pane"
      labelledBy="tab"
      onProject={vi.fn()}
      onTab={vi.fn()}
      onWorkbench={vi.fn()}
      onCollapse={vi.fn()}
      chatOpen={false}
      onChatOpen={vi.fn()}
      onContinueInChat={vi.fn()}
      editor={editor}
      canvasByProject={{}}
      onCanvasChange={vi.fn()}
      onRefresh={vi.fn()}
      workspaceError="工作区同步失败（502）"
      truncated
    />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("工作区同步失败（502）");
    expect(html).toContain(">重试</button>");
    expect(html).toContain("oh-story-truncated-banner");
    expect(html).toContain("工作区文件数已达上限");
  });

  it("supports custom *.srt export button in docs tab", () => {
    const html = renderToStaticMarkup(<VideoStudio
      sessionId="s1"
      projects={[v08Project]}
      files={[]}
      running={false}
      projectId={v08Project.id}
      tab="docs"
      hidden={false}
      paneId="pane"
      labelledBy="tab"
      onProject={vi.fn()}
      onTab={vi.fn()}
      onWorkbench={vi.fn()}
      onCollapse={vi.fn()}
      chatOpen={false}
      onChatOpen={vi.fn()}
      onContinueInChat={vi.fn()}
      editor={editor}
      canvasByProject={{}}
      onCanvasChange={vi.fn()}
    />);
    expect(html).toContain("导出项目字幕");
  });
});

describe("VideoDetails dialog guard, self-healing selection & qualityCheck breakdown", () => {
  it("guards showModal against already-open dialogs", () => {
    const showModal = vi.fn();
    expect(openDialogSafely({ open: false, showModal })).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(openDialogSafely({ open: true, showModal })).toBe(false);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(openDialogSafely(null)).toBe(false);
  });

  it("self-heals stale or empty artifact selection", () => {
    const artifacts: VideoProject["artifacts"] = [
      { path: "video-recaps/a/work/EDIT_PLAN.md", version: "1", label: "剪辑与旁白方案", kind: "script" },
      { path: "video-recaps/a/work/check.json", version: "1", label: "成片体检", kind: "quality" }
    ];
    expect(resolveVideoDetailsArtifact(artifacts, undefined)?.path).toBe("video-recaps/a/work/EDIT_PLAN.md");
    expect(resolveVideoDetailsArtifact(artifacts, "video-recaps/other/stale.md")?.path).toBe("video-recaps/a/work/EDIT_PLAN.md");
    expect(resolveVideoDetailsArtifact(artifacts, "video-recaps/a/work/check.json")?.path).toBe("video-recaps/a/work/check.json");
    expect(resolveVideoDetailsArtifact([], "video-recaps/a/work/check.json")).toBeUndefined();
  });

  it("renders full qualityCheck breakdown and fileReadError retry inside VideoDetails", () => {
    const html = renderToStaticMarkup(<VideoDetails
      sessionId="s1"
      project={{
        id: "recap",
        root: "video-recaps/recap",
        title: "雪夜来信",
        state: "ready",
        stage: "complete",
        stageLabel: "成片已就绪",
        previews: [],
        artifacts: [{ path: "video-recaps/recap/work/check.json", version: "1", label: "成片体检", kind: "quality" }],
        qualityCheck: sampleQualityCheck
      }}
      fileReadError="无法读取 check.json"
      onRetryRead={vi.fn()}
      onSeekHint={vi.fn()}
      onDiscussHint={vi.fn()}
      onClose={vi.fn()}
    />);
    expect(html).toContain("成片已就绪");
    expect(html).toContain("容器格式");
    expect(html).toContain("音频响度与边缘");
    expect(html).toContain("画面黑屏与定格");
    expect(html).toContain("跳到 00:12–00:14");
    expect(html).toContain("带到 Chat 讨论");
    expect(html).toContain("无法读取 check.json");
    expect(html).toContain("重新读取");
  });

  it("isolates VideoDetails from unrelated main-editor fileReadError and never hides loaded content", () => {
    // Already-loaded content must never be hidden by an unrelated fileReadError
    expect(resolveVideoDetailsError({
      fetchError: undefined,
      content: '{"ok":true}',
      artifactPath: "video-recaps/recap/work/check.json",
      fileReadError: "主编辑器读取 BRIEF.md 失败",
      fileReadErrorPath: "video-recaps/recap/work/BRIEF.md"
    })).toBeUndefined();

    // Unrelated main-editor fileReadError for a different path must not leak even before content finishes loading
    expect(resolveVideoDetailsError({
      fetchError: undefined,
      content: undefined,
      artifactPath: "video-recaps/recap/work/check.json",
      fileReadError: "主编辑器读取 BRIEF.md 失败",
      fileReadErrorPath: "video-recaps/recap/work/BRIEF.md"
    })).toBeUndefined();

    // Matching path while loading still surfaces the error
    expect(resolveVideoDetailsError({
      fetchError: undefined,
      content: undefined,
      artifactPath: "video-recaps/recap/work/check.json",
      fileReadError: "无法读取 check.json",
      fileReadErrorPath: "video-recaps/recap/work/check.json"
    })).toBe("无法读取 check.json");

    // Own fetchError always wins
    expect(resolveVideoDetailsError({
      fetchError: "HTTP 500",
      content: '{"ok":true}',
      artifactPath: "video-recaps/recap/work/check.json",
      fileReadError: "无关错误",
      fileReadErrorPath: "video-recaps/recap/work/BRIEF.md"
    })).toBe("HTTP 500");

    const html = renderToStaticMarkup(<VideoDetails
      sessionId="s1"
      project={{
        id: "recap",
        root: "video-recaps/recap",
        title: "雪夜来信",
        state: "ready",
        stage: "complete",
        stageLabel: "成片已就绪",
        previews: [],
        artifacts: [{ path: "video-recaps/recap/work/check.json", version: "1", label: "成片体检", kind: "quality" }]
      }}
      fileReadError="主编辑器读取 BRIEF.md 失败"
      fileReadErrorPath="video-recaps/recap/work/BRIEF.md"
      onRetryRead={vi.fn()}
      onClose={vi.fn()}
    />);
    expect(html).toContain("正在读取制作记录…");
    expect(html).not.toContain("主编辑器读取 BRIEF.md 失败");
  });
});
