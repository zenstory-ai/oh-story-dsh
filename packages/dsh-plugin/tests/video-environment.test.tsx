import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoEnvironmentReport, VideoStudio, type VideoPreflight } from "../src/client/video-studio.js";

const missing: VideoPreflight = {
  python: { ok: false, version: "3.9.6", minimum: "3.10" },
  ffmpeg: { ok: false, subtitles: false },
  ffprobe: { ok: false },
  tts: {
    local: { ok: false },
    fish: false,
    openai: false,
    indexTts: false
  },
  asr: {
    localWhisper: { ok: false },
    remote: false
  }
};

describe("video runtime check (v0.8.0)", () => {
  // Audit 2026-10-19 #13: the requirements were only visible after a video project existed.
  it("keeps production details reachable before a project exists without showing setup as the creative home", () => {
    const html = renderToStaticMarkup(<VideoStudio
      sessionId="s" projects={[]} running={false} projectId={undefined} tab="preview" hidden={false}
      paneId="pane" labelledBy="tab"
      files={[]} chatOpen={false} onChatOpen={() => undefined} onContinueInChat={() => undefined} canvasByProject={{}} onCanvasChange={() => undefined}
      editor={{ selected: undefined, buffers: {}, mode: "preview", textareaRef: { current: null }, errors: {}, onSelect: () => undefined, onEdit: () => undefined, onSave: async () => undefined, onMode: () => undefined, onConflict: () => undefined, onDiscard: () => undefined, onRememberPosition: () => undefined, onRetry: () => undefined }}
      onProject={() => undefined} onTab={() => undefined} onWorkbench={() => undefined} onCollapse={() => undefined}
    />);
    expect(html).toContain("把这段故事，讲给更多人听");
    expect(html).toContain("制作详情");
    expect(html).not.toContain("Python");
    expect(html).not.toContain("MiMo");
    expect(html).not.toContain("video-recaps/&lt;");
  });

  it("names missing v0.8.0 requirements, TTS/ASR options, and contains zero legacy MiMo copy", () => {
    const html = renderToStaticMarkup(<VideoEnvironmentReport preflight={missing} />);
    expect(html).toContain("Python 3.9.6 · 需要 3.10+");
    expect(html).toContain("ffmpeg 未找到");
    expect(html).toContain("ffprobe 未找到");
    expect(html).toContain("本地离线 TTS 未找到（say / espeak-ng）");
    expect(html).toContain("Fish Audio（FISH_API_KEY / FISH_AUDIO_API_KEY）未配置（可选）");
    expect(html).toContain("OpenAI TTS（OPENAI_API_KEY）未配置（可选）");
    expect(html).toContain("IndexTTS（INDEX_TTS_ENDPOINT / INDEX_TTS_VOICE）未配置（可选）");
    expect(html).toContain("本地 Whisper 未找到");
    expect(html).toContain("远程 ASR（ASR_API_URL / ASR_API_KEY）未配置（可选）");
    expect(html).not.toContain("MiMo");
    expect(html).not.toContain("TTS_PROVIDER");
    expect(html).not.toContain("data-ready");
    expect(html).toContain("重启 DSH 后生效");
  });

  it("marks local-first ready host and flags unconfigured cloud backends as optional once a local engine is available", () => {
    const html = renderToStaticMarkup(<VideoEnvironmentReport preflight={{
      python: { ok: true, version: "3.12.1", minimum: "3.10" },
      ffmpeg: { ok: true, subtitles: true },
      ffprobe: { ok: true },
      tts: {
        local: { ok: true, engine: "say" },
        fish: true,
        openai: false,
        indexTts: false
      },
      asr: {
        localWhisper: { ok: true, cli: "mlx_whisper" },
        remote: false
      }
    }} />);
    expect(html).toContain("Python 3.12.1");
    expect(html).toContain("ffmpeg 可用 · 含字幕滤镜");
    expect(html).toContain("ffprobe 可用");
    expect(html).toContain("本地离线 TTS 可用（say）");
    expect(html).toContain("Fish Audio（FISH_API_KEY / FISH_AUDIO_API_KEY）已配置");
    expect(html).toContain("本地 Whisper 可用（mlx_whisper）");
    expect(html).toContain('data-optional="true"');
    expect(html.match(/data-ready="true"/gu)).toHaveLength(6);
    expect(html).not.toContain("MiMo");
  });

  it("warns when ffmpeg is present without the subtitles filter", () => {
    const html = renderToStaticMarkup(<VideoEnvironmentReport preflight={{
      ...missing,
      ffmpeg: { ok: true, subtitles: false }
    }} />);
    expect(html).toContain("ffmpeg 缺字幕滤镜（subtitles / libass）");
    expect(html).not.toContain("data-ready");
  });
});
