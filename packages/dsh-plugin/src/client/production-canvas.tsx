import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { DramaDocumentTarget, DramaEpisodeProduction } from "./drama-production.js";
import { selectedVersionForTarget, type CanvasPoint, type ProductionJob, type ProductionMediaVersion } from "./production-runtime.js";
import {
  DEFAULT_CANVAS_VIEWPORT,
  centerOnRect,
  fitRects,
  initialReadableViewport,
  rectVisible,
  wheelZoomFactor,
  zoomAt,
  type CanvasRect,
  type CanvasSize,
  type CanvasViewport
} from "./canvas-viewport.js";
import { productionCanvasEdges, productionCanvasNodes, type ProductionCanvasNode } from "./production-canvas-model.js";

export interface ProductionCanvasProps {
  readonly production: DramaEpisodeProduction;
  readonly selectedId: string | undefined;
  readonly canvas: Readonly<Record<string, CanvasPoint>>;
  /** Undefined until the creator pans or zooms this episode; the first view then frames the nodes. */
  readonly viewport: CanvasViewport | undefined;
  readonly onSelect: (id: string | undefined) => void;
  readonly onNavigate: (target: DramaDocumentTarget) => void;
  readonly onCanvasChange: (canvas: Record<string, CanvasPoint>) => void;
  readonly onViewportChange: (viewport: CanvasViewport) => void;
  /** Existing DSH-owned media only. The canvas never invents generated results. */
  readonly versions?: readonly ProductionMediaVersion[] | undefined;
  readonly jobs?: readonly ProductionJob[] | undefined;
  readonly selections?: Readonly<Record<string, string>> | undefined;
  readonly documents?: Readonly<Record<string, string>> | undefined;
  readonly onSelectionsChange?: ((value: Record<string, string>) => void) | undefined;
  readonly onPrepare?: ((targetId: string, kind: "image" | "video", prompt: string) => void | Promise<void>) | undefined;
  readonly onOpenMedia?: ((path: string) => void) | undefined;
  readonly onContinueInChat?: ((targetId: string) => void) | undefined;
}

/** Pointer travel below this many pixels is a click, not a drag. */
const CLICK_SLOP = 4;
const BUTTON_ZOOM_STEP = 1.2;
/** Wheel bursts update locally and reach the Store once they settle. */
const WHEEL_COMMIT_DELAY = 160;

/** Kept as a compatibility export for callers/tests that used the old helper. */
export const canvasNodes = productionCanvasNodes;

