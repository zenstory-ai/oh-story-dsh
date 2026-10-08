import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { DramaDocumentTarget, DramaEpisodeProduction } from "./drama-production.js";
import type { CanvasPoint } from "./production-runtime.js";
import {
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  DEFAULT_CANVAS_VIEWPORT,
  centerOn,
  fitNodes,
  nodeVisible,
  wheelZoomFactor,
  zoomAt,
  type CanvasSize,
  type CanvasViewport
} from "./canvas-viewport.js";

interface Props {
  readonly production: DramaEpisodeProduction;
  readonly selectedId: string | undefined;
  readonly canvas: Readonly<Record<string, CanvasPoint>>;
  /** Undefined until the creator pans or zooms this episode; the first view then frames the nodes. */
  readonly viewport: CanvasViewport | undefined;
  readonly onSelect: (id: string | undefined) => void;
  readonly onNavigate: (target: DramaDocumentTarget) => void;
  readonly onCanvasChange: (canvas: Record<string, CanvasPoint>) => void;
  readonly onViewportChange: (viewport: CanvasViewport) => void;
}

interface CanvasNode {
  readonly id: string;
  readonly label: string;
  readonly type: "asset" | "shot";
  readonly initial: CanvasPoint;
}

/** Pointer travel below this many pixels is a click, not a drag. */
const CLICK_SLOP = 4;
const BUTTON_ZOOM_STEP = 1.2;
/** Wheel bursts update locally and reach the Store once they settle. */
const WHEEL_COMMIT_DELAY = 160;

export function canvasNodes(production: DramaEpisodeProduction): CanvasNode[] {
  const assets = [...production.assets, ...production.visualAssets].map((asset, index): CanvasNode => ({ id: asset.id, label: asset.title, type: "asset", initial: { x: 80, y: 80 + index * 150 } }));
  const shots = production.shots.map((shot, index): CanvasNode => ({ id: shot.id, label: shot.title, type: "shot", initial: { x: 640, y: 80 + index * 180 } }));
  return [...assets, ...shots];
}

