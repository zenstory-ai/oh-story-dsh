/**
 * DSH is a general Harness: one installed plugin must not turn every Session
 * into a writing surface. The workbench claims the conversation layout only for
 * a workspace that actually holds creative work, and the creator can always
 * take the layout back.
 */

export type WorkbenchPreference = "open" | "closed";

export interface WorkbenchWorkspace {
  readonly files: readonly unknown[];
  readonly games: readonly { readonly source: "workspace" | "example" }[];
  readonly videos: readonly unknown[];
}

export interface WorkbenchPreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** The bundled game example ships with the plugin, so it never marks a workspace as creative. */
export function hasCreativeProject(workspace: WorkbenchWorkspace | undefined): boolean {
  if (workspace === undefined) return false;
  return workspace.files.length > 0
    || workspace.videos.length > 0
    || workspace.games.some((game) => game.source === "workspace");
}

/** An explicit creator choice always wins over what the workspace happens to contain. */
export function resolveWorkbenchOpen(preference: WorkbenchPreference | undefined, creativeProject: boolean): boolean {
  return preference === undefined ? creativeProject : preference === "open";
}

export function workbenchPreferenceKey(cwd: string): string {
  return `oh-story.workbench.${cwd}`;
}

/** The DSH Session Store is not persisted, so the choice is kept per workspace instead. */
export function readWorkbenchPreference(storage: WorkbenchPreferenceStorage | undefined, cwd: string | undefined): WorkbenchPreference | undefined {
  if (storage === undefined || cwd === undefined) return undefined;
  let value: string | null;
  try { value = storage.getItem(workbenchPreferenceKey(cwd)); }
  catch { return undefined; }
  return value === "open" || value === "closed" ? value : undefined;
}

export function writeWorkbenchPreference(storage: WorkbenchPreferenceStorage | undefined, cwd: string | undefined, preference: WorkbenchPreference): void {
  if (storage === undefined || cwd === undefined) return;
  // Private windows and blocked site data refuse to persist; the Session still keeps the choice.
  try { storage.setItem(workbenchPreferenceKey(cwd), preference); }
  catch { /* the Session Store remains the in-session authority */ }
}

/** Reading the property itself throws when the browser blocks site data. */
export function workbenchPreferenceStorage(): WorkbenchPreferenceStorage | undefined {
  try { return globalThis.localStorage; }
  catch { return undefined; }
}