export function ProductionCanvas(props: ProductionCanvasProps) {
  const nodes = useMemo(() => productionCanvasNodes(props.production, props.documents), [props.production, props.documents]);
  const edges = useMemo(() => productionCanvasEdges(props.production), [props.production]);
  const versions = props.versions ?? [];
  const selections = props.selections ?? {};
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [liveViewport, setLiveViewport] = useState<CanvasViewport>();
  const [liveNode, setLiveNode] = useState<{ readonly id: string; readonly point: CanvasPoint }>();
  const [panning, setPanning] = useState(false);
  const wheelCommit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedHere = useRef<string>(undefined);
  const followed = useRef<string>(undefined);
  const followedSize = useRef<CanvasSize>(undefined);

  const positions: Record<string, CanvasPoint> = Object.fromEntries(nodes.map((node) => [node.id, props.canvas[node.id] ?? node.initial]));
  if (liveNode !== undefined) positions[liveNode.id] = liveNode.point;
  const rects = nodeRects(nodes, positions);
  const readableRects = nodeRects(readableNodes(nodes), positions);
  const committedViewport = props.viewport ?? (size.width > 0 ? initialReadableViewport(readableRects, size) : DEFAULT_CANVAS_VIEWPORT);
  const viewport = liveViewport ?? committedViewport;

  const latest = useRef({ viewport, committedViewport, props, nodes, size });
  latest.current = { viewport, committedViewport, props, nodes, size };

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

  const measured = size.width > 0;
  useEffect(() => {
    const { committedViewport: initial, props: currentProps } = latest.current;
    if (measured && currentProps.viewport === undefined) currentProps.onViewportChange(initial);
  }, [measured]);

  useEffect(() => {
    const { viewport: current, props: currentProps, nodes: currentNodes, size: currentSize } = latest.current;
    const id = currentProps.selectedId;
    const resized = followedSize.current?.width !== currentSize.width || followedSize.current.height !== currentSize.height;
    if (!measured || (id === followed.current && !resized)) return;
    followed.current = id;
    followedSize.current = currentSize;
    if (id === undefined) return;
    if (id === selectedHere.current) {
      selectedHere.current = undefined;
      if (!resized) return;
    }
    const node = currentNodes.find((candidate) => candidate.id === id);
    if (node === undefined) return;
    const point = currentProps.canvas[id] ?? node.initial;
    const rect = { ...point, width: node.width, height: node.height };
    if (!rectVisible(current, rect, currentSize)) currentProps.onViewportChange(centerOnRect(current, rect, currentSize));
  }, [measured, props.selectedId, size.width, size.height]);

  const flushWheel = () => {
    if (wheelCommit.current === undefined) return;
    clearTimeout(wheelCommit.current);
    wheelCommit.current = undefined;
    props.onViewportChange(viewport);
    setLiveViewport(undefined);
  };

  const commitViewport = (next: CanvasViewport) => {
    clearTimeout(wheelCommit.current);
    wheelCommit.current = undefined;
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
        if (id !== props.selectedId) selectedHere.current = id;
        props.onSelect(id);
      }
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  const navigate = (node: ProductionCanvasNode) => {
    if (node.target !== undefined) props.onNavigate(node.target);
  };

  const onNodeKeyDown = (event: ReactKeyboardEvent<HTMLElement>, node: ProductionCanvasNode) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate(node);
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    const delta = arrowDelta(event.key, step);
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = positions[node.id] ?? { x: 0, y: 0 };
    const point = { x: origin.x + delta.x, y: origin.y + delta.y };
    props.onCanvasChange({ ...props.canvas, [node.id]: point });
    const rect = { ...point, width: node.width, height: node.height };
    if (size.width > 0 && !rectVisible(viewport, rect, size)) commitViewport(centerOnRect(viewport, rect, size));
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
    }
  };

  const selectedNode = nodes.find((node) => node.id === props.selectedId);
  const gridSize = 20 * viewport.zoom;

  return <section className="oh-story-canvas-shell" aria-label="短剧故事与镜头无限画布">
    <div className="oh-story-canvas-toolbar">
      <div className="oh-story-canvas-help" id="oh-story-canvas-help">拖动空白处平移 · 滚轮缩放 · 方向键移动卡片 · 双击打开原文</div>
      <div className="oh-story-canvas-controls">
        <button type="button" aria-label="缩小画布" onClick={() => { zoomAtCenter(1 / BUTTON_ZOOM_STEP); }}>−</button>
        <span aria-live="polite">{Math.round(viewport.zoom * 100)}%</span>
        <button type="button" aria-label="放大画布" onClick={() => { zoomAtCenter(BUTTON_ZOOM_STEP); }}>＋</button>
        <button type="button" onClick={() => { commitViewport(fitRects(rects, size)); }}>适应</button>
        <button type="button" onClick={() => { props.onCanvasChange({}); commitViewport(fitRects(nodeRects(nodes, Object.fromEntries(nodes.map((node) => [node.id, node.initial]))), size)); }}>复位</button>
      </div>
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
        <CanvasGroupLabels nodes={nodes} />
        <svg aria-hidden="true">{edges.map((edge) => {
          const from = nodes.find((node) => node.id === edge.from);
          const to = nodes.find((node) => node.id === edge.to);
          const a = from === undefined ? undefined : positions[from.id];
          const b = to === undefined ? undefined : positions[to.id];
          if (a === undefined || b === undefined || from === undefined || to === undefined) return null;
          const y1 = a.y + from.height / 2;
          const y2 = b.y + to.height / 2;
          const x1 = a.x + from.width;
          const bend = Math.max(60, Math.abs(b.x - x1) / 2);
          const active = edge.to === props.selectedId || edge.from === props.selectedId;
          return <g data-edge-kind={edge.kind} key={`${edge.kind}:${edge.from}:${edge.to}`}>
            <path className="oh-story-canvas-edge" data-active={active || undefined} d={`M ${String(x1)} ${String(y1)} C ${String(x1 + bend)} ${String(y1)}, ${String(b.x - bend)} ${String(y2)}, ${String(b.x)} ${String(y2)}`} />
            <text className="oh-story-canvas-edge-label" data-active={active || undefined} x={(x1 + b.x) / 2} y={(y1 + y2) / 2 - 7}>{edge.label}</text>
          </g>;
        })}</svg>
        {nodes.map((node) => <CanvasNodeCard
          key={node.id}
          node={node}
          point={positions[node.id] ?? node.initial}
          selected={node.id === props.selectedId}
          dragging={liveNode?.id === node.id}
          relations={edges.filter((edge) => edge.from === node.id || edge.to === node.id).length}
          versions={versions.filter((version) => version.targetId === node.id)}
          job={props.jobs?.findLast((job) => job.targetId === node.id)}
          selections={selections}
          onSelectionsChange={props.onSelectionsChange}
          onPrepare={props.onPrepare === undefined ? undefined : (targetId, kind, prompt) => {
            props.onSelect(targetId);
            return props.onPrepare?.(targetId, kind, prompt);
          }}
          onOpenMedia={props.onOpenMedia}
          onKeyDown={onNodeKeyDown}
          onPointerDown={startDrag}
          onNavigate={navigate}
        />)}
      </div>
    </div>
    {selectedNode !== undefined && <div className="oh-story-canvas-context" aria-live="polite">
      <div className="oh-story-canvas-context-copy"><small>已选中</small><strong>{selectedNode.title}</strong></div>
      {selectedNode.target !== undefined && <button type="button" onClick={() => { navigate(selectedNode); }}>打开原文</button>}
      {props.onContinueInChat !== undefined && <button type="button" onClick={() => { props.onContinueInChat?.(selectedNode.id); }}>在 Chat 中继续</button>}
    </div>}
  </section>;
}

