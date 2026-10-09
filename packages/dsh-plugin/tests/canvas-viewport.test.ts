import { describe, expect, it } from "vitest";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, centerOn, fitNodes, nodeVisible, screenToWorld, wheelZoomFactor, zoomAt } from "../src/client/canvas-viewport.js";

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

  it("frames every node, but keeps a long shot column readable from its top", () => {
    const size = { width: 800, height: 600 };
    const grid = [{ x: -200, y: -100 }, { x: 640, y: 80 }, { x: 300, y: 400 }];
    const framed = fitNodes(grid, size);
    for (const node of grid) expect(nodeVisible(framed, node, size)).toBe(true);

    const column = Array.from({ length: 300 }, (_, index) => ({ x: 640, y: 80 + index * 180 }));
    const tall = fitNodes(column, size);
    expect(tall.zoom).toBeGreaterThanOrEqual(.4);
    expect(nodeVisible(tall, column[0]!, size)).toBe(true);
  });
});
