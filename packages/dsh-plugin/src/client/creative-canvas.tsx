import { useId, type ReactNode } from "react";
import type { CanvasViewport } from "./canvas-viewport.js";
import type { CanvasPoint } from "./production-runtime.js";
import { useInfiniteCanvas } from "./use-infinite-canvas.js";

export interface CreativeCanvasNode {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly excerpt?: string | undefined;
  readonly path?: string | undefined;
  readonly initial: CanvasPoint;
  readonly width: number;
  readonly height: number;
}

export interface CreativeCanvasEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

export interface CreativeCanvasState {
  readonly positions: Readonly<Record<string, CanvasPoint>>;
  readonly viewport?: CanvasViewport | undefined;
  readonly selectedId?: string | undefined;
}

export interface CreativeCanvasEmptyState {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
}

export interface CreativeCanvasProps<Node extends CreativeCanvasNode = CreativeCanvasNode> {
  readonly nodes: readonly Node[];
  readonly edges: readonly CreativeCanvasEdge[];
  readonly state: CreativeCanvasState;
  readonly onChange: (state: CreativeCanvasState) => void;
  readonly onOpen: (node: Node) => void;
  readonly onContinueInChat: (node: Node) => void;
  readonly renderNodeMedia?: ((node: Node) => ReactNode) | undefined;
  readonly renderNodeActions: (node: Node) => ReactNode;
  readonly renderContextActions: (node: Node) => ReactNode;
  readonly ariaLabel: string;
  readonly helpText: string;
  readonly empty: CreativeCanvasEmptyState;
}

/** Shared interaction engine for creator-facing relationship canvases. */
export function CreativeCanvas<Node extends CreativeCanvasNode>(props: CreativeCanvasProps<Node>) {
  const helpId = useId();
  const canvas = useInfiniteCanvas({
    nodes: props.nodes,
    positions: props.state.positions,
    viewport: props.state.viewport,
    selectedId: props.state.selectedId,
    clearSelectionOnEscape: true,
    onActivate: props.onOpen,
    onCommit: (patch) => {
      props.onChange({
        positions: patch.positions ?? props.state.positions,
        viewport: patch.viewport ?? props.state.viewport,
        selectedId: patch.selectedId === null ? undefined : (patch.selectedId ?? props.state.selectedId)
      });
    }
  });

  const selectedNode = props.nodes.find((node) => node.id === props.state.selectedId);
  const gridSize = 20 * canvas.viewport.zoom;

  return <section className="oh-game-canvas-shell" aria-label={props.ariaLabel}>
    <div className="oh-game-canvas-toolbar">
      <div className="oh-game-canvas-help" id={helpId}>{props.helpText}</div>
      <div className="oh-game-canvas-controls">
        <button type="button" aria-label="缩小画布" onClick={canvas.zoomOut}>−</button>
        <span aria-live="polite">{Math.round(canvas.viewport.zoom * 100)}%</span>
        <button type="button" aria-label="放大画布" onClick={canvas.zoomIn}>＋</button>
        <button type="button" onClick={canvas.fitAll}>适应</button>
        <button type="button" onClick={canvas.resetLayout}>复位</button>
      </div>
    </div>
    <div
      ref={canvas.viewportRef}
      className="oh-game-canvas-viewport"
      role="application"
      aria-roledescription="无限画布"
      aria-label={`${props.ariaLabel}视野`}
      aria-describedby={helpId}
      tabIndex={0}
      data-panning={canvas.panning || undefined}
      style={{ backgroundPosition: `${String(canvas.viewport.x)}px ${String(canvas.viewport.y)}px`, backgroundSize: `${String(gridSize)}px ${String(gridSize)}px` }}
      onPointerDown={canvas.startPan}
      onKeyDown={canvas.onViewportKeyDown}
    >
      {props.nodes.length === 0 && <div className="oh-game-canvas-empty"><strong>{props.empty.title}</strong><span>{props.empty.description}</span><button type="button" onClick={props.empty.onAction}>{props.empty.actionLabel}</button></div>}
      <div className="oh-game-canvas-stage" style={{ transform: `translate(${String(canvas.viewport.x)}px, ${String(canvas.viewport.y)}px) scale(${String(canvas.viewport.zoom)})` }}>
        <svg aria-hidden="true">{props.edges.map((edge) => {
          const from = props.nodes.find((node) => node.id === edge.from);
          const to = props.nodes.find((node) => node.id === edge.to);
          const a = from === undefined ? undefined : canvas.positions[from.id];
          const b = to === undefined ? undefined : canvas.positions[to.id];
          if (from === undefined || to === undefined || a === undefined || b === undefined) return null;
          const x1 = a.x + from.width;
          const y1 = a.y + from.height / 2;
          const y2 = b.y + to.height / 2;
          const bend = Math.max(64, Math.abs(b.x - x1) / 2);
          const active = edge.from === props.state.selectedId || edge.to === props.state.selectedId;
          return <g key={`${edge.from}:${edge.to}`}>
            <path className="oh-game-canvas-edge" data-active={active || undefined} d={`M ${String(x1)} ${String(y1)} C ${String(x1 + bend)} ${String(y1)}, ${String(b.x - bend)} ${String(y2)}, ${String(b.x)} ${String(y2)}`} />
            <text className="oh-game-canvas-edge-label" data-active={active || undefined} x={(x1 + b.x) / 2} y={(y1 + y2) / 2 - 8}>{edge.label}</text>
          </g>;
        })}</svg>
        {props.nodes.map((node) => <article
          key={node.id}
          className="oh-game-canvas-node"
          data-kind={node.kind}
          data-selected={node.id === props.state.selectedId || undefined}
          data-dragging={canvas.draggingId === node.id || undefined}
          role="button"
          tabIndex={0}
          aria-pressed={node.id === props.state.selectedId}
          aria-label={`${node.eyebrow}：${node.title}`}
          style={{ left: canvas.positions[node.id]?.x ?? node.initial.x, top: canvas.positions[node.id]?.y ?? node.initial.y, width: node.width, height: node.height }}
          onPointerDown={(event) => { canvas.startDrag(event, node.id); }}
          onDoubleClick={() => { props.onOpen(node); }}
          onKeyDown={(event) => { canvas.onNodeKeyDown(event, node); }}
        >
          <header><small>{node.eyebrow}</small><span aria-hidden="true">•••</span></header>
          {props.renderNodeMedia?.(node)}
          <div className="oh-game-canvas-node-copy"><strong>{node.title}</strong>{node.excerpt !== undefined && <p>{node.excerpt}</p>}</div>
          <footer>{props.renderNodeActions(node)}</footer>
        </article>)}
      </div>
    </div>
    {selectedNode !== undefined && <div className="oh-game-canvas-context" aria-live="polite"><span><small>已选中</small><strong>{selectedNode.title}</strong></span>{props.renderContextActions(selectedNode)}<button type="button" onClick={() => { props.onContinueInChat(selectedNode); }}>在 Chat 中继续</button></div>}
  </section>;
}
