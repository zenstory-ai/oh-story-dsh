import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { CreativeCanvas } from "./creative-canvas.js";
import { gameCanvasEdges, gameCanvasNodes, type GameCanvasNode } from "./game-canvas-model.js";
import type { GameCanvasState, GameProject, GameWorkspaceFile } from "./game-workspace-types.js";

export interface GameCanvasProps {
  readonly project: GameProject;
  readonly files: readonly GameWorkspaceFile[];
  readonly documents: Readonly<Record<string, string>>;
  readonly state: GameCanvasState;
  readonly onChange: (state: GameCanvasState) => void;
  readonly onOpenDocument: (path: string) => void;
  readonly onContinueInChat: (title: string, path?: string) => void;
  readonly onPlay: () => void;
}

export function GameCanvas(props: GameCanvasProps) {
  const nodes = useMemo(() => gameCanvasNodes(props.project, props.files, props.documents), [props.project, props.files, props.documents]);
  const edges = useMemo(() => gameCanvasEdges(nodes), [nodes]);
  const open = (node: GameCanvasNode) => {
    if (node.path !== undefined) props.onOpenDocument(node.path);
    else if (node.kind === "preview") props.onPlay();
  };
  return <CreativeCanvas
    nodes={nodes}
    edges={edges}
    state={props.state}
    onChange={props.onChange}
    ariaLabel="游戏创作无限画布"
    helpText="拖动空白处平移 · 滚轮缩放 · 双击打开文稿"
    empty={{
      title: "创作内容会出现在这里",
      description: "和 Chat 一起完成游戏设定后，文稿会自然铺到画布上。",
      actionLabel: "开始构思",
      onAction: () => { props.onContinueInChat("开始构思游戏"); }
    }}
    onOpen={open}
    onContinueInChat={(node) => { props.onContinueInChat(node.title, node.path); }}
    renderNodeActions={(node) => <>
      {node.path !== undefined && <button type="button" data-document-path={node.path} aria-label={`打开文稿：${node.title}`} onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); if (node.path !== undefined) props.onOpenDocument(node.path); }}>打开文稿</button>}
      {node.kind === "preview" && <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); props.onPlay(); }}>进入试玩</button>}
      <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); props.onContinueInChat(node.title, node.path); }}>在 Chat 中继续</button>
    </>}
    renderContextActions={(node) => node.kind === "preview"
      ? <button type="button" onClick={props.onPlay}>进入试玩</button>
      : node.path !== undefined && <button type="button" data-document-path={node.path} aria-label={`打开文稿：${node.title}`} onClick={() => { if (node.path !== undefined) props.onOpenDocument(node.path); }}>打开文稿</button>}
  />;
}

function stopPointer(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}
