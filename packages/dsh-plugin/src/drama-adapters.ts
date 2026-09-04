import { createHash } from "node:crypto";
import { access, lstat, mkdir, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Drama Skills generates no media by itself and neither does DeepSeek: every
 * image, video, or music result comes from a provider adapter that
 * `short-drama-produce` runs through `production_tool.py run --adapter-config`.
 * Upstream deliberately leaves that config file and its credentials outside
 * every project. This module names the bundled adapters, registers them for the
 * current DSH host so the Agent has a file to pass, and reports which host
 * environment variables are present — never their values.
 */
export type DramaAdapterModality = "image" | "video" | "music";

export interface DramaAdapterSpec {
  /** Adapter id used both in the config file and in a job's `adapter` field. */
  readonly name: string;
  readonly label: string;
  readonly modality: DramaAdapterModality;
  /** Host environment variables the bundled adapter refuses to run without. */
  readonly requiredEnv: readonly string[];
  readonly optionalEnv: readonly string[];
  readonly timeoutSeconds: number;
  /** Provider reference shipped with the Skill, relative to the drama skill root. */
  readonly reference: string;
}

export interface DramaAdapterStatus {
  readonly name: string;
  readonly label: string;
  readonly modality: DramaAdapterModality;
  readonly configured: boolean;
  readonly missing: readonly string[];
}

export interface DramaAdapterConfigLocation {
  readonly path: string;
  /** True when the plugin writes the file; false when the creator points at their own. */
  readonly generated: boolean;
}

/** Point at a creator-owned adapter config instead of the generated one. */
export const DRAMA_ADAPTER_CONFIG_ENV = "OH_STORY_DRAMA_ADAPTER_CONFIG";

const PROVIDER_SCRIPT = "short-drama-produce/scripts/provider_adapters.py";

export const DRAMA_ADAPTERS: readonly DramaAdapterSpec[] = [
  {
    name: "gpt-image-2",
    label: "GPT Image 2",
    modality: "image",
    requiredEnv: ["OPENAI_API_KEY"],
    optionalEnv: ["OPENAI_BASE_URL"],
    timeoutSeconds: 600,
    reference: "short-drama-produce/references/providers/gpt-image-2.md"
  },
  {
    name: "seedance",
    label: "Seedance",
    modality: "video",
    requiredEnv: ["ARK_API_KEY", "SEEDANCE_MODEL"],
    optionalEnv: ["SEEDANCE_BASE_URL", "SEEDANCE_ALLOWED_RATIOS", "SEEDANCE_MIN_DURATION", "SEEDANCE_MAX_DURATION"],
    timeoutSeconds: 3_600,
    reference: "short-drama-produce/references/providers/seedance.md"
  },
  {
    name: "minimax-h3",
    label: "MiniMax H3",
    modality: "video",
    requiredEnv: ["MINIMAX_API_KEY", "MINIMAX_VIDEO_MODEL", "MINIMAX_VIDEO_RESOLUTIONS"],
    optionalEnv: ["MINIMAX_VIDEO_BASE_URL", "MINIMAX_VIDEO_RATIOS", "MINIMAX_VIDEO_MIN_DURATION", "MINIMAX_VIDEO_MAX_DURATION"],
    timeoutSeconds: 3_600,
    reference: "short-drama-produce/references/providers/minimax-h3-video.md"
  },
  {
    name: "minimax-music",
    label: "MiniMax Music",
    modality: "music",
    requiredEnv: ["MINIMAX_API_KEY"],
    optionalEnv: ["MINIMAX_BASE_URL"],
    timeoutSeconds: 600,
    reference: "short-drama-produce/references/providers/minimax-music.md"
  }
];

/** Directory owned by this user: `/tmp` is world-writable on Linux, so the name carries the uid. */
function generatedDirectory(temporaryRoot: string): string {
  const uid = process.getuid?.();
  return join(temporaryRoot, uid === undefined ? "oh-story-dsh" : `oh-story-dsh-${String(uid)}`);
}

/**
 * The generated file is keyed by the skill root so two DSH profiles running
 * different plugin installs never overwrite each other's registration.
 */
export function dramaAdapterConfigPath(skillRoot: string, env: NodeJS.ProcessEnv = process.env, temporaryRoot = tmpdir()): DramaAdapterConfigLocation {
  const custom = env[DRAMA_ADAPTER_CONFIG_ENV] ?? "";
  if (custom !== "") return { path: resolve(custom), generated: false };
  const key = createHash("sha256").update(resolve(skillRoot)).digest("hex").slice(0, 12);
  return { path: join(generatedDirectory(temporaryRoot), `drama-adapters-${key}.json`), generated: true };
}

/**
 * The file's content becomes an argv that `production_tool.py` executes, so it
 * is written only into a directory this process owns: a pre-existing directory
 * that belongs to someone else, or a symlink, is refused rather than reused.
 */
async function privateDirectory(path: string): Promise<boolean> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory()) return false;
  const uid = process.getuid?.();
  return uid === undefined || info.uid === uid;
}