export function ProductionCanvas(props: Props) {
  const nodes = useMemo(() => canvasNodes(props.production), [props.production]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  // Drags, pans and wheel bursts render from local state and commit once, so a pointer move
  // re-renders the canvas rather than the whole workbench.
  const [liveViewport, setLiveViewport] = useState<CanvasViewport>();
  const [liveNode, setLiveNode] = useState<{ readonly id: string; readonly point: CanvasPoint }>();
  const [panning, setPanning] = useState(false);
  const wheelCommit = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** A selection made by clicking a node is already in view and must not move the canvas. */
  const selectedHere = useRef<string>(undefined);

  const positions: Record<string, CanvasPoint> = Object.fromEntries(nodes.map((node) => [node.id, props.canvas[node.id] ?? node.initial]));
  if (liveNode !== undefined) positions[liveNode.id] = liveNode.point;
  const committedViewport = props.viewport ?? (size.width > 0 ? fitNodes(Object.values(positions), size) : DEFAULT_CANVAS_VIEWPORT);
  const viewport = liveViewport ?? committedViewport;

  const latest = useRef({ viewport, committedViewport, props });
  latest.current = { viewport, committedViewport, props };

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (element === null) return;
    const measure = () => { setSize({ width: element.clientWidth, height: element.clientHeight }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);

  // React registers wheel listeners as passive, which cannot stop the panel from scrolling.
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
        latest.current.props.onViewportChange(next);
        setLiveViewport(undefined);
      }, WHEEL_COMMIT_DELAY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      clearTimeout(wheelCommit.current);
    };
  }, []);

  // The first view of an episode frames its nodes once; later layout edits never re-fit it.
  const measured = size.width > 0;
  useEffect(() => {
    const { committedViewport: initial, props: currentProps } = latest.current;
    if (measured && currentProps.viewport === undefined) currentProps.onViewportChange(initial);
  }, [measured]);

  // A target selected elsewhere (another tab, or the Agent focusing it) is brought into view.
  useEffect(() => {
    const { viewport: current, props: currentProps } = latest.current;
    const id = currentProps.selectedId;
    if (id === undefined || size.width === 0 || id === selectedHere.current) return;
    const node = nodes.find((candidate) => candidate.id === id);
    if (node === undefined) return;
    const point = currentProps.canvas[id] ?? node.initial;
    if (!nodeVisible(current, point, size)) currentProps.onViewportChange(centerOn(current, point, size));
  }, [nodes, props.selectedId, size]);

  const commitViewport = (next: CanvasViewport) => {
    setLiveViewport(undefined);
    props.onViewportChange(next);
  };

  const zoomAtCenter = (factor: number) => {
    commitViewport(zoomAt(viewport, factor, { x: size.width / 2, y: size.height / 2 }));
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("article") !== null) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
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
      else {
        selectedHere.current = undefined;
        props.onSelect(undefined);
      }
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const origin = positions[id] ?? { x: 0, y: 0 };
    const start = { x: event.clientX, y: event.clientY };
    const zoom = viewport.zoom;
    let moved = false;
    let next = origin;
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      moved = true;
      next = { x: origin.x + dx / zoom, y: origin.y + dy / zoom };
      setLiveNode({ id, point: next });
    };
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      setLiveNode(undefined);
      if (moved) props.onCanvasChange({ ...props.canvas, [id]: next });
      else {
        selectedHere.current = id;
        props.onSelect(id);
      }
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  const navigate = (id: string) => {
    const target = props.production.targets.get(id);
    if (target !== undefined) props.onNavigate(target);
  };

  const onNodeKeyDown = (event: ReactKeyboardEvent<HTMLElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate(id);
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    const delta = arrowDelta(event.key, step);
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = positions[id] ?? { x: 0, y: 0 };
    const point = { x: origin.x + delta.x, y: origin.y + delta.y };
    props.onCanvasChange({ ...props.canvas, [id]: point });
    // Keyboard moves can walk a node off screen; the view follows it like a selection does.
    if (size.width > 0 && !nodeVisible(viewport, point, size)) commitViewport(centerOn(viewport, point, size));
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
      commitViewport(fitNodes(Object.values(positions), size));
    }
  };

  const connections = props.production.shots.flatMap((shot) => shot.references.map((reference) => [reference, shot.id] as const));
  const gridSize = 20 * viewport.zoom;

  return <section className="oh-story-canvas-shell" aria-label="短剧素材与镜头关系画布">
    <div className="oh-story-projection-note" id="oh-story-canvas-help">文档关系 · 拖动空白处平移，滚轮缩放，方向键移动选中节点，Enter 打开原文 · 布局只在本页保留</div>
    <div className="oh-story-canvas-controls">
      <button type="button" aria-label="缩小画布" onClick={() => { zoomAtCenter(1 / BUTTON_ZOOM_STEP); }}>−</button>
      <span aria-live="polite">{Math.round(viewport.zoom * 100)}%</span>
      <button type="button" aria-label="放大画布" onClick={() => { zoomAtCenter(BUTTON_ZOOM_STEP); }}>＋</button>
      <button type="button" onClick={() => { commitViewport(fitNodes(Object.values(positions), size)); }}>适应</button>
      <button type="button" onClick={() => { props.onCanvasChange({}); commitViewport(fitNodes(nodes.map((node) => node.initial), size)); }}>复位</button>
    </div>
    <div
      ref={viewportRef}
      className="oh-story-canvas-viewport"
      role="application"
      aria-roledescription="无限画布"
      aria-label="画布视野"
      aria-describedby="oh-story-canvas-help"
      tabIndex={0}
      data-panning={panning || undefined}
      style={{ backgroundPosition: `${String(viewport.x)}px ${String(viewport.y)}px`, backgroundSize: `${String(gridSize)}px ${String(gridSize)}px` }}
      onPointerDown={startPan}
      onKeyDown={onViewportKeyDown}
    >
      <div className="oh-story-canvas" style={{ transform: `translate(${String(viewport.x)}px, ${String(viewport.y)}px) scale(${String(viewport.zoom)})` }}>
        <svg aria-hidden="true">{connections.map(([from, to]) => {
          const a = positions[from];
          const b = positions[to];
          if (a === undefined || b === undefined) return null;
          const y1 = a.y + CANVAS_NODE_HEIGHT / 2;
          const y2 = b.y + CANVAS_NODE_HEIGHT / 2;
          const x1 = a.x + CANVAS_NODE_WIDTH;
          const bend = Math.max(60, Math.abs(b.x - x1) / 2);
          return <path key={`${from}:${to}`} data-active={to === props.selectedId || from === props.selectedId || undefined} d={`M ${String(x1)} ${String(y1)} C ${String(x1 + bend)} ${String(y1)}, ${String(b.x - bend)} ${String(y2)}, ${String(b.x)} ${String(y2)}`} />;
        })}</svg>
        {nodes.map((node) => {
          const references = connections.filter(([from, to]) => from === node.id || to === node.id).length;
          return <article
            key={node.id}
            tabIndex={0}
            role="button"
            aria-label={`${node.type === "asset" ? "素材" : "镜头"} ${node.label}，${String(references)} 条关系`}
            aria-pressed={node.id === props.selectedId}
            data-node-type={node.type}
            data-selected={node.id === props.selectedId || undefined}
            data-dragging={liveNode?.id === node.id || undefined}
            style={{ left: positions[node.id]?.x, top: positions[node.id]?.y }}
            onKeyDown={(event) => { onNodeKeyDown(event, node.id); }}
            onPointerDown={(event) => { startDrag(event, node.id); }}
            onDoubleClick={() => { navigate(node.id); }}
          ><small>{node.type === "asset" ? "素材" : "镜头"}</small><strong>{node.label}</strong><span>{node.id}</span></article>;
        })}
      </div>
    </div>
  </section>;
}

function arrowDelta(key: string, step: number): CanvasPoint | undefined {
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  return undefined;
}
