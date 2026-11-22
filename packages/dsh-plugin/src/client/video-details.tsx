import { useEffect, useRef, useState } from "react";
import type { VideoCheckItemStatus, VideoQualityReviewHint } from "../video-project.js";
import { endpoint } from "./workbench-ui.js";
import { createDialogBackdropGuard } from "./workbench-settings-panel.js";
import { VideoEnvironment } from "./video-environment.js";
import { videoDocumentTitle, videoRange, videoTime, type VideoProject } from "./video-workspace-model.js";

const CHECK_STATUS_LABEL: Readonly<Record<VideoCheckItemStatus, string>> = {
  pass: "通过",
  warn: "需复核",
  fail: "失败",
  skip: "跳过"
};

/** Safely open a native `<dialog>` without throwing `InvalidStateError` if already open. */
export function openDialogSafely(element: { readonly open: boolean; showModal?: () => void } | null): boolean {
  if (element === null || element.open || typeof element.showModal !== "function") return false;
  element.showModal();
  return true;
}

/** Resolve the currently selected artifact or fall back to the first available artifact. */
export function resolveVideoDetailsArtifact(
  artifacts: VideoProject["artifacts"],
  selected: string | undefined
): VideoProject["artifacts"][number] | undefined {
  return artifacts.find((item) => item.path === selected) ?? artifacts[0];
}

/**
 * Resolve the artifact read error for `VideoDetails`.
 * Never lets an unrelated main-editor `fileReadError` hide `VideoDetails`'s own loaded content
 * or leak onto an artifact whose path differs from `fileReadErrorPath`.
 */
export function resolveVideoDetailsError(input: {
  readonly fetchError: string | undefined;
  readonly content: string | undefined;
  readonly artifactPath: string | undefined;
  readonly fileReadError?: string | null | undefined;
  readonly fileReadErrorPath?: string | undefined;
}): string | undefined {
  if (input.fetchError !== undefined) return input.fetchError;
  if (input.content !== undefined) return undefined;
  const external = input.fileReadError !== null && input.fileReadError !== undefined && input.fileReadError !== ""
    ? input.fileReadError
    : undefined;
  if (external === undefined) return undefined;
  if (input.fileReadErrorPath !== undefined && input.artifactPath !== input.fileReadErrorPath) {
    return undefined;
  }
  return external;
}

export interface VideoDetailsProps {
  readonly project?: VideoProject | undefined;
  readonly sessionId: string;
  readonly onClose: () => void;
  readonly fileReadError?: string | null | undefined;
  readonly fileReadErrorPath?: string | undefined;
  readonly onRetryRead?: (() => void) | undefined;
  readonly onSeekHint?: ((hint: VideoQualityReviewHint) => void) | undefined;
  readonly onDiscussHint?: ((hint: VideoQualityReviewHint) => void) | undefined;
}

