import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoEnvironmentReport, VideoStudio, type VideoPreflight } from "../src/client/video-studio.js";

const missing: VideoPreflight = {
  python: { ok: false, version: "3.9.6", minimum: "3.10" },
  ffmpeg: { ok: false, subtitles: false },
  ffprobe: { ok: false },
  credentials: { mimo: false, fish: false, indexTts: false, ttsProvider: "auto" }
};

describe("video runtime check", () => {
  // Audit 2026-10-19 #13: the requirements were only visible after a video project existed.
  it("keeps production details reachable before a project exists without showing setup as the creative home", () => {
    const html = renderToStaticMarkup(<VideoStudio
      sessionId="s" projects={[]} running={false} projectId={undefined} tab="preview" hidden={false}
      workbenches={["story", "video"]} paneId="pane" labelledBy="tab"
      files={[]} chatOpen={false} onChatOpen={() => undefined} onContinueInChat={() => undefined} canvasByProject={{}} onCanvasChange={() => undefined}
      editor={{ selected: undefined, buffers: {}, mode: "preview", textareaRef: { current: null }, errors: {}, onSelect: () => undefined, onEdit: () => undefined, onSave: async () => undefined, onMode: () => undefined, onConflict: () => undefined, onDiscard: () => undefined, onRememberPosition: () => undefined, onRetry: () => undefined }}
      onProject={() => undefined} onTab={() => undefined} onWorkbench={() => undefined} onCollapse={() => undefined}
    />);
    expect(html).toContain("把这段故事，讲给更多人听");
    expect(html).toContain("制作详情");
    expect(html).not.toContain("Python");
    expect(html).not.toContain("video-recaps/&lt;");
  });

  it("names each missing requirement and the version floor", () => {
    const html = renderToStaticMarkup(<VideoEnvironmentReport preflight={missing} />);
    expect(html).toContain("Python 3.9.6 · 需要 3.10+");
    expect(html).toContain("ffmpeg 未找到");
    expect(html).toContain("ffprobe 未找到");
    expect(html).toContain("MiMo Key 未配置");
    expect(html).toContain("Fish Key 未配置");
    expect(html).not.toContain("data-ready");
    expect(html).toContain("重启 DSH 后生效");
  });

  it("marks a ready host and drops the Fish fallback once MiMo voices", () => {
    const html = renderToStaticMarkup(<VideoEnvironmentReport preflight={{
      python: { ok: true, version: "3.12.1", minimum: "3.10" },
      ffmpeg: { ok: true, subtitles: true },
      ffprobe: { ok: true },
      credentials: { mimo: true, fish: false, indexTts: false, ttsProvider: "auto" }
    }} />);
    expect(html).toContain("Python 3.12.1</span>");
    expect(html).toContain("ffmpeg · libass");
    expect(html).not.toContain("Fish Key");
    expect(html.match(/data-ready/gu)).toHaveLength(4);
  });
});
