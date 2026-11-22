import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
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

export interface InfiniteCanvasNode {
  readonly id: string;
  readonly initial: CanvasPoint;
  readonly width: number;
  readonly height: number;
}

export interface InfiniteCanvasPatch {
  readonly positions?: Record<string, CanvasPoint> | undefined;
  readonly viewport?: CanvasViewport | undefined;
  readonly selectedId?: string | null | undefined;
}

export interface UseInfiniteCanvasOptions<Node extends InfiniteCanvasNode> {
  readonly nodes: readonly Node[];
  readonly positions: Readonly<Record<string, CanvasPoint>>;
  readonly viewport: CanvasViewport | undefined;
  readonly selectedId: string | undefined;
  readonly defaultViewport?: ((rects: readonly CanvasRect[], size: CanvasSize, positions: Readonly<Record<string, CanvasPoint>>) => CanvasViewport) | undefined;
  readonly onCommit: (patch: InfiniteCanvasPatch) => void;
  readonly onActivate: (node: Node) => void;
  readonly activateOnSpace?: boolean | undefined;
  readonly clearSelectionOnEscape?: boolean | undefined;
}

const CLICK_SLOP = 4;
const BUTTON_ZOOM_STEP = 1.2;
const WHEEL_COMMIT_DELAY = 160;
const INTERACTIVE_TAGS = new Set(["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A", "VIDEO", "AUDIO"]);
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function safeSetPointerCapture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic or already-ended pointers can throw DOMException.
  }
}

function safeReleasePointerCapture(element: Element, pointerId: number): void {
  try {
    if ("hasPointerCapture" in element && typeof element.hasPointerCapture === "function" && !element.hasPointerCapture(pointerId)) return;
    element.releasePointerCapture(pointerId);
  } catch {
    // Ignore when capture was already released or lost.
  }
}

function isInteractiveEventTarget(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  if (target !== currentTarget) return true;
  if (target instanceof Element && INTERACTIVE_TAGS.has(target.tagName)) return true;
  return false;
}

export function nodeRects(nodes: readonly InfiniteCanvasNode[], positions: Readonly<Record<string, CanvasPoint>>): CanvasRect[] {
  return nodes.map((node) => ({ ...(positions[node.id] ?? node.initial), width: node.width, height: node.height }));
}

export function arrowDelta(key: string, step: number): CanvasPoint | undefined {
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  return undefined;
}