export function VideoDetails({
  project,
  sessionId,
  onClose,
  fileReadError,
  fileReadErrorPath,
  onRetryRead,
  onSeekHint,
  onDiscussHint
}: VideoDetailsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropGuard = useRef(createDialogBackdropGuard());
  const closed = useRef(false);
  const [selected, setSelected] = useState<string | undefined>(() => project?.artifacts[0]?.path);
  const [attempt, setAttempt] = useState(0);
  const [content, setContent] = useState<string>();
  const [error, setError] = useState<string>();

  const artifacts = project?.artifacts ?? [];
  const artifact = resolveVideoDetailsArtifact(artifacts, selected);

  useEffect(() => {
    const next = resolveVideoDetailsArtifact(artifacts, selected)?.path;
    if (next !== selected) setSelected(next);
  }, [artifacts, selected]);

  useEffect(() => {
    openDialogSafely(dialog.current);
  }, []);

  useEffect(() => {
    if (artifact === undefined) {
      setContent(undefined);
      setError(undefined);
      return;
    }
    const controller = new AbortController();
    setContent(undefined);
    setError(undefined);
    void fetch(endpoint("file", sessionId, artifact.path), { signal: controller.signal }).then(async (response) => {
      let payload: { readonly content?: string; readonly error?: string } | undefined;
      try {
        payload = await response.json() as { readonly content?: string; readonly error?: string };
      } catch {
        payload = undefined;
      }
      if (!response.ok) throw new Error(payload?.error ?? `暂时无法读取制作记录（HTTP ${String(response.status)}）`);
      if (!controller.signal.aborted) setContent(payload?.content ?? "");
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { controller.abort(); };
  }, [artifact?.path, artifact?.version, attempt, sessionId]);

  const notifyClose = (): void => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  const closeDialog = (): void => {
    const element = dialog.current;
    if (element !== null && element.open && typeof element.close === "function") {
      element.close();
    }
    notifyClose();
  };

  const displayError = resolveVideoDetailsError({
    fetchError: error,
    content,
    artifactPath: artifact?.path,
    fileReadError,
    fileReadErrorPath
  });
  const retryFetch = (): void => {
    if (error !== undefined) setAttempt((value) => value + 1);
    else onRetryRead?.();
  };
  const qualityCheck = project?.qualityCheck;

  return <dialog
    ref={dialog}
    className="oh-video-details"
    aria-label="视频制作详情"
    onClose={notifyClose}
    onPointerDown={(event) => {
      backdropGuard.current.onPointerDown(dialog.current, event);
    }}
    onClick={(event) => {
      if (backdropGuard.current.shouldCloseOnClick(dialog.current, event)) closeDialog();
    }}
  >
    <div className="oh-video-details-body">
    <header>
      <div>
        <h2>制作详情</h2>
        {project !== undefined && project.stageLabel !== "" && <span className="oh-video-stage-pill" data-state={project.state}>{project.stageLabel}</span>}
      </div>
      <button type="button" onClick={closeDialog}>关闭</button>
    </header>
    <details><summary>运行环境</summary><VideoEnvironment sessionId={sessionId} /></details>
    {qualityCheck !== undefined && <section className="oh-video-details-qc" aria-label="成片物理体检">
      <header>
        <span className="oh-video-qc-pill" data-status={qualityCheck.status}>
          {qualityCheck.status === "pass" ? "通过" : qualityCheck.status === "warn" ? "需复核" : "失败"}
        </span>
        <strong>{qualityCheck.summary}</strong>
      </header>
      <ul className="oh-video-qc-checks">
        {qualityCheck.checks.map((check) => <li key={check.key} data-status={check.status}>
          <span className="oh-video-qc-check-status">{CHECK_STATUS_LABEL[check.status]}</span>
          <strong>{check.label}</strong>
          {check.detail !== "" && <small>{check.detail}</small>}
        </li>)}
      </ul>
      {qualityCheck.reviewHints.length > 0 && <ul className="oh-video-qc-hints">
        {qualityCheck.reviewHints.map((hint, index) => <li key={`${hint.check}-${hint.code}-${String(index)}`} className="oh-video-qc-hint" data-severity={hint.severity}>
          <div className="oh-video-qc-hint-copy">
            <span className="oh-video-qc-hint-badge" data-severity={hint.severity}>{hint.severity === "fail" ? "失败" : "待复核"}</span>
            <strong>{hint.label}</strong>
            <p>{hint.message}</p>
          </div>
          <div className="oh-video-qc-hint-actions">
            {hint.timestamp !== undefined && onSeekHint !== undefined && <button type="button" onClick={() => { onSeekHint(hint); closeDialog(); }}>
              跳到 {hint.endTimestamp !== undefined ? videoRange({ start: hint.timestamp, end: hint.endTimestamp }) : videoTime(hint.timestamp)}
            </button>}
            {onDiscussHint !== undefined && <button type="button" onClick={() => { onDiscussHint(hint); closeDialog(); }}>带到 Chat 讨论</button>}
          </div>
        </li>)}
      </ul>}
    </section>}
    {project !== undefined && artifacts.length > 0 && <>
      <label>制作记录<select aria-label="制作记录" value={artifact?.path ?? ""} onChange={(event) => { setSelected(event.target.value); }}>
        {artifacts.map((item) => <option key={item.path} value={item.path}>{videoDocumentTitle(item)}</option>)}
      </select></label>
      {artifact !== undefined && <>
        <small>{artifact.path}</small>
        {displayError !== undefined
          ? <div className="oh-video-details-error" role="alert"><p>{displayError}</p><button type="button" onClick={retryFetch}>重新读取</button></div>
          : <pre className={content === undefined ? "oh-loading-state" : undefined}>{content ?? "正在读取制作记录…"}</pre>}
      </>}
    </>}
    </div>
  </dialog>;
}
