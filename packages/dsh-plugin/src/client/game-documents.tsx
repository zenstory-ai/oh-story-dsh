import type { RefObject } from "react";
import { MarkdownPreview } from "./markdown-preview.js";
import type { GameDocumentBuffer, GameProject, GameWorkspaceFile } from "./game-workspace-types.js";

const DOCUMENT_NAMES: Readonly<Record<string, string>> = {
  "PRODUCT_BRIEF.md": "我们想做的游戏",
  "analysis/SOURCE_BIBLE.md": "原著与故事依据",
  "concepts/CONCEPT.md": "玩家为什么想继续",
  "design/GAME_DESIGN.md": "选择与玩法",
  "design/ART_DIRECTION.md": "画面与氛围",
  "build/BUILD_BRIEF.md": "这一版想做什么"
};

export interface GameDocumentEditor {
  readonly selected: string | undefined;
  readonly buffers: Readonly<Record<string, GameDocumentBuffer>>;
  readonly mode: "preview" | "source" | "production";
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
  readonly errors: Readonly<Record<string, string>>;
  readonly onSelect: (path: string) => void;
  readonly onEdit: (path: string, content: string) => void;
  readonly onSave: (path: string) => Promise<void>;
  readonly onMode: (mode: "preview" | "source") => void;
  readonly onConflict: (keepLocal: boolean) => void;
  readonly onDiscard: (path: string) => void;
  readonly onRememberPosition: () => void;
  readonly onRetry: () => void;
}

export function GameDocuments({ project, files, editor, onChat }: {
  readonly project: GameProject;
  readonly files: readonly GameWorkspaceFile[];
  readonly editor: GameDocumentEditor;
  readonly onChat: (prompt: string) => void;
}) {
  if (project.source === "example") return <div className="oh-game-design-empty"><strong>内置完整示例</strong><p>可以直接试玩这个示例。它的原著、创作设定与设计文稿未随插件分发；你的项目会在这里显示自己的文稿。</p><button type="button" onClick={() => { onChat("我想参考这个示例，讨论自己的游戏故事和玩法。请先和我讨论想法。"); }}>讨论我的游戏想法</button></div>;
  const available = files.filter((file) => file.kind === "text" && file.path.startsWith(`${project.root}/`));
  const creative = Object.entries(DOCUMENT_NAMES).flatMap(([relative, title]) => {
    const file = available.find((item) => item.path === `${project.root}/${relative}`);
    return file === undefined ? [] : [{ ...file, title }];
  });
  const other = available.filter((file) => !creative.some((item) => item.path === file.path));
  const selected = editor.selected?.startsWith(`${project.root}/`) === true && (available.some((file) => file.path === editor.selected) || editor.buffers[editor.selected] !== undefined)
    ? editor.selected : creative[0]?.path ?? available[0]?.path;
  const buffer = selected === undefined ? undefined : editor.buffers[selected];
  const title = creative.find((file) => file.path === selected)?.title ?? selected?.split("/").at(-1) ?? "创作文稿";
  const dirty = buffer !== undefined && buffer.content !== buffer.saved;
  const source = editor.mode === "source";
  const navButton = (file: GameWorkspaceFile, label: string) => <button type="button" key={file.path} aria-label={file.path} title={file.path} aria-current={file.path === selected ? "page" : undefined} onClick={() => { editor.onSelect(file.path); }}><span>{label}</span>{editor.buffers[file.path] !== undefined && editor.buffers[file.path]?.content !== editor.buffers[file.path]?.saved && <i title="尚未保存" />}</button>;
  return <div className="oh-game-documents">
    <nav aria-label="游戏创作文稿">{creative.map((file) => navButton(file, file.title))}{other.length > 0 && <details open={other.some((file) => file.path === selected)}><summary>更多项目文件</summary>{other.map((file) => navButton(file, file.path.slice(project.root.length + 1)))}</details>}</nav>
    <label className="oh-game-doc-picker">创作文稿<select aria-label="选择游戏创作文稿" value={selected ?? ""} onChange={(event) => { editor.onSelect(event.target.value); }}>{available.map((file) => <option key={file.path} value={file.path}>{creative.find((item) => item.path === file.path)?.title ?? file.path.slice(project.root.length + 1)}</option>)}</select></label>
    <section className="oh-game-document-body">
      <header><div><h2>{title}</h2>{dirty && <span className="oh-game-draft-label">本地草稿 · 尚未保存</span>}</div><div>{buffer !== undefined && buffer.missing !== true && <><button type="button" onClick={() => { editor.onMode(source ? "preview" : "source"); }}>{source ? "阅读文稿" : "编辑文稿"}</button>{dirty && <button type="button" disabled={buffer.saving === true} onClick={() => { if (selected !== undefined) void editor.onSave(selected); }}>{buffer.saving === true ? "正在保存…" : "保存文稿"}</button>}</>}<button type="button" aria-label="讨论这份文稿" onClick={() => { onChat(`我想讨论「${title}」这份创作设定。${selected === undefined ? "" : `文稿：${selected}`} 请先和我讨论思路。`); }}>Chat</button></div></header>
      {selected === undefined ? <div className="oh-game-design-empty"><strong>把想法留在文稿里</strong><p>先和 AI 讨论故事、玩法和美术方向，已有的创作内容会出现在这里。</p><button type="button" onClick={() => { onChat("我想先梳理这个游戏的故事、核心玩法和美术方向，请和我讨论思路。"); }}>和 AI 讨论创作设定</button></div>
        : buffer === undefined ? <div className="oh-game-design-empty" role={editor.errors[selected] === undefined ? "status" : "alert"}>{editor.errors[selected] ?? "正在读取创作文稿…"}{editor.errors[selected] !== undefined && <button type="button" onClick={editor.onRetry}>重新读取</button>}</div>
          : <>
            {buffer.error !== undefined && <div className="oh-story-error" role="alert">{buffer.error}</div>}
            {buffer.conflict !== undefined && <div className="oh-story-conflict" role="alert"><p>{buffer.conflict.message}</p>{buffer.conflict.theirs !== undefined && <><button type="button" onClick={() => { editor.onConflict(true); }}>保留我的草稿</button><button type="button" onClick={() => { editor.onConflict(false); }}>使用磁盘版本</button></>}</div>}
            {buffer.missing === true ? <div className="oh-game-design-empty"><p>文稿已从项目移除，你的草稿仍保留在当前会话中。</p><textarea aria-label={`${selected} 本地草稿`} value={buffer.content} readOnly /><button type="button" onClick={() => { editor.onDiscard(selected); }}>放弃本地草稿</button></div>
              : source ? <textarea ref={editor.textareaRef} aria-label={selected} value={buffer.content} spellCheck={selected.endsWith(".md")} onChange={(event) => { editor.onEdit(selected, event.target.value); }} onBlur={editor.onRememberPosition} onScroll={editor.onRememberPosition} onSelect={editor.onRememberPosition} />
                : selected.toLocaleLowerCase().endsWith(".md") ? <MarkdownPreview content={buffer.content} label={selected} /> : <pre className="oh-game-source" aria-label={`${selected} 源码`}>{buffer.content}</pre>}
            <details className="oh-game-document-source"><summary>文稿来源</summary><code>{selected}</code></details>
          </>}
    </section>
  </div>;
}
