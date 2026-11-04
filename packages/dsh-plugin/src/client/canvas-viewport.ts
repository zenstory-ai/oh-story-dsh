import type { CanvasPoint } from "./production-runtime.js";

/**
 * Screen = world * zoom + pan. The canvas has no edges: nodes and the pan offset take any
 * finite coordinate, so nothing can be pushed out of reach.
 */
export interface CanvasViewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface CanvasRect extends CanvasPoint {
  readonly width: number;
  readonly height: number;
}

export const CANVAS_NODE_WIDTH = 180;
export const CANVAS_NODE_HEIGHT = 76;
export const MIN_CANVAS_ZOOM = .01;
export const MAX_CANVAS_ZOOM = 3;
export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: .65 };
const FIT_PADDING = 40;
const READABLE_ZOOM = .65;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
}

/** Scales by `factor` while the world point under `anchor` (viewport pixels) stays put. */
export function zoomAt(viewport: CanvasViewport, factor: number, anchor: CanvasPoint): CanvasViewport {
  const zoom = clampZoom(viewport.zoom * factor);
  const scale = zoom / viewport.zoom;
  return { x: anchor.x - (anchor.x - viewport.x) * scale, y: anchor.y - (anchor.y - viewport.y) * scale, zoom };
}

/** Wheel deltas arrive in pixels, lines or pages depending on device; one notch is ~10%. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 800 : deltaY;
  return Math.exp(-pixels * .001);
}

export function screenToWorld(viewport: CanvasViewport, point: CanvasPoint): CanvasPoint {
  return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom };
}

/** Pans so the node's centre sits in the middle of the viewport, keeping the zoom. */
export function centerOn(viewport: CanvasViewport, node: CanvasPoint, size: CanvasSize): CanvasViewport {
  return centerOnRect(viewport, { ...node, width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT }, size);
}

export function centerOnRect(viewport: CanvasViewport, node: CanvasRect, size: CanvasSize): CanvasViewport {
  return {
    x: size.width / 2 - (node.x + node.width / 2) * viewport.zoom,
    y: size.height / 2 - (node.y + node.height / 2) * viewport.zoom,
    zoom: viewport.zoom
  };
}

export function nodeVisible(viewport: CanvasViewport, node: CanvasPoint, size: CanvasSize): boolean {
  return rectVisible(viewport, { ...node, width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT }, size);
}

export function rectVisible(viewport: CanvasViewport, node: CanvasRect, size: CanvasSize): boolean {
  const left = node.x * viewport.zoom + viewport.x;
  const top = node.y * viewport.zoom + viewport.y;
  return left >= 0 && top >= 0 && left + node.width * viewport.zoom <= size.width && top + node.height * viewport.zoom <= size.height;
}

/** Compatibility wrapper for the old fixed-size nodes. */
export function fitNodes(nodes: readonly CanvasPoint[], size: CanvasSize, fallback: CanvasViewport = DEFAULT_CANVAS_VIEWPORT): CanvasViewport {
  return fitRects(nodes.map((node) => ({ ...node, width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT })), size, fallback);
}

/** Frames the complete bounds of every variable-sized canvas object. */
export function fitRects(nodes: readonly CanvasRect[], size: CanvasSize, fallback: CanvasViewport = DEFAULT_CANVAS_VIEWPORT): CanvasViewport {
  if (nodes.length === 0 || size.width <= 0 || size.height <= 0) return fallback;
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  const widthZoom = (size.width - FIT_PADDING * 2) / Math.max(1, right - left);
  const heightZoom = (size.height - FIT_PADDING * 2) / Math.max(1, bottom - top);
  const zoom = clampZoom(Math.min(1, widthZoom, heightZoom));
  return {
    x: (size.width - (right - left) * zoom) / 2 - left * zoom,
    y: (size.height - (bottom - top) * zoom) / 2 - top * zoom,
    zoom
  };
}

/** Starts close enough to read a representative cluster; "fit" remains the explicit all-content view. */
export function initialReadableViewport(nodes: readonly CanvasRect[], size: CanvasSize, fallback: CanvasViewport = DEFAULT_CANVAS_VIEWPORT): CanvasViewport {
  if (nodes.length === 0 || size.width <= 0 || size.height <= 0) return fallback;
  const fitted = fitRects(nodes, size, fallback);
  const zoom = Math.max(READABLE_ZOOM, fitted.zoom);
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  return {
    x: size.width / 2 - (left + (right - left) / 2) * zoom,
    y: FIT_PADDING - top * zoom,
    zoom
  };
}
