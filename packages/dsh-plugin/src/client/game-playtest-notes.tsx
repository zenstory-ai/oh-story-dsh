import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  appendGamePlaytestNote,
  MAX_PLAYTEST_NOTE_BYTES,
  parseGamePlaytestNotes,
  type GamePlaytestNote,
  type GamePlaytestNotesFile
} from "../game-playtest-notes.js";
import type { GameProject } from "./game-workspace-types.js";

export interface GamePlaytestNotesProps {
  readonly sessionId: string;
  readonly project: GameProject;
  readonly previewVersion: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onContinueInChat: (prompt: string) => void;
  readonly onSaved?: (() => void) | undefined;
}

interface Draft {
  readonly text: string;
  readonly context: string;
  readonly previewVersion?: string | undefined;
}

interface RequestState {
  readonly file?: GamePlaytestNotesFile | undefined;
  readonly loading?: boolean | undefined;
  readonly saving?: boolean | undefined;
  readonly error?: string | undefined;
  readonly conflict?: boolean | undefined;
}

class NotesRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const EMPTY_DRAFT: Draft = { text: "", context: "" };
// Page-lifetime scratch state only. The durable source of truth remains PLAYTEST_NOTES.md;
// this map merely prevents an unsaved textarea from disappearing on project switches.
const pageDrafts = new Map<string, Draft>();

function sameDraft(left: Draft, right: Draft): boolean {
  return left.text === right.text
    && left.context === right.context
    && left.previewVersion === right.previewVersion;
}

function notesEndpoint(sessionId: string, project: string): string {
  const url = new URL("/oh-story/game-notes", globalThis.location.origin);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("project", project);
  return url.toString();
}

async function responseJson(response: Response): Promise<GamePlaytestNotesFile> {
  const value = await response.json() as GamePlaytestNotesFile & { readonly error?: string };
  if (!response.ok) throw new NotesRequestError(response.status, value.error ?? `HTTP ${String(response.status)}`);
  return value;
}

