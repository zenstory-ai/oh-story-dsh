import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkbenchModesStore,
  readWorkbenchModes,
  resolveVisibleWorkbench,
  visibleWorkbenchModes,
  WORKBENCH_MODES,
  workbenchModesKey,
  writeWorkbenchModes
} from "../src/client/workbench-settings.js";
import {
  createDialogBackdropGuard,
  isDialogBackdropClick,
  WorkbenchSettingsForm,
  WorkbenchSettingsPanel
} from "../src/client/workbench-settings-panel.js";

describe("workbench visibility preferences", () => {
  it("defaults to all modes and recovers malformed or empty preferences", () => {
    for (const value of [undefined, null, {}, [], ["unknown"], "drama"]) {
      expect(visibleWorkbenchModes(value)).toEqual(WORKBENCH_MODES);
    }
    expect(visibleWorkbenchModes(["video", "drama", "video", "foreign"])).toEqual(["drama", "video"]);
  });

  it("preserves a visible selection or falls back when the active tab is hidden", () => {
    expect(resolveVisibleWorkbench("video", ["drama", "video"])).toBe("video");
    expect(resolveVisibleWorkbench("story", ["drama", "video"])).toBe("drama");
  });

  it("remembers choices by workspace without touching the whole-workbench open preference", () => {
    const entries: Record<string, string> = { "oh-story.workbench./novel": "closed" };
    const storage = { getItem: (key: string) => entries[key] ?? null, setItem: (key: string, value: string) => { entries[key] = value; } };
    writeWorkbenchModes(storage, "/drama", ["drama"]);
    writeWorkbenchModes(storage, "/novel", ["story", "game"]);
    expect(readWorkbenchModes(storage, "/drama")).toEqual(["drama"]);
    expect(readWorkbenchModes(storage, "/novel")).toEqual(["story", "game"]);
    expect(readWorkbenchModes(storage, "/new")).toEqual(WORKBENCH_MODES);
    expect(entries["oh-story.workbench./novel"]).toBe("closed");
    entries[workbenchModesKey("/drama")] = "{broken";
    expect(readWorkbenchModes(storage, "/drama")).toEqual(WORKBENCH_MODES);
    entries[workbenchModesKey("/drama")] = "[]";
    expect(readWorkbenchModes(storage, "/drama")).toEqual(WORKBENCH_MODES);
  });

  it("tolerates unavailable site storage and an unknown workspace", () => {
    const refusing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readWorkbenchModes(refusing, "/drama")).toEqual(WORKBENCH_MODES);
    expect(readWorkbenchModes(undefined, "/drama")).toEqual(WORKBENCH_MODES);
    expect(readWorkbenchModes(refusing, undefined)).toEqual(WORKBENCH_MODES);
    expect(() => { writeWorkbenchModes(refusing, "/drama", ["drama"]); }).not.toThrow();
    expect(() => { writeWorkbenchModes(undefined, undefined, ["drama"]); }).not.toThrow();
  });
});