export function useInfiniteCanvas<Node extends InfiniteCanvasNode>(options: UseInfiniteCanvasOptions<Node>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [liveViewport, setLiveViewport] = useState<CanvasViewport>();
  const [liveNode, setLiveNode] = useState<{ readonly id: string; readonly point: CanvasPoint }>();
  const [panning, setPanning] = useState(false);
  const wheelCommit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeGestureCleanup = useRef<(() => void) | undefined>(undefined);
  const selectedHere = useRef<string>(undefined);
  const followed = useRef<string>(undefined);
  const followedSize = useRef<CanvasSize>(undefined);

  const positions: Record<string, CanvasPoint> = Object.fromEntries(options.nodes.map((node) => [
    node.id,
    options.positions[node.id] ?? node.initial
  ]));
  if (liveNode !== undefined) positions[liveNode.id] = liveNode.point;
  const rects = nodeRects(options.nodes, positions);
  const computeDefault = options.defaultViewport ?? ((bounds, nextSize) => fitRects(bounds, nextSize));
  const committedViewport = options.viewport ?? (size.width > 0 && size.height > 0 ? computeDefault(rects, size, positions) : DEFAULT_CANVAS_VIEWPORT);
  const viewport = liveViewport ?? committedViewport;

  const latest = useRef({ viewport, committedViewport, options, size });
  latest.current = { viewport, committedViewport, options, size };

  useEffect(() => () => {
    activeGestureCleanup.current?.();
    activeGestureCleanup.current = undefined;
  }, []);

  useIsomorphicLayoutEffect(() => {
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
      const next = zoomAt(
        latest.current.viewport,
        wheelZoomFactor(event.deltaY, event.deltaMode),
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      );
      setLiveViewport(next);
      clearTimeout(wheelCommit.current);
      wheelCommit.current = setTimeout(() => {
        wheelCommit.current = undefined;
        latest.current.options.onCommit({ viewport: next });
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
    if (measured && current.options.viewport === undefined) {
      current.options.onCommit({ viewport: current.committedViewport });
    }
  }, [measured]);

  useEffect(() => {
    const current = latest.current;
    const id = current.options.selectedId;
    const resized = followedSize.current?.width !== current.size.width || followedSize.current.height !== current.size.height;
    if (!measured || (id === followed.current && !resized)) return;
    followed.current = id;
    followedSize.current = current.size;
    if (id === undefined) return;
    if (id === selectedHere.current) {
      selectedHere.current = undefined;
      if (!resized) return;
    }
    const node = current.options.nodes.find((candidate) => candidate.id === id);
    if (node === undefined) return;
    const rect = { ...(current.options.positions[id] ?? node.initial), width: node.width, height: node.height };
    if (!rectVisible(current.viewport, rect, current.size)) {
      current.options.onCommit({ viewport: centerOnRect(current.viewport, rect, current.size) });
    }
  }, [measured, options.selectedId, size.width, size.height]);

  const commitViewport = (next: CanvasViewport) => {
    clearTimeout(wheelCommit.current);
    wheelCommit.current = undefined;
    setLiveViewport(undefined);
    options.onCommit({ viewport: next });
  };

  const flushWheel = () => {
    if (wheelCommit.current === undefined) return;
    clearTimeout(wheelCommit.current);
    wheelCommit.current = undefined;
    options.onCommit({ viewport });
    setLiveViewport(undefined);
  };

  const zoomIn = () => { commitViewport(zoomAt(viewport, BUTTON_ZOOM_STEP, { x: size.width / 2, y: size.height / 2 })); };
  const zoomOut = () => { commitViewport(zoomAt(viewport, 1 / BUTTON_ZOOM_STEP, { x: size.width / 2, y: size.height / 2 })); };
  const resetZoom = () => {
    if (viewport.zoom === 1) return;
    commitViewport(zoomAt(viewport, 1 / viewport.zoom, { x: size.width / 2, y: size.height / 2 }));
  };
  const fitAll = () => { commitViewport(fitRects(rects, size)); };
  const resetLayout = () => {
    clearTimeout(wheelCommit.current);
    wheelCommit.current = undefined;
    setLiveViewport(undefined);
    options.onCommit({ positions: {}, viewport: fitRects(nodeRects(options.nodes, {}), size) });
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("article, button, video, audio, input, select, textarea, a") !== null) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    flushWheel();
    activeGestureCleanup.current?.();
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    safeSetPointerCapture(element, pointerId);
    element.focus({ preventScroll: true });
    const origin = viewport;
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    let next = origin;
    let finished = false;
    setPanning(true);
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      moved = true;
      next = { ...origin, x: origin.x + dx, y: origin.y + dy };
      setLiveViewport(next);
    };
    const detach = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      element.removeEventListener("lostpointercapture", end);
      safeReleasePointerCapture(element, pointerId);
      if (activeGestureCleanup.current === abort) activeGestureCleanup.current = undefined;
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      detach();
      setPanning(false);
      setLiveViewport(undefined);
    };
    const end = () => {
      if (finished) return;
      finished = true;
      detach();
      setPanning(false);
      if (moved) commitViewport(next);
      else {
        selectedHere.current = undefined;
        options.onCommit({ selectedId: null });
      }
    };
    activeGestureCleanup.current = abort;
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
    element.addEventListener("lostpointercapture", end);
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button, video, audio, input, select, textarea, a") !== null)) return;
    event.stopPropagation();
    activeGestureCleanup.current?.();
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    safeSetPointerCapture(element, pointerId);
    const origin = positions[id] ?? { x: 0, y: 0 };
    const start = { x: event.clientX, y: event.clientY };
    const zoom = viewport.zoom;
    let moved = false;
    let next = origin;
    let finished = false;
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      moved = true;
      next = { x: origin.x + dx / zoom, y: origin.y + dy / zoom };
      setLiveNode({ id, point: next });
    };
    const detach = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      element.removeEventListener("lostpointercapture", end);
      safeReleasePointerCapture(element, pointerId);
      if (activeGestureCleanup.current === abort) activeGestureCleanup.current = undefined;
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      detach();
      setLiveNode(undefined);
    };
    const end = () => {
      if (finished) return;
      finished = true;
      detach();
      setLiveNode(undefined);
      if (moved) options.onCommit({ positions: { ...options.positions, [id]: next } });
      else {
        if (id !== options.selectedId) selectedHere.current = id;
        options.onCommit({ selectedId: id });
      }
    };
    activeGestureCleanup.current = abort;
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
    element.addEventListener("lostpointercapture", end);
  };

  const onNodeKeyDown = (event: ReactKeyboardEvent<HTMLElement>, node: Node) => {
    if (isInteractiveEventTarget(event.target, event.currentTarget)) return;
    if (event.key === "Enter" || (options.activateOnSpace === true && event.key === " ")) {
      event.preventDefault();
      options.onActivate(node);
      return;
    }
    const delta = arrowDelta(event.key, event.shiftKey ? 40 : 10);
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = positions[node.id] ?? node.initial;
    const point = { x: origin.x + delta.x, y: origin.y + delta.y };
    const rect = { ...point, width: node.width, height: node.height };
    const nextViewport = measured && !rectVisible(viewport, rect, size) ? centerOnRect(viewport, rect, size) : undefined;
    if (nextViewport !== undefined) {
      clearTimeout(wheelCommit.current);
      wheelCommit.current = undefined;
      setLiveViewport(undefined);
    }
    options.onCommit({ positions: { ...options.positions, [node.id]: point }, viewport: nextViewport });
  };

  const onViewportKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isInteractiveEventTarget(event.target, event.currentTarget)) return;
    const delta = arrowDelta(event.key, event.shiftKey ? 240 : 60);
    if (delta !== undefined) {
      event.preventDefault();
      commitViewport({ ...viewport, x: viewport.x - delta.x, y: viewport.y - delta.y });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomIn();
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomOut();
    } else if (event.key === "0") {
      event.preventDefault();
      fitAll();
    } else if (options.clearSelectionOnEscape === true && event.key === "Escape") {
      event.preventDefault();
      options.onCommit({ selectedId: null });
    }
  };

  return {
    viewportRef,
    positions,
    viewport,
    panning,
    draggingId: liveNode?.id,
    zoomIn,
    zoomOut,
    resetZoom,
    fitAll,
    resetLayout,
    startPan,
    startDrag,
    onNodeKeyDown,
    onViewportKeyDown
  };
}