function CanvasNodeCard(props: {
  readonly node: ProductionCanvasNode;
  readonly point: CanvasPoint;
  readonly selected: boolean;
  readonly dragging: boolean;
  readonly relations: number;
  readonly versions: readonly ProductionMediaVersion[];
  readonly job: ProductionJob | undefined;
  readonly selections: Readonly<Record<string, string>>;
  readonly onSelectionsChange?: ((value: Record<string, string>) => void) | undefined;
  readonly onPrepare?: ProductionCanvasProps["onPrepare"];
  readonly onOpenMedia?: ProductionCanvasProps["onOpenMedia"];
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>, node: ProductionCanvasNode) => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: string) => void;
  readonly onNavigate: (node: ProductionCanvasNode) => void;
}) {
  const selectedVersion = selectedVersionForTarget(props.node.id, props.versions, props.selections);
  return <article
    className="oh-story-canvas-node"
    tabIndex={0}
    role="button"
    aria-label={`${kindLabel(props.node.kind)} ${props.node.title}，${String(props.relations)} 条关系`}
    title={`来源条目：${props.node.id}`}
    aria-pressed={props.selected}
    data-node-type={props.node.kind}
    data-selected={props.selected || undefined}
    data-dragging={props.dragging || undefined}
    style={{ left: props.point.x, top: props.point.y, width: props.node.width, height: props.node.height }}
    onKeyDown={(event) => { props.onKeyDown(event, props.node); }}
    onPointerDown={(event) => { props.onPointerDown(event, props.node.id); }}
    onDoubleClick={() => { props.onNavigate(props.node); }}
  >
    <header className="oh-story-canvas-node-head"><div><small>{props.node.eyebrow}</small><strong>{props.node.title}</strong></div><span>{props.relations} 条关系</span></header>
    {props.node.kind !== "story" && <div className="oh-story-canvas-node-media">
      {selectedVersion === undefined
        ? <div className="oh-story-canvas-node-placeholder" aria-hidden="true">{props.node.kind === "shot" ? "待准备画面" : "待准备素材"}</div>
        : <MediaPreview version={selectedVersion} interactive />}
    </div>}
    <div className="oh-story-canvas-node-copy">{props.node.description !== undefined && <p>{props.node.description}</p>}</div>
    <div className="oh-story-canvas-node-meta"><span>{canvasNodeStatus(props.node, selectedVersion, props.job)}</span>{props.versions.length > 0 && <span>{props.versions.length} 个版本</span>}</div>
    {props.versions.length > 1 && <div className="oh-story-canvas-node-versions" aria-label={`${props.node.title} 成果版本`}>{props.versions.map((version, index) => <button
      type="button"
      key={version.id}
      aria-label={`选择 ${props.node.title} 版本 ${String(index + 1)}`}
      aria-pressed={version.id === selectedVersion?.id}
      data-selected={version.id === selectedVersion?.id || undefined}
      onPointerDown={stopPointer}
      onClick={(event) => { event.stopPropagation(); props.onSelectionsChange?.({ ...props.selections, [props.node.id]: version.id }); }}
    ><MediaPreview version={version} /><span>V{String(index + 1)}</span></button>)}</div>}
    <footer className="oh-story-canvas-node-actions">
      {props.node.prompt !== undefined && props.onPrepare !== undefined && <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); void props.onPrepare?.(props.node.id, "image", props.node.prompt!); }}>{props.node.kind === "shot" ? "准备关键帧" : "准备素材"}</button>}
      {props.node.videoPrompt !== undefined && props.onPrepare !== undefined && <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); void props.onPrepare?.(props.node.id, "video", props.node.videoPrompt!); }}>准备视频</button>}
      {selectedVersion?.path !== undefined && props.onOpenMedia !== undefined && <button type="button" onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); props.onOpenMedia?.(selectedVersion.path!); }}>打开文件</button>}
    </footer>
  </article>;
}

