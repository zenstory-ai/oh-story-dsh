import type { WorkbenchMode } from "./file-activity.js";
import type { WorkbenchPreferenceStorage } from "./workbench-presence.js";

export const WORKBENCH_MODES = ["story", "drama", "game", "video"] as const satisfies readonly WorkbenchMode[];

/** Keep canonical order and a reachable navigation even after invalid site data. */
export function visibleWorkbenchModes(value: unknown): readonly WorkbenchMode[] {
  if (!Array.isArray(value)) return WORKBENCH_MODES;
  const modes = WORKBENCH_MODES.filter((mode) => value.includes(mode));
  return modes.length > 0 ? modes : WORKBENCH_MODES;
}

export function resolveVisibleWorkbench(current: WorkbenchMode, modes: readonly WorkbenchMode[]): WorkbenchMode {
  return modes.includes(current) ? current : modes[0] ?? "story";
}

export function workbenchModesKey(cwd: string): string {
  return `oh-story.workbench-modes.${cwd}`;
}

export function readWorkbenchModes(storage: WorkbenchPreferenceStorage | undefined, cwd: string | undefined): readonly WorkbenchMode[] {
  if (storage === undefined || cwd === undefined) return WORKBENCH_MODES;
  try {
    const value = storage.getItem(workbenchModesKey(cwd));
    return visibleWorkbenchModes(value === null ? undefined : JSON.parse(value) as unknown);
  } catch { return WORKBENCH_MODES; }
}

export function writeWorkbenchModes(storage: WorkbenchPreferenceStorage | undefined, cwd: string | undefined, modes: readonly WorkbenchMode[]): void {
  if (storage === undefined || cwd === undefined) return;
  try { storage.setItem(workbenchModesKey(cwd), JSON.stringify(visibleWorkbenchModes(modes))); }
  catch { /* The workspace store keeps the choice in page memory when site storage is blocked. */ }
}

/** One page-lifetime snapshot per workspace, not one restored preference per Session. */
export function createWorkbenchModesStore(storage: WorkbenchPreferenceStorage | undefined) {
  const values = new Map<string, readonly WorkbenchMode[]>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    get(cwd: string | undefined): readonly WorkbenchMode[] {
      if (cwd === undefined) return WORKBENCH_MODES;
      let modes = values.get(cwd);
      if (modes === undefined) {
        modes = readWorkbenchModes(storage, cwd);
        values.set(cwd, modes);
      }
      return modes;
    },
    set(cwd: string | undefined, modes: readonly WorkbenchMode[]): void {
      if (cwd === undefined) return;
      const next = visibleWorkbenchModes(modes);
      values.set(cwd, next);
      writeWorkbenchModes(storage, cwd, next);
      listeners.get(cwd)?.forEach((notify) => { notify(); });
    },
    subscribe(cwd: string | undefined, notify: () => void): () => void {
      if (cwd === undefined) return () => {};
      let subscribers = listeners.get(cwd);
      if (subscribers === undefined) {
        subscribers = new Set();
        listeners.set(cwd, subscribers);
      }
      subscribers.add(notify);
      return () => { subscribers.delete(notify); };
    }
  };
}