function noteId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function chatPrompt(project: GameProject, previewVersion: string, draft: Draft): string {
  const context = draft.context.trim() === "" ? "未指定（这是手动试玩记录，不要推断具体场景）" : draft.context.trim();
  return [
    `请继续处理游戏项目「${project.title}」的试玩反馈。`,
    `我实际查看的预览版本：${previewVersion}`,
    `我手动记录的位置：${context}`,
    "反馈：",
    draft.text.trim()
  ].join("\n");
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

export function GamePlaytestNotes(props: GamePlaytestNotesProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({});
  const [requests, setRequests] = useState<Readonly<Record<string, RequestState>>>({});
  const projectKey = props.project.root;
  const draftKey = `${props.sessionId}\n${projectKey}`;
  const draft = drafts[projectKey] ?? pageDrafts.get(draftKey) ?? EMPTY_DRAFT;
  const request = requests[projectKey] ?? {};
  const notes = useMemo(
    () => request.file === undefined ? [] : [...parseGamePlaytestNotes(request.file.content)].reverse(),
    [request.file]
  );

  const patchDraft = (patch: Partial<Draft>) => {
    const existing = pageDrafts.get(draftKey) ?? draft;
    const next = { ...existing, previewVersion: existing.previewVersion ?? props.previewVersion, ...patch };
    pageDrafts.set(draftKey, next);
    setDrafts((current) => ({ ...current, [projectKey]: next }));
  };
  const patchRequest = (patch: Partial<RequestState>) => {
    setRequests((current) => ({ ...current, [projectKey]: { ...(current[projectKey] ?? {}), ...patch } }));
  };

  const load = () => {
    if (props.project.source === "example") return;
    patchRequest({ loading: true, error: undefined });
    void fetch(notesEndpoint(props.sessionId, props.project.root))
      .then(responseJson)
      .then((file) => { patchRequest({ file, loading: false, conflict: false, error: undefined }); })
      .catch((reason: unknown) => {
        patchRequest({ loading: false, error: reason instanceof Error ? reason.message : String(reason) });
      });
  };

  useEffect(() => {
    const node = dialog.current;
    if (node === null) return;
    if (props.open) {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!node.open) node.showModal();
      queueMicrotask(() => { textArea.current?.focus(); });
    } else {
      if (node.open) node.close();
      restoreFocus.current?.focus();
      restoreFocus.current = null;
    }
  }, [props.open]);

  useEffect(() => {
    if (props.open && props.project.source === "workspace" && request.file === undefined && request.loading !== true) load();
    // Loading is scoped to the selected project; drafts remain keyed by project across switches.
  }, [props.open, projectKey, props.project.source]);

  const save = async () => {
    const current = requests[projectKey]?.file;
    if (current === undefined || request.saving === true || draft.text.trim() === "") return;
    const submittedDraft = draft;
    const note: GamePlaytestNote = {
      id: noteId(),
      text: draft.text,
      previewVersion: draft.previewVersion ?? props.previewVersion,
      ...(draft.context.trim() === "" ? {} : { context: draft.context.trim() }),
      createdAt: new Date().toISOString()
    };
    let content: string;
    try { content = appendGamePlaytestNote(current.content, note); }
    catch (reason) {
      patchRequest({ error: reason instanceof Error ? reason.message : String(reason) });
      return;
    }
    patchRequest({ saving: true, error: undefined });
    try {
      const file = await responseJson(await fetch(notesEndpoint(props.sessionId, props.project.root), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, expectedVersion: current.expectedVersion })
      }));
      patchRequest({ file, saving: false, conflict: false, error: undefined });
      const latestDraft = pageDrafts.get(draftKey) ?? submittedDraft;
      if (sameDraft(latestDraft, submittedDraft)) {
        pageDrafts.delete(draftKey);
        setDrafts((all) => ({ ...all, [projectKey]: EMPTY_DRAFT }));
      }
      props.onSaved?.();
    } catch (reason) {
      if (reason instanceof NotesRequestError && reason.status === 412) {
        patchRequest({ saving: false, conflict: true, error: "项目笔记已被其他操作更新。草稿仍在，请重新读取后再保存。" });
      } else {
        patchRequest({ saving: false, error: reason instanceof Error ? reason.message : String(reason) });
      }
    }
  };

  const continueInChat = () => {
    if (draft.text.trim() === "") return;
    const prompt = chatPrompt(props.project, draft.previewVersion ?? props.previewVersion, draft);
    dialog.current?.close();
    props.onClose();
    queueMicrotask(() => { props.onContinueInChat(prompt); });
  };

  const tooLarge = new TextEncoder().encode(draft.text).byteLength > MAX_PLAYTEST_NOTE_BYTES;
  const example = props.project.source === "example";

  return <dialog
    ref={dialog}
    className="oh-game-notes"
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); props.onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}
  >
      <section className="oh-game-notes__drawer">
        <header className="oh-game-notes__header">
          <div><span>{props.project.title}</span><h2 id={titleId}>试玩笔记</h2></div>
          <button type="button" className="oh-game-notes__close" onClick={props.onClose} aria-label="关闭试玩笔记">×</button>
        </header>

        <div className="oh-game-notes__provenance">
          <strong>关联当前试玩版本</strong>
          {draft.previewVersion !== undefined && draft.previewVersion !== props.previewVersion
            ? <small>这条草稿保留开始记录时的版本。</small>
            : <small>开始填写后会锁定当前实际显示的版本。</small>}
          <details><summary>版本详情</summary><code>{draft.previewVersion ?? props.previewVersion}</code></details>
        </div>

        {example && <div className="oh-game-notes__notice">
          示例游戏不属于当前项目，不能写入工作区。你仍可记录反馈并带到 Chat 继续讨论。
        </div>}
        {request.error !== undefined && <div className={`oh-game-notes__notice${request.conflict === true ? " is-conflict" : ""}`} role="status">
          <span>{request.error}</span>
          {(request.conflict === true || request.file === undefined) && <button type="button" onClick={load}>重新读取</button>}
        </div>}

        <div className="oh-game-notes__composer">
          <label htmlFor={`${titleId}-context`}>位置 <span>手动填写，可留空</span></label>
          <input
            id={`${titleId}-context`}
            value={draft.context}
            maxLength={256}
            placeholder="例如：序章选择后、第一轮结算"
            onChange={(event) => { patchDraft({ context: event.currentTarget.value }); }}
          />
          <label htmlFor={`${titleId}-text`}>你实际看到的问题</label>
          <textarea
            ref={textArea}
            id={`${titleId}-text`}
            aria-label="填写试玩笔记"
            value={draft.text}
            rows={6}
            placeholder="记录卡住、误解、节奏或操作反馈……"
            onChange={(event) => { patchDraft({ text: event.currentTarget.value }); }}
          />
          {tooLarge && <small className="oh-game-notes__error">单条反馈不能超过 32 KiB。</small>}
          <div className="oh-game-notes__actions">
            <button type="button" className="is-secondary" disabled={draft.text.trim() === ""} onClick={continueInChat}>带到 Chat</button>
            {!example && <button
              type="button"
              disabled={draft.text.trim() === "" || tooLarge || request.loading === true || request.saving === true || request.file === undefined || request.conflict === true}
              onClick={() => { void save(); }}
            >{request.saving === true ? "保存中…" : "保存笔记"}</button>}
          </div>
        </div>

        {!example && <div className="oh-game-notes__history" aria-busy={request.loading === true}>
          <div className="oh-game-notes__history-title">
            <h3>项目记录</h3>
            <button type="button" onClick={load} disabled={request.loading === true}>{request.loading === true ? "读取中…" : "刷新"}</button>
          </div>
          {request.loading !== true && notes.length === 0 && <p className="oh-game-notes__empty">还没有试玩笔记。已有的普通 Markdown 内容不会被改写。</p>}
          {notes.map((note) => <article key={note.id} className="oh-game-notes__note">
            <div><strong>{note.context ?? "未标注位置"}</strong><time dateTime={note.createdAt}>{displayDate(note.createdAt)}</time></div>
            <p>{note.text}</p>
            <footer>
              <span>关联记录时的试玩版本</span>
              <details><summary>版本详情</summary><code>{note.previewVersion}</code></details>
            </footer>
          </article>)}
        </div>}
      </section>
  </dialog>;
}