/** The upstream adapter-config document: argv commands and timeouts only, never credentials. */
export function dramaAdapterConfigDocument(skillRoot: string, python = "python3"): { readonly adapters: Record<string, { readonly command: readonly string[]; readonly timeout_seconds: number }> } {
  const script = resolve(skillRoot, PROVIDER_SCRIPT);
  const adapters: Record<string, { readonly command: readonly string[]; readonly timeout_seconds: number }> = {};
  for (const adapter of DRAMA_ADAPTERS) {
    adapters[adapter.name] = { command: [python, script, adapter.name], timeout_seconds: adapter.timeoutSeconds };
  }
  return { adapters };
}

/**
 * Register the bundled adapters for this host. A creator-owned config is left
 * untouched and only checked for existence.
 */
export async function ensureDramaAdapterConfig(
  skillRoot: string,
  options: { readonly python?: string; readonly env?: NodeJS.ProcessEnv; readonly temporaryRoot?: string } = {}
): Promise<DramaAdapterConfigLocation & { readonly ok: boolean }> {
  const location = dramaAdapterConfigPath(skillRoot, options.env ?? process.env, options.temporaryRoot ?? tmpdir());
  if (!location.generated) {
    return { ...location, ok: await access(location.path).then(() => true, () => false) };
  }
  try {
    if (!(await privateDirectory(dirname(location.path)))) return { ...location, ok: false };
    const existing = await lstat(location.path).catch(() => undefined);
    if (existing !== undefined && !existing.isFile()) return { ...location, ok: false };
    // Temp file + rename: a reader never sees a truncated document.
    const staging = `${location.path}.${String(process.pid)}.tmp`;
    await writeFile(staging, `${JSON.stringify(dramaAdapterConfigDocument(skillRoot, options.python ?? "python3"), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(staging, location.path);
    return { ...location, ok: true };
  } catch {
    return { ...location, ok: false };
  }
}

/** Presence only: a variable counts as configured when it is set and non-empty. */
export function dramaAdapterStatuses(env: NodeJS.ProcessEnv = process.env): DramaAdapterStatus[] {
  return DRAMA_ADAPTERS.map((adapter) => {
    const missing = adapter.requiredEnv.filter((name) => (env[name] ?? "") === "");
    return { name: adapter.name, label: adapter.label, modality: adapter.modality, configured: missing.length === 0, missing };
  });
}

/** One line per adapter for Skill text: `gpt-image-2 (image: OPENAI_API_KEY)`. */
export function dramaAdapterSummary(): string {
  return DRAMA_ADAPTERS.map((adapter) => `${adapter.name} (${adapter.modality}: ${adapter.requiredEnv.join(" + ")})`).join(", ");
}
