/**
 * DSH is a general Harness: one installed plugin must not turn every Session
 * into a writing surface. The workbench claims the conversation layout only for
 * a workspace that actually holds creative work, and the creator can always
 * take the layout back.
 */

export type WorkbenchPreference = "open" | "closed";

export interface WorkbenchWorkspace {
  readonly files: readonly unknown[];
  readonly games: readonly unknown[];
  readonly videos: readonly unknown[];
}

export interface WorkbenchPreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function hasCreativeProject(workspace: WorkbenchWorkspace | undefined): boolean {
  if (workspace === undefined) return false;
  return workspace.files.length > 0
    || workspace.videos.length > 0
    || workspace.games.length > 0;
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

export const WELCOME_GUIDE_STORAGE_KEY = "oh-story.welcome-guide";

export type WelcomeConfigFormStatus = "absent" | "loading" | "ready" | "unavailable";

export interface WelcomeGuideResolutionInput {
  readonly formStatus: WelcomeConfigFormStatus;
  readonly hostValue: boolean | undefined;
  readonly writable: boolean;
  readonly optimisticValue: boolean | undefined;
  readonly localPreference: WorkbenchPreference | undefined;
  readonly workspaceWelcomeGuide?: boolean | undefined;
}

export function readWelcomeGuidePreference(storage: WorkbenchPreferenceStorage | undefined): WorkbenchPreference | undefined {
  if (storage === undefined) return undefined;
  let value: string | null;
  try { value = storage.getItem(WELCOME_GUIDE_STORAGE_KEY); }
  catch { return undefined; }
  return value === "open" || value === "closed" ? value : undefined;
}

export function writeWelcomeGuidePreference(storage: WorkbenchPreferenceStorage | undefined, enabled: boolean): void {
  if (storage === undefined) return;
  try { storage.setItem(WELCOME_GUIDE_STORAGE_KEY, enabled ? "open" : "closed"); }
  catch { /* in-memory state keeps the choice when site data is blocked */ }
}

/**
 * Resolve whether the blank-session welcome guide may appear:
 * - Wait while the Host settings form is still loading so `welcomeGuide: false` never flashes.
 * - When DSH's profile settings form is ready and writable, its `welcomeGuide` value is authoritative.
 * - On read-only or profileless hosts, honor static Host `welcomeGuide: false`, then browser storage.
 */
export function resolveWelcomeGuideEnabled(input: WelcomeGuideResolutionInput): boolean {
  if (input.optimisticValue !== undefined) return input.optimisticValue;
  if (input.formStatus === "loading") return false;
  if (input.formStatus === "ready" && input.writable) return input.hostValue !== false;
  if (input.hostValue === false || input.workspaceWelcomeGuide === false) return false;
  if (input.localPreference !== undefined) return input.localPreference === "open";
  if (input.hostValue === undefined && input.workspaceWelcomeGuide === undefined) return false;
  return true;
}
