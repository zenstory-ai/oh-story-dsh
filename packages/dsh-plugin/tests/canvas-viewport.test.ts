import { describe, expect, it } from "vitest";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, centerOn, fitNodes, fitRects, initialReadableViewport, nodeVisible, rectVisible, screenToWorld, wheelZoomFactor, zoomAt } from "../src/client/canvas-viewport.js";

describe("canvas viewport", () => {
  it("zooms around the cursor and stays within the zoom range", () => {
    const viewport = { x: -300, y: 120, zoom: .65 };
    const cursor = { x: 412, y: 233 };
    const before = screenToWorld(viewport, cursor);
    for (const factor of [wheelZoomFactor(-120, 0), wheelZoomFactor(3, 1), 1 / 1.2]) {
      const after = screenToWorld(zoomAt(viewport, factor, cursor), cursor);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
    expect(wheelZoomFactor(-120, 0)).toBeGreaterThan(1);
    expect(zoomAt(viewport, 1e6, cursor).zoom).toBe(MAX_CANVAS_ZOOM);
    expect(zoomAt(viewport, 1e-6, cursor).zoom).toBe(MIN_CANVAS_ZOOM);
  });

  it("brings a node at negative or far coordinates into view", () => {
    const size = { width: 600, height: 400 };
    const viewport = { x: 0, y: 0, zoom: 1 };
    for (const node of [{ x: -2400, y: -900 }, { x: 9000, y: 7000 }]) {
      expect(nodeVisible(viewport, node, size)).toBe(false);
      const centered = centerOn(viewport, node, size);
      expect(centered.zoom).toBe(1);
      expect(nodeVisible(centered, node, size)).toBe(true);
    }
  });

  it("frames every fixed-size node", () => {
    const size = { width: 800, height: 600 };
    const grid = [{ x: -200, y: -100 }, { x: 640, y: 80 }, { x: 300, y: 400 }];
    const framed = fitNodes(grid, size);
    for (const node of grid) expect(nodeVisible(framed, node, size)).toBe(true);
  });

  it("uses each card's actual bounds when fitting the canvas", () => {
    const size = { width: 900, height: 600 };
    const cards = [
      { x: -200, y: 40, width: 260, height: 210 },
      { x: 600, y: -120, width: 292, height: 310 },
      { x: 1200, y: 720, width: 248, height: 270 }
    ];
    const framed = fitRects(cards, size);
    for (const card of cards) expect(rectVisible(framed, card, size)).toBe(true);
  });

  it("keeps the initial cluster readable while fit still frames everything", () => {
    const size = { width: 900, height: 600 };
    const focus = [
      { x: 80, y: 80, width: 260, height: 210 },
      { x: 520, y: 80, width: 248, height: 270 },
      { x: 950, y: 80, width: 292, height: 310 }
    ];
    const initial = initialReadableViewport(focus, size);
    expect(initial.zoom).toBeGreaterThanOrEqual(.65);
    expect(initial.zoom).toBeGreaterThan(fitRects([...focus, { x: 4000, y: 3000, width: 292, height: 310 }], size).zoom);
  });
});
