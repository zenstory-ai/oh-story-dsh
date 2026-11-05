import { useEffect, useRef, useState } from "react";
import { endpoint } from "./workbench-ui.js";
import { VideoEnvironment } from "./video-environment.js";
import type { VideoProject } from "./video-workspace-model.js";

export function VideoDetails({ project, sessionId, onClose }: { readonly project?: VideoProject | undefined; readonly sessionId: string; readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(project?.artifacts[0]?.path);
  const artifact = project?.artifacts.find((item) => item.path === selected);
  const [content, setContent] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (artifact === undefined) return;
    const controller = new AbortController();
    setContent(undefined); setError(undefined);
    void fetch(endpoint("file", sessionId, artifact.path), { signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { readonly content?: string; readonly error?: string };
      if (!response.ok) throw new Error(payload.error ?? "暂时无法读取制作记录");
      if (!controller.signal.aborted) setContent(payload.content);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { controller.abort(); };
  }, [artifact?.path, artifact?.version, sessionId]);
  return <dialog ref={dialog} className="oh-video-details" aria-label="视频制作详情" onClose={onClose}>
    <header><h2>制作详情</h2><button type="button" onClick={() => { dialog.current?.close(); }}>关闭</button></header>
    <details><summary>运行环境</summary><VideoEnvironment sessionId={sessionId} /></details>
    {project !== undefined && <><label>制作记录<select aria-label="制作记录" value={selected ?? ""} onChange={(event) => { setSelected(event.target.value); }}>{project.artifacts.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>{artifact !== undefined && <><small>{artifact.path}</small>{error !== undefined ? <p role="alert">{error}</p> : <pre>{content ?? "正在读取制作记录…"}</pre>}</>}</>}
  </dialog>;
}
