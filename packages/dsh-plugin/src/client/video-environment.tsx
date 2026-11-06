import { useEffect, useState } from "react";
import { endpoint } from "./workbench-ui.js";

export interface VideoPreflight {
  readonly python: { readonly ok: boolean; readonly version?: string; readonly minimum: string };
  readonly ffmpeg: { readonly ok: boolean; readonly subtitles: boolean };
  readonly ffprobe: { readonly ok: boolean };
  readonly credentials: { readonly mimo: boolean; readonly fish: boolean; readonly indexTts: boolean; readonly ttsProvider: string };
}

/** The host-process readiness rows; values never leave the process, only whether each is set. */
export function VideoEnvironmentReport({ preflight }: { readonly preflight: VideoPreflight }) {
  // auto voices with MiMo when its key is set and falls back to Fish Audio otherwise.
  const fish = preflight.credentials.ttsProvider === "fish-audio" || (preflight.credentials.ttsProvider === "auto" && !preflight.credentials.mimo);
  return <>
    <span data-ready={preflight.python.ok || undefined}>Python {preflight.python.version ?? "未找到"}{preflight.python.ok ? "" : ` · 需要 ${preflight.python.minimum}+`}</span>
    <span data-ready={(preflight.ffmpeg.ok && preflight.ffmpeg.subtitles) || undefined}>ffmpeg {!preflight.ffmpeg.ok ? "未找到" : preflight.ffmpeg.subtitles ? "· libass" : "· 缺字幕滤镜"}</span>
    <span data-ready={preflight.ffprobe.ok || undefined}>ffprobe {preflight.ffprobe.ok ? "可用" : "未找到"}</span>
    <span data-ready={preflight.credentials.mimo || undefined}>MiMo Key {preflight.credentials.mimo ? "已配置" : "未配置"}</span>
    {fish && <span data-ready={preflight.credentials.fish || undefined}>Fish Key {preflight.credentials.fish ? "已配置" : "未配置"}</span>}
    {preflight.credentials.ttsProvider === "index-tts"
      && <span data-ready={preflight.credentials.indexTts || undefined}>IndexTTS {preflight.credentials.indexTts ? "已配置" : "缺 INDEX_TTS_ENDPOINT / INDEX_TTS_VOICE"}</span>}
    <em>Key 与 PATH 在启动 DSH 的终端里设置，重启 DSH 后生效。这里检查 DSH Host 进程；Agent 运行环境以 <code>video-recap --doctor</code> 为准。</em>
  </>;
}

/**
 * Runs the check on mount: the Studio itself mounts only once the creator opens 视频, so the
 * probe never runs for a Session that never looks at video. The route caches it for 30 s.
 */
export function VideoEnvironment({ sessionId }: { readonly sessionId: string }) {
  const [preflight, setPreflight] = useState<VideoPreflight | "failed">();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint("video-preflight", sessionId), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      const summary = await response.json() as VideoPreflight;
      if (!controller.signal.aborted) setPreflight(summary);
    }).catch(() => { if (!controller.signal.aborted) setPreflight("failed"); });
    return () => { controller.abort(); };
  }, [attempt, sessionId]);
  return <div className="oh-video-environment" role="group" aria-label="视频运行环境">
    <strong>运行环境</strong>
    {typeof preflight === "object" ? <VideoEnvironmentReport preflight={preflight} />
      : preflight === "failed" ? <button type="button" onClick={() => { setPreflight(undefined); setAttempt((value) => value + 1); }}>环境检查失败 · 重试</button>
        : <em>正在检查 Python、ffmpeg 与 MiMo Key…</em>}
  </div>;
}