describe("workspace-owned visibility store", () => {
  it("shares the latest preference across Session A/B/A instead of restoring stale Session state", () => {
    const store = createWorkbenchModesStore(undefined);
    const a = vi.fn();
    const b = vi.fn();
    const otherWorkspace = vi.fn();
    const unsubscribe = store.subscribe("/drama", a);
    store.subscribe("/drama", b);
    store.subscribe("/novel", otherWorkspace);
    store.set("/drama", ["drama"]);
    expect(store.get("/drama")).toEqual(["drama"]);
    unsubscribe();
    store.set("/drama", ["game"]);
    expect(store.get("/drama")).toEqual(["game"]);
    expect(store.get("/novel")).toEqual(WORKBENCH_MODES);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(otherWorkspace).not.toHaveBeenCalled();
  });

  it("returns stable snapshots and persists across page-store instances", () => {
    const entries: Record<string, string> = {};
    const storage = { getItem: (key: string) => entries[key] ?? null, setItem: (key: string, value: string) => { entries[key] = value; } };
    const store = createWorkbenchModesStore(storage);
    expect(store.get("/drama")).toBe(store.get("/drama"));
    store.set("/drama", ["drama"]);
    expect(store.get("/drama")).toBe(store.get("/drama"));
    expect(createWorkbenchModesStore(storage).get("/drama")).toEqual(["drama"]);
    expect(store.get(undefined)).toEqual(WORKBENCH_MODES);
  });

  it("keeps the workspace choice in page memory when site storage refuses writes", () => {
    const store = createWorkbenchModesStore({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    store.set("/drama", ["drama"]);
    expect(store.get("/drama")).toEqual(["drama"]);
  });
});

describe("workbench settings form", () => {
  it("lists every mode for restoration but disables unchecking the last visible tab", () => {
    const markup = renderToStaticMarkup(<WorkbenchSettingsForm modes={["drama"]} onChange={vi.fn()} />);
    expect(markup.match(/type="checkbox"/gu)).toHaveLength(4);
    expect(markup.match(/checked=""/gu)).toHaveLength(1);
    expect(markup.match(/disabled=""/gu)).toHaveLength(1);
    expect(markup).toContain("至少保留一个页卡");
    expect(markup).toContain("显示全部");
    expect(markup).toContain("不删除项目");
    expect(markup).toContain("DSH");
    expect(markup).not.toContain('type="password"');
  });

  it("wraps dialog children in .oh-workbench-settings-body and ignores clicks inside the dialog rect", () => {
    const markup = renderToStaticMarkup(<WorkbenchSettingsPanel modes={["story", "drama"]} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(markup).toContain('<div class="oh-workbench-settings-body">');

    const dialog = {
      getBoundingClientRect: () => ({ left: 100, top: 80, right: 500, bottom: 420, width: 400, height: 340 } as DOMRect)
    };
    // Clicking inner 20px padding or gaps lands inside the dialog bounding rect -> must NOT close.
    expect(isDialogBackdropClick(dialog, { target: dialog, detail: 1, clientX: 105, clientY: 85 })).toBe(false);
    // Clicking an inner child element -> must NOT close.
    expect(isDialogBackdropClick(dialog, { target: {}, detail: 1, clientX: 10, clientY: 10 })).toBe(false);
    // Keyboard-triggered click -> must NOT close.
    expect(isDialogBackdropClick(dialog, { target: dialog, detail: 0, clientX: 0, clientY: 0 })).toBe(false);
    // Clicking outside the dialog rect (true ::backdrop click) -> closes.
    expect(isDialogBackdropClick(dialog, { target: dialog, detail: 1, clientX: 40, clientY: 200 })).toBe(true);

    // Dragging a text selection from inside the dialog onto the backdrop must NOT close.
    const guard = createDialogBackdropGuard();
    guard.onPointerDown(dialog, { target: {}, clientX: 200, clientY: 200 });
    expect(guard.shouldCloseOnClick(dialog, { target: dialog, detail: 1, clientX: 40, clientY: 200 })).toBe(false);

    // Pointer down AND click on backdrop -> closes once, then resets.
    guard.onPointerDown(dialog, { target: dialog, clientX: 40, clientY: 200 });
    expect(guard.shouldCloseOnClick(dialog, { target: dialog, detail: 1, clientX: 40, clientY: 200 })).toBe(true);
    expect(guard.shouldCloseOnClick(dialog, { target: dialog, detail: 1, clientX: 40, clientY: 200 })).toBe(false);

    // Pointer down on backdrop then released inside dialog -> must NOT close.
    guard.onPointerDown(dialog, { target: dialog, clientX: 40, clientY: 200 });
    expect(guard.shouldCloseOnClick(dialog, { target: dialog, detail: 1, clientX: 200, clientY: 200 })).toBe(false);
  });
});
