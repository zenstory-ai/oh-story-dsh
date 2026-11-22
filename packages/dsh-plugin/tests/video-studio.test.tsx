import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { GameDocumentEditor } from "../src/client/game-documents.js";
import { openDialogSafely, resolveVideoDetailsArtifact, VideoDetails } from "../src/client/video-details.js";
import {
  acknowledgePreviewRole,
  applyLoadedSeek,
  discoverNewerPreview,
  observeStudioNarrow,
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

describe("VideoStudio preview version discovery (no final -> preview downgrade)", () => {
  it("acknowledges lower-tier edited/preview roles when loading final so banner never downgrades", () => {
    const source = asset("source", "video-recaps/a/sources/in.mp4");
    const preview = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview" });
    const final = asset("final", "video-recaps/a/work/out/final.mp4");

    // Started with only source acknowledged
    const ack = new Set<VideoPreviewAsset["role"]>(["source"]);
    // Both preview.mp4 and final.mp4 arrive together -> discovers final (highest tier)
    expect(discoverNewerPreview([source, preview, final], "source", ack)).toEqual(final);

    // User clicks "载入新版本" -> loads final and acknowledges lower tiers too
    acknowledgePreviewRole(ack, "final");
    expect(ack.has("edited")).toBe(true);
    expect(discoverNewerPreview([source, preview, final], "final", ack)).toBeUndefined();
  });

  it("never offers edited/preview when user is already playing final even if edited was never acknowledged", () => {
    const source = asset("source", "video-recaps/a/sources/in.mp4");
    const preview = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview" });
    const final = asset("final", "video-recaps/a/work/out/final.mp4");
    const ack = new Set<VideoPreviewAsset["role"]>(["source", "final"]);
    expect(discoverNewerPreview([source, preview, final], "final", ack)).toBeUndefined();
  });

  it("still discovers final when user is viewing preview", () => {
    const preview = asset("edited", "video-recaps/a/work/out/preview.mp4", { editedKind: "preview" });
    const final = asset("final", "video-recaps/a/work/out/final.mp4");
    const ack = new Set<VideoPreviewAsset["role"]>(["source", "edited"]);
    expect(discoverNewerPreview([preview, final], "edited", ack)).toEqual(final);
  });
});

describe("VideoStudio mismatch notice survival across loadedmetadata", () => {
  it("preserves mismatch notice when preserveNotice is true during programmatic metadata seek", () => {
    const videoEl = { currentTime: 0, duration: 60, readyState: 1 };
    const result = applyLoadedSeek(videoEl, { role: "source", time: 15, preserveNotice: true });
    expect(result).toEqual({ status: "applied", clearNotice: false, range: undefined });
    expect(videoEl.currentTime).toBe(15);
  });

  it("clears notice on a normal aligned seek and reports out-of-range times", () => {
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

    const deferred = applyLoadedSeek({ currentTime: 0, duration: 30, readyState: 0 }, { role: "final", time: 5 });
    expect(deferred.status).toBe("deferred");
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

  it("renders expanded reviewHints with timestamp jump button and 带到 Chat 讨论 button", () => {
    const html = renderToStaticMarkup(<VideoQualityCheckPanel
      qualityCheck={sampleQualityCheck}
      initialOpen
      onSeekHint={vi.fn()}
      onDiscussHint={vi.fn()}
    />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("黑屏片段");
    expect(html).toContain("12.5s–14s 检测到黑屏（1.5s）");
    expect(html).toContain("跳到 00:12–00:14");
    expect(html).toContain("跳到 00:28");
    expect(html).toContain("带到 Chat 讨论");
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
});
