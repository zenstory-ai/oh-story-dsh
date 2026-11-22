import { useEffect } from "react";
import type { VideoArtifactSummary } from "../video-project.js";
import type { GameDocumentEditor } from "./game-documents.js";
import { MarkdownPreview } from "./markdown-preview.js";
import {
  editVideoNarration,
  videoCreativeDocuments,
  videoDocumentTitle,
  videoProductionRecords,
  videoRange,
  type VideoProject
} from "./video-workspace-model.js";

interface NarrationRow { readonly index: number; readonly narration: string; readonly start: number; readonly end: number }
function narrationRows(content: string): NarrationRow[] {
  try {
    const value: unknown = JSON.parse(content);
    if (!Array.isArray(value)) return [];
    return value.slice(0, 200).flatMap((row: unknown, index) => typeof row === "object" && row !== null && "narration" in row && typeof row.narration === "string" && "start" in row && typeof row.start === "number" && Number.isFinite(row.start) && "end" in row && typeof row.end === "number" && Number.isFinite(row.end) ? [{ index, narration: row.narration, start: row.start, end: row.end }] : []);
  } catch { return []; }
}

const LABELS: Readonly<Record<string, string>> = {
  viewer_promise: "观众会看到什么", dramatic_question: "让人想看下去的疑问", pov: "从谁的视角讲", narrative_spine: "叙事主线", spine: "叙事主线", emotional_start: "开场情绪", emotional_end: "结尾情绪", ending_aftertaste: "留下的余味", director_intent: "表达意图", beats: "故事段落", title: "这一段", description: "内容", narration_job: "解说要做什么", audio_owner: "让谁来讲", change: "这一段的变化", what_changes: "这一段的变化", reason: "为什么保留", visual_choice: "画面选择", original_anchor: "原声依据"
};
function readableJson(content: string): readonly { readonly label: string; readonly text: string }[] {
  const result: { label: string; text: string }[] = [];
  const walk = (value: unknown, label: string, depth: number): void => {
    if (depth > 5 || result.length >= 100) return;
    if (typeof value === "string" && value.trim() !== "") result.push({ label, text: value });
    else if (Array.isArray(value)) value.slice(0, 50).forEach((item: unknown, i) => { walk(item, `${label} ${String(i + 1)}`, depth + 1); });
    else if (typeof value === "object" && value !== null) Object.entries(value).forEach(([key, item]) => { const title = LABELS[key]; if (title !== undefined) walk(item, title, depth + 1); });
  };
  try { walk(JSON.parse(content) as unknown, "创作内容", 0); } catch { /* The source editor retains malformed and in-progress documents. */ }
  return result;
}