function CanvasGroupLabels({ nodes }: { readonly nodes: readonly ProductionCanvasNode[] }) {
  const labels = (["story", "asset", "shot"] as const).flatMap((kind) => {
    const group = nodes.filter((node) => node.kind === kind);
    if (group.length === 0) return [];
    return [{ kind, x: Math.min(...group.map((node) => node.initial.x)), y: Math.min(...group.map((node) => node.initial.y)) - 34 }];
  });
  return <>{labels.map((label) => <div className="oh-story-canvas-group-label" data-group={label.kind} key={label.kind} style={{ left: label.x, top: label.y }}>{kindLabel(label.kind)}</div>)}</>;
}

function MediaPreview({ version, interactive = false }: { readonly version: ProductionMediaVersion; readonly interactive?: boolean }) {
  return version.kind === "image"
    ? <img className="oh-story-media-preview" src={version.url} alt={version.targetId} loading="lazy" draggable={false} />
    : <video className="oh-story-media-preview" src={version.url} controls={interactive} muted={!interactive} preload="metadata" onPointerDown={interactive ? stopPointer : undefined} onClick={interactive ? stopClick : undefined} />;
}

export function canvasNodeStatus(node: ProductionCanvasNode, version: ProductionMediaVersion | undefined, job?: ProductionJob): string {
  if (job !== undefined) {
    if (job.status === "awaiting_confirmation") return "等待确认";
    if (job.status === "pending") return "等待生成";
    if (job.status === "running") return "正在生成";
    if (job.status === "dispatched_unknown") return "成果待核对";
    if (job.status === "failed") return "生成失败，请查看记录";
    if (job.status === "canceled") return "已停止生成";
  }
  if (version !== undefined) return version.kind === "video" ? "已有视频" : "已有画面";
  if (node.kind === "story") return "来自剧本";
  return node.kind === "shot" ? "等待画面" : "等待素材";
}

function readableNodes(nodes: readonly ProductionCanvasNode[]): ProductionCanvasNode[] {
  return [
    nodes.find((node) => node.kind === "story"),
    nodes.find((node) => node.kind === "asset"),
    ...nodes.filter((node) => node.kind === "shot").slice(0, 1)
  ].filter((node): node is ProductionCanvasNode => node !== undefined);
}

function nodeRects(nodes: readonly ProductionCanvasNode[], positions: Readonly<Record<string, CanvasPoint>>): CanvasRect[] {
  return nodes.map((node) => ({ ...(positions[node.id] ?? node.initial), width: node.width, height: node.height }));
}

function kindLabel(kind: ProductionCanvasNode["kind"]): string {
  if (kind === "story") return "故事";
  if (kind === "asset") return "人物与场景";
  return "镜头";
}

function stopPointer(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopClick(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function arrowDelta(key: string, step: number): CanvasPoint | undefined {
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  return undefined;
}
