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

export const CANVAS_NODE_WIDTH = 180;
export const CANVAS_NODE_HEIGHT = 76;
export const MIN_CANVAS_ZOOM = .1;
export const MAX_CANVAS_ZOOM = 3;
export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: .65 };
const FIT_PADDING = 40;

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
  return {
    x: size.width / 2 - (node.x + CANVAS_NODE_WIDTH / 2) * viewport.zoom,
    y: size.height / 2 - (node.y + CANVAS_NODE_HEIGHT / 2) * viewport.zoom,
    zoom: viewport.zoom
  };
}

export function nodeVisible(viewport: CanvasViewport, node: CanvasPoint, size: CanvasSize): boolean {
  const left = node.x * viewport.zoom + viewport.x;
  const top = node.y * viewport.zoom + viewport.y;
  return left >= 0 && top >= 0 && left + CANVAS_NODE_WIDTH * viewport.zoom <= size.width && top + CANVAS_NODE_HEIGHT * viewport.zoom <= size.height;
}

/** Frames every node; a single tall column fits its width rather than shrinking to dots. */
export function fitNodes(nodes: readonly CanvasPoint[], size: CanvasSize, fallback: CanvasViewport = DEFAULT_CANVAS_VIEWPORT): CanvasViewport {
  if (nodes.length === 0 || size.width <= 0 || size.height <= 0) return fallback;
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + CANVAS_NODE_WIDTH));
  const bottom = Math.max(...nodes.map((node) => node.y + CANVAS_NODE_HEIGHT));
  const widthZoom = (size.width - FIT_PADDING * 2) / Math.max(1, right - left);
  const heightZoom = (size.height - FIT_PADDING * 2) / Math.max(1, bottom - top);
  const zoom = clampZoom(Math.min(1, Math.max(Math.min(widthZoom, heightZoom), Math.min(widthZoom, .4))));
  const fitsHeight = (bottom - top) * zoom <= size.height - FIT_PADDING * 2;
  return {
    x: (size.width - (right - left) * zoom) / 2 - left * zoom,
    y: fitsHeight ? (size.height - (bottom - top) * zoom) / 2 - top * zoom : FIT_PADDING - top * zoom,
    zoom
  };
}