export function VideoDocuments({
  project,
  editor,
  onChat,
  fileReadError,
  onRetryRead
}: {
  readonly project: VideoProject;
  readonly editor: GameDocumentEditor;
  readonly onChat: (prompt: string) => void;
  readonly fileReadError?: string | null | undefined;
  readonly onRetryRead?: (() => void) | undefined;
}) {
  const creative: VideoArtifactSummary[] = [...videoCreativeDocuments(project)];
  const records: VideoArtifactSummary[] = [...videoProductionRecords(project)];
  const files: VideoArtifactSummary[] = [...creative, ...records];
  const retained = editor.selected;
  if (retained?.startsWith(`${project.root}/`) === true && editor.buffers[retained]?.missing === true && !files.some((file) => file.path === retained)) {
    const draftArtifact: VideoArtifactSummary = { path: retained, version: editor.buffers[retained]?.version ?? "", label: "保留的本地草稿", kind: "script" };
    creative.push(draftArtifact);
    files.push(draftArtifact);
  }
  const selected = files.find((file) => file.path === editor.selected) ?? files[0];
  const path = selected?.path;
  useEffect(() => { if (path !== undefined && path !== editor.selected) editor.onSelect(path); }, [path, editor.selected, editor.onSelect]);
  const buffer = path === undefined ? undefined : editor.buffers[path];
  const readError = (path === undefined ? undefined : editor.errors[path])
    ?? (fileReadError !== null && fileReadError !== undefined && fileReadError !== "" ? fileReadError : undefined);
  const retryRead = onRetryRead ?? editor.onRetry;
  const dirty = buffer !== undefined && buffer.content !== buffer.saved;
  const source = editor.mode === "source";
  const narration = path?.endsWith("/narration.json") === true;
  const rows = buffer === undefined || !narration ? [] : narrationRows(buffer.content);
  const title = selected === undefined ? "创作文稿" : videoDocumentTitle(selected);
  const structured = buffer === undefined || narration ? [] : readableJson(buffer.content);
  const isCodeArtifact = path !== undefined && (path.endsWith(".srt") || path.endsWith(".ass") || path.endsWith(".json"));
  const navButton = (file: VideoArtifactSummary) => <button
    type="button"
    key={file.path}
    title={file.path}
    aria-current={file.path === path ? "page" : undefined}
    onClick={() => { editor.onSelect(file.path); }}
  >
    <span>{videoDocumentTitle(file)}</span>
    {editor.buffers[file.path] !== undefined && editor.buffers[file.path]?.content !== editor.buffers[file.path]?.saved && <i title="尚未保存" />}
  </button>;
  return <div className="oh-video-documents oh-game-documents">
    <nav aria-label="视频创作文稿">
      {creative.map(navButton)}
      {records.length > 0 && <details open={records.some((file) => file.path === path)}>
        <summary>更多制作记录</summary>
        {records.map(navButton)}
      </details>}
    </nav>
    <label className="oh-game-doc-picker">创作文稿<select aria-label="选择视频创作文稿" value={path ?? ""} onChange={(event) => { editor.onSelect(event.target.value); }}>
      {creative.map((file) => <option key={file.path} value={file.path}>{videoDocumentTitle(file)}</option>)}
      {records.length > 0 && <optgroup label="更多制作记录">{records.map((file) => <option key={file.path} value={file.path}>{videoDocumentTitle(file)}</option>)}</optgroup>}
    </select></label>
    <section className="oh-game-document-body">
      <header>
        <div><h2>{title}</h2>{dirty && <span className="oh-game-draft-label">改稿草稿 · 尚未保存</span>}</div>
        <div>
          {buffer !== undefined && buffer.missing !== true && <>
            <button type="button" onClick={() => { editor.onMode(source ? "preview" : "source"); }}>{source ? "阅读文稿" : narration && rows.length > 0 ? "编辑解说" : "编辑原文"}</button>
            {dirty && <button type="button" disabled={buffer.saving === true} onClick={() => { if (path !== undefined) void editor.onSave(path); }}>{buffer.saving === true ? "正在保存…" : "保存文稿"}</button>}
          </>}
          <button type="button" onClick={() => { onChat(`我想继续讨论《${project.title}》的「${title}」。${path === undefined ? "" : `文稿：${path}。`}请先讨论表达与修改思路。`); }}>Chat</button>
        </div>
      </header>
      {path === undefined ? <div className="oh-game-design-empty"><strong>先想清楚，怎么讲</strong><p>一起讨论观众最想知道什么、哪些画面和原声值得留下。已有文稿会出现在这里。</p><button type="button" onClick={() => { onChat(`我想讨论《${project.title}》的解说方向，先明确故事主线和想保留的原声。`); }}>聊聊解说方向</button></div>
        : buffer === undefined ? <div className="oh-game-design-empty" role={readError === undefined ? "status" : "alert"}><p>{readError ?? "正在读取文稿…"}</p>{readError !== undefined && <button type="button" onClick={retryRead}>重新读取</button>}</div>
          : <>
            {buffer.error !== undefined && <div className="oh-story-error" role="alert">{buffer.error}</div>}
            {buffer.conflict !== undefined && <div className="oh-story-conflict" role="alert">
              <p>{buffer.conflict.message}</p>
              {buffer.conflict.theirs !== undefined && <>
                <button type="button" onClick={() => { editor.onConflict(false); }}>载入磁盘版本</button>
                <button type="button" onClick={() => { editor.onConflict(true); }}>保留本地草稿</button>
              </>}
            </div>}
            {buffer.missing === true ? <div className="oh-game-design-empty"><p>文稿已移除，你的草稿仍保留在当前会话。</p><textarea aria-label={`${path} 本地草稿`} value={buffer.content} readOnly /><button type="button" onClick={() => { editor.onDiscard(path); }}>放弃本地草稿</button></div>
              : narration && rows.length > 0 ? <div className="oh-video-script-document">{rows.map((row) => <section key={row.index}><header><strong>第 {row.index + 1} 段</strong><span>{project.narrative?.authoredClock === "output" ? "输出时间" : project.narrative?.authoredClock === "source" ? "原片时间" : "未确认时间"} {videoRange(row)}</span></header>{source ? <textarea aria-label={`第 ${String(row.index + 1)} 段解说`} value={row.narration} onChange={(event) => { const updated = editVideoNarration(buffer.content, row.index, event.target.value); if (updated !== undefined) editor.onEdit(path, updated); }} /> : <p>{row.narration}</p>}</section>)}</div>
                : source ? <textarea ref={editor.textareaRef} aria-label={path} value={buffer.content} onChange={(event) => { editor.onEdit(path, event.target.value); }} onBlur={editor.onRememberPosition} onSelect={editor.onRememberPosition} onScroll={editor.onRememberPosition} />
                  : path.endsWith(".md") ? <MarkdownPreview content={buffer.content} label={path} />
                    : structured.length > 0 ? <div className="oh-video-readable-plan">{structured.map((item, index) => <section key={index}><h3>{item.label}</h3><p>{item.text}</p></section>)}</div>
                      : isCodeArtifact && buffer.content.trim() !== "" ? <pre className="oh-game-source" aria-label={`${path} 源码`}>{buffer.content}</pre>
                        : <div className="oh-game-design-empty"><p>这份文稿尚没有可整理的创作段落，可以查看原文或带到 Chat 讨论。</p><button type="button" onClick={() => { editor.onMode("source"); }}>查看原文</button></div>}
            {(source || dirty) && <p className="oh-video-document-note">文稿修改后需要继续制作，已有配音与成片保留当前版本。</p>}
            <details className="oh-game-document-source"><summary>文稿来源与原文</summary><code>{path}</code><pre>{buffer.content}</pre></details>
          </>}
    </section>
  </div>;
}
