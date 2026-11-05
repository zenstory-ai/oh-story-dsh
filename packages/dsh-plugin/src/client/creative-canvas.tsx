import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  DEFAULT_CANVAS_VIEWPORT,
  centerOnRect,
  fitRects,
  rectVisible,
  wheelZoomFactor,
  zoomAt,
  type CanvasRect,
  type CanvasSize,
  type CanvasViewport
} from "./canvas-viewport.js";
import type { CanvasPoint } from "./production-runtime.js";

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

const CLICK_SLOP = 4;
const BUTTON_ZOOM_STEP = 1.2;
const WHEEL_COMMIT_DELAY = 160;

/** Shared interaction engine for creator-facing relationship canvases. */
export function CreativeCanvas<Node extends CreativeCanvasNode>(props: CreativeCanvasProps<Node>) {
  const helpId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [liveViewport, setLiveViewport] = useState<CanvasViewport>();
  const [liveNode, setLiveNode] = useState<{ readonly id: string; readonly point: CanvasPoint }>();
  const [panning, setPanning] = useState(false);
  const wheelCommit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedHere = useRef<string>(undefined);
  const followed = useRef<string>(undefined);
  const followedSize = useRef<CanvasSize>(undefined);

  const positions: Record<string, CanvasPoint> = Object.fromEntries(props.nodes.map((node) => [node.id, props.state.positions[node.id] ?? node.initial]));
  if (liveNode !== undefined) positions[liveNode.id] = liveNode.point;
  const rects = nodeRects(props.nodes, positions);
  const fitted = size.width > 0 ? fitRects(rects, size) : DEFAULT_CANVAS_VIEWPORT;
  const committedViewport = props.state.viewport ?? fitted;
  const viewport = liveViewport ?? committedViewport;
  const latest = useRef({ viewport, props, size });
  latest.current = { viewport, props, size };

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (element === null) return;
    const measure = () => { setSize({ width: element.clientWidth, height: element.clientHeight }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const next = zoomAt(latest.current.viewport, wheelZoomFactor(event.deltaY, event.deltaMode), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      setLiveViewport(next);
      clearTimeout(wheelCommit.current);
      wheelCommit.current = setTimeout(() => {
        wheelCommit.current = undefined;
        const current = latest.current.props;
        current.onChange({ ...current.state, viewport: next });
        setLiveViewport(undefined);
      }, WHEEL_COMMIT_DELAY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      clearTimeout(wheelCommit.current);
    };
  }, []);

  const measured = size.width > 0 && size.height > 0;
  useEffect(() => {
    const current = latest.current;
    if (measured && current.props.state.viewport === undefined) current.props.onChange({ ...current.props.state, viewport: fitRects(nodeRects(current.props.nodes, current.props.state.positions), current.size) });
  }, [measured]);

  useEffect(() => {
    const current = latest.current;
    const id = current.props.state.selectedId;
    const resized = followedSize.current?.width !== current.size.width || followedSize.current.height !== current.size.height;
    if (!measured || (id === followed.current && !resized)) return;
    followed.current = id;
    followedSize.current = current.size;
    if (id === undefined) return;
    if (id === selectedHere.current) {
      selectedHere.current = undefined;
      if (!resized) return;
    }
    const node = current.props.nodes.find((candidate) => candidate.id === id);
    if (node === undefined) return;
    const rect = { ...(current.props.state.positions[id] ?? node.initial), width: node.width, height: node.height };
    if (!rectVisible(current.viewport, rect, current.size)) current.props.onChange({ ...current.props.state, viewport: centerOnRect(current.viewport, rect, current.size) });
  }, [measured, props.state.selectedId, size.width, size.height]);

  const commitViewport = (next: CanvasViewport) => {
    clearTimeout(wheelCommit.current);
    wheelCommit.current = undefined;
    setLiveViewport(undefined);
    props.onChange({ ...props.state, viewport: next });
  };

  const flushWheel = () => {
    if (wheelCommit.current === undefined) return;
    clearTimeout(wheelCommit.current);
    wheelCommit.current = undefined;
    props.onChange({ ...props.state, viewport });
    setLiveViewport(undefined);
  };

  const zoomAtCenter = (factor: number) => {
    commitViewport(zoomAt(viewport, factor, { x: size.width / 2, y: size.height / 2 }));
  };

  const select = (id: string | undefined) => {
    props.onChange({ ...props.state, selectedId: id });
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("article, button") !== null) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    flushWheel();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    element.focus({ preventScroll: true });
    const origin = viewport;
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    let next = origin;
    setPanning(true);
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      moved = true;
      next = { ...origin, x: origin.x + dx, y: origin.y + dy };
      setLiveViewport(next);
    };
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      setPanning(false);
      if (moved) commitViewport(next);
      else select(undefined);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button") !== null)) return;
    event.stopPropagation();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const origin = positions[id] ?? { x: 0, y: 0 };
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    let next = origin;
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      moved = true;
      next = { x: origin.x + dx / viewport.zoom, y: origin.y + dy / viewport.zoom };
      setLiveNode({ id, point: next });
    };
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      setLiveNode(undefined);
      if (moved) props.onChange({ ...props.state, positions: { ...props.state.positions, [id]: next } });
      else {
        if (id !== props.state.selectedId) selectedHere.current = id;
        select(id);
      }
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  const onNodeKeyDown = (event: ReactKeyboardEvent<HTMLElement>, node: Node) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onOpen(node);
      return;
    }
    const delta = arrowDelta(event.key, event.shiftKey ? 40 : 10);
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = positions[node.id] ?? node.initial;
    const point = { x: origin.x + delta.x, y: origin.y + delta.y };
    props.onChange({ ...props.state, positions: { ...props.state.positions, [node.id]: point } });
    const rect = { ...point, width: node.width, height: node.height };
    if (measured && !rectVisible(viewport, rect, size)) commitViewport(centerOnRect(viewport, rect, size));
  };

  const onViewportKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const delta = arrowDelta(event.key, event.shiftKey ? 240 : 60);
    if (delta !== undefined) {
      event.preventDefault();
      commitViewport({ ...viewport, x: viewport.x - delta.x, y: viewport.y - delta.y });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAtCenter(BUTTON_ZOOM_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomAtCenter(1 / BUTTON_ZOOM_STEP);
    } else if (event.key === "0") {
      event.preventDefault();
      commitViewport(fitRects(rects, size));
    } else if (event.key === "Escape") {
      event.preventDefault();
      select(undefined);
    }
  };

  const selectedNode = props.nodes.find((node) => node.id === props.state.selectedId);
  const gridSize = 20 * viewport.zoom;

  return <section className="oh-game-canvas-shell" aria-label={props.ariaLabel}>
    <div className="oh-game-canvas-toolbar">
      <div className="oh-game-canvas-help" id={helpId}>{props.helpText}</div>
      <div className="oh-game-canvas-controls">
        <button type="button" aria-label="缩小画布" onClick={() => { zoomAtCenter(1 / BUTTON_ZOOM_STEP); }}>−</button>
        <span aria-live="polite">{Math.round(viewport.zoom * 100)}%</span>
        <button type="button" aria-label="放大画布" onClick={() => { zoomAtCenter(BUTTON_ZOOM_STEP); }}>＋</button>
        <button type="button" onClick={() => { commitViewport(fitRects(rects, size)); }}>适应</button>
        <button type="button" onClick={() => {
          const resetPositions: Record<string, CanvasPoint> = {};
          props.onChange({ positions: resetPositions, selectedId: props.state.selectedId, viewport: fitRects(nodeRects(props.nodes, resetPositions), size) });
        }}>复位</button>
      </div>
    </div>
    <div
      ref={viewportRef}
      className="oh-game-canvas-viewport"
      role="application"
      aria-roledescription="无限画布"
      aria-label={`${props.ariaLabel}视野`}
      aria-describedby={helpId}
      tabIndex={0}
      data-panning={panning || undefined}
      style={{ backgroundPosition: `${String(viewport.x)}px ${String(viewport.y)}px`, backgroundSize: `${String(gridSize)}px ${String(gridSize)}px` }}
      onPointerDown={startPan}
      onKeyDown={onViewportKeyDown}
    >
      {props.nodes.length === 0 && <div className="oh-game-canvas-empty"><strong>{props.empty.title}</strong><span>{props.empty.description}</span><button type="button" onClick={props.empty.onAction}>{props.empty.actionLabel}</button></div>}
      <div className="oh-game-canvas-stage" style={{ transform: `translate(${String(viewport.x)}px, ${String(viewport.y)}px) scale(${String(viewport.zoom)})` }}>
        <svg aria-hidden="true">{props.edges.map((edge) => {
          const from = props.nodes.find((node) => node.id === edge.from);
          const to = props.nodes.find((node) => node.id === edge.to);
          const a = from === undefined ? undefined : positions[from.id];
          const b = to === undefined ? undefined : positions[to.id];
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
          data-dragging={liveNode?.id === node.id || undefined}
          role="button"
          tabIndex={0}
          aria-pressed={node.id === props.state.selectedId}
          aria-label={`${node.eyebrow}：${node.title}`}
          style={{ left: positions[node.id]?.x ?? node.initial.x, top: positions[node.id]?.y ?? node.initial.y, width: node.width, height: node.height }}
          onPointerDown={(event) => { startDrag(event, node.id); }}
          onDoubleClick={() => { props.onOpen(node); }}
          onKeyDown={(event) => { onNodeKeyDown(event, node); }}
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

function nodeRects(nodes: readonly CreativeCanvasNode[], positions: Readonly<Record<string, CanvasPoint>>): CanvasRect[] {
  return nodes.map((node) => ({ ...(positions[node.id] ?? node.initial), width: node.width, height: node.height }));
}

function arrowDelta(key: string, step: number): CanvasPoint | undefined {
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  return undefined;
}
