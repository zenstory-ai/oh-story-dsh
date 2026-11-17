import { describe, expect, it } from "vitest";
import {
  hasCreativeProject,
  readWelcomeGuidePreference,
  readWorkbenchPreference,
  resolveWelcomeGuideEnabled,
  resolveWorkbenchOpen,
  WELCOME_GUIDE_STORAGE_KEY,
  workbenchPreferenceKey,
  writeWelcomeGuidePreference,
  writeWorkbenchPreference,
  type WorkbenchPreferenceStorage
} from "../src/client/workbench-presence.js";

function storage(entries: Record<string, string> = {}): WorkbenchPreferenceStorage & { readonly entries: Record<string, string> } {
  return {
    entries,
    getItem: (key) => entries[key] ?? null,
    setItem: (key, value) => { entries[key] = value; }
  };
}

function workspace(overrides: Partial<Parameters<typeof hasCreativeProject>[0]> = {}) {
  return { files: [], games: [], videos: [], ...overrides } as NonNullable<Parameters<typeof hasCreativeProject>[0]>;
}

describe("creative project presence", () => {
  it("treats an unloaded workspace as having nothing to show", () => {
    expect(hasCreativeProject(undefined)).toBe(false);
  });

  it("recognizes creative files, workspace games and video projects", () => {
    expect(hasCreativeProject(workspace({ files: [{ path: "正文/第001章.md" }] }))).toBe(true);
    expect(hasCreativeProject(workspace({ games: [{ id: "letter" }] }))).toBe(true);
    expect(hasCreativeProject(workspace({ videos: [{ id: "recap" }] }))).toBe(true);
  });
});

describe("workbench open state", () => {
  it("follows the workspace when the creator has not chosen", () => {
    expect(resolveWorkbenchOpen(undefined, true)).toBe(true);
    expect(resolveWorkbenchOpen(undefined, false)).toBe(false);
  });

  it("keeps an explicit choice against what the workspace contains", () => {
    expect(resolveWorkbenchOpen("closed", true)).toBe(false);
    expect(resolveWorkbenchOpen("open", false)).toBe(true);
  });
});

describe("workbench preference storage", () => {
  it("keeps one choice per workspace", () => {
    const store = storage();
    writeWorkbenchPreference(store, "/work/novel", "closed");
    writeWorkbenchPreference(store, "/work/drama", "open");

    expect(store.entries[workbenchPreferenceKey("/work/novel")]).toBe("closed");
    expect(readWorkbenchPreference(store, "/work/novel")).toBe("closed");
    expect(readWorkbenchPreference(store, "/work/drama")).toBe("open");
    expect(readWorkbenchPreference(store, "/work/unknown")).toBeUndefined();
  });

  it("ignores an unusable storage, an unknown workspace and foreign values", () => {
    const refusing: WorkbenchPreferenceStorage = {
      getItem: () => { throw new Error("site data is blocked"); },
      setItem: () => { throw new Error("site data is blocked"); }
    };
    expect(readWorkbenchPreference(refusing, "/work/novel")).toBeUndefined();
    expect(() => { writeWorkbenchPreference(refusing, "/work/novel", "closed"); }).not.toThrow();
    expect(readWorkbenchPreference(undefined, "/work/novel")).toBeUndefined();
    expect(readWorkbenchPreference(storage(), undefined)).toBeUndefined();
    expect(readWorkbenchPreference(storage({ [workbenchPreferenceKey("/work/novel")]: "maybe" }), "/work/novel")).toBeUndefined();
  });
});

describe("welcome guide preference and resolution", () => {
  it("stays hidden while Host settings are still loading so disabled configs never flash", () => {
    expect(resolveWelcomeGuideEnabled({
      formStatus: "loading",
      hostValue: true,
      writable: true,
      optimisticValue: undefined,
      localPreference: "open",
      workspaceWelcomeGuide: true
    })).toBe(false);
    expect(resolveWelcomeGuideEnabled({
      formStatus: "absent",
      hostValue: undefined,
      writable: false,
      optimisticValue: undefined,
      localPreference: undefined,
      workspaceWelcomeGuide: undefined
    })).toBe(false);
  });

  it("treats writable Host profile settings as authoritative over stale browser storage", () => {
    expect(resolveWelcomeGuideEnabled({
      formStatus: "ready",
      hostValue: false,
      writable: true,
      optimisticValue: undefined,
      localPreference: "open",
      workspaceWelcomeGuide: true
    })).toBe(false);
    expect(resolveWelcomeGuideEnabled({
      formStatus: "ready",
      hostValue: true,
      writable: true,
      optimisticValue: undefined,
      localPreference: "closed",
      workspaceWelcomeGuide: false
    })).toBe(true);
    expect(resolveWelcomeGuideEnabled({
      formStatus: "ready",
      hostValue: undefined,
      writable: true,
      optimisticValue: undefined,
      localPreference: undefined
    })).toBe(true);
  });

  it("honors read-only Host disables and persists browser fallback choices on profileless hosts", () => {
    const store = storage();
    expect(readWelcomeGuidePreference(store)).toBeUndefined();
    writeWelcomeGuidePreference(store, false);
    expect(store.entries[WELCOME_GUIDE_STORAGE_KEY]).toBe("closed");
    expect(readWelcomeGuidePreference(store)).toBe("closed");

    expect(resolveWelcomeGuideEnabled({
      formStatus: "unavailable",
      hostValue: undefined,
      writable: false,
      optimisticValue: undefined,
      localPreference: readWelcomeGuidePreference(store),
      workspaceWelcomeGuide: true
    })).toBe(false);

    writeWelcomeGuidePreference(store, true);
    expect(resolveWelcomeGuideEnabled({
      formStatus: "unavailable",
      hostValue: undefined,
      writable: false,
      optimisticValue: undefined,
      localPreference: readWelcomeGuidePreference(store),
      workspaceWelcomeGuide: true
    })).toBe(true);

    expect(resolveWelcomeGuideEnabled({
      formStatus: "ready",
      hostValue: false,
      writable: false,
      optimisticValue: undefined,
      localPreference: "open",
      workspaceWelcomeGuide: true
    })).toBe(false);
  });

  it("never affects workbench presence for workspaces that already contain creative files", () => {
    const novelWorkspace = workspace({ files: [{ path: "正文/第001章.md" }] });
    expect(hasCreativeProject(novelWorkspace)).toBe(true);
    expect(resolveWorkbenchOpen(undefined, hasCreativeProject(novelWorkspace))).toBe(true);
  });
});
