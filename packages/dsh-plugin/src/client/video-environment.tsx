import { useEffect, useState } from "react";
import type { VideoPreflightStatus } from "../workspace-route.js";
import { endpoint } from "./workbench-ui.js";

export type VideoPreflight = VideoPreflightStatus;

/** The host-process readiness rows; values never leave the process, only whether each is set. */
export function VideoEnvironmentReport({ preflight }: { readonly preflight: VideoPreflight }) {
  const anyTts = preflight.tts.local.ok || preflight.tts.fish || preflight.tts.openai || preflight.tts.indexTts;
  const anyAsr = preflight.asr.localWhisper.ok || preflight.asr.remote;
  return <>
    <span data-ready={preflight.python.ok || undefined}>
      Python {preflight.python.version ?? "未找到"}{preflight.python.ok ? "" : ` · 需要 ${preflight.python.minimum}+`}
    </span>
    <span data-ready={(preflight.ffmpeg.ok && preflight.ffmpeg.subtitles) || undefined}>
      ffmpeg {!preflight.ffmpeg.ok ? "未找到" : preflight.ffmpeg.subtitles ? "可用 · 含字幕滤镜" : "缺字幕滤镜（subtitles / libass）"}
    </span>
    <span data-ready={preflight.ffprobe.ok || undefined}>
      ffprobe {preflight.ffprobe.ok ? "可用" : "未找到"}
    </span>
    <strong className="oh-video-env-group">语音合成（TTS）</strong>
    <span data-ready={preflight.tts.local.ok || undefined} data-optional={!preflight.tts.local.ok && anyTts ? "true" : undefined}>
      本地离线 TTS {preflight.tts.local.ok ? `可用（${preflight.tts.local.engine ?? "系统语音"}）` : "未找到（say / espeak-ng）"}
    </span>
    <span data-ready={preflight.tts.fish || undefined} data-optional={!preflight.tts.fish && anyTts ? "true" : undefined}>
      Fish Audio（FISH_API_KEY / FISH_AUDIO_API_KEY）{preflight.tts.fish ? "已配置" : "未配置（可选）"}
    </span>
    <span data-ready={preflight.tts.openai || undefined} data-optional={!preflight.tts.openai && anyTts ? "true" : undefined}>
      OpenAI TTS（OPENAI_API_KEY + TTS_API_URL）{preflight.tts.openai
        ? "已配置（自动选择）"
        : preflight.tts.openaiApiKey === true
          ? "已配置 OPENAI_API_KEY（需配 TTS_API_URL 自动启用，或显式 --engine openai）"
          : "未配置（可选）"}
    </span>
    <span data-ready={preflight.tts.indexTts || undefined} data-optional={!preflight.tts.indexTts && anyTts ? "true" : undefined}>
      IndexTTS（INDEX_TTS_ENDPOINT）{preflight.tts.indexTts
        ? preflight.tts.indexTtsVoice === true
          ? "已配置（含默认音色 INDEX_TTS_VOICE）"
          : "已配置（INDEX_TTS_VOICE 可选，亦可通过 --voice 指定）"
        : "未配置（可选，INDEX_TTS_VOICE 为可选默认音色）"}
    </span>
    <strong className="oh-video-env-group">语音转写（ASR）</strong>
    <span data-ready={preflight.asr.localWhisper.ok || undefined} data-optional={!preflight.asr.localWhisper.ok && anyAsr ? "true" : undefined}>
      本地 Whisper {preflight.asr.localWhisper.ok ? `可用（${preflight.asr.localWhisper.cli ?? "CLI"}）` : "未找到（whisper / faster-whisper / mlx_whisper / whisper-cli）"}
    </span>
    <span data-ready={preflight.asr.remote || undefined} data-optional={!preflight.asr.remote && anyAsr ? "true" : undefined}>
      远程 ASR（ASR_API_URL / ASR_API_KEY）{preflight.asr.remote ? "已配置" : "未配置（可选）"}
    </span>
    <em>Key、环境变量与 PATH 在启动 DSH 的终端里设置，重启 DSH 后生效。这里检查 DSH Host 进程；Agent 运行环境以 <code>scripts/probe.py</code> 与 <code>scripts/check.py</code> 的结果为准。</em>
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
        : <em>正在检查 Python、ffmpeg、TTS 与 ASR 运行环境…</em>}
  </div>;
}
