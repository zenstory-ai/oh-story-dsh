import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export const ohStoryRoot = join(repoRoot, "packages/knowledge/oh-story");
export const generatedRoot = join(repoRoot, "packages/knowledge/generated");
const platformGlue = [
  "story/assets/",
  "story/scripts/dashboard-server.mjs",
  "browser-cdp/scripts/setup-cdp-chrome.js",
  "story-setup/references/antigravity/",
  "story-setup/references/codex/",
  "story-setup/references/generic/",
  "story-setup/references/openclaw/",
  "story-setup/references/opencode/",
  "story-setup/references/reasonix/",
  "story-setup/references/templates/",
  "story-setup/references/zcode/",
  "story-setup/scripts/deploy-antigravity-skills.py",
  "story-setup/scripts/generate-antigravity-agents.mjs",
  "story-setup/scripts/merge-antigravity-hooks.py",
  "story-setup/scripts/merge-claude-settings.py",
  "story-setup/scripts/merge-codex-hooks.py",
  "story-setup/scripts/copy-path-safety.py",
  "story-setup/UPGRADING.md"
] as const;

function isPortableSourceAsset(path: string): boolean {
  const normalized = path.split(sep).join("/");
  return !normalized.includes("/__pycache__/")
    && !normalized.endsWith("/__pycache__")
    && !normalized.endsWith(".pyc")
    && !normalized.endsWith("/.DS_Store");
}

export interface AssetManifest {
  readonly schemaVersion: 2;
  readonly upstream: {
    readonly repository: string;
    readonly commit: string;
    readonly releaseVersion: string;
    readonly agentsVersion: number;
  };
  readonly generatedAt: string;
  readonly skills: readonly string[];
  readonly roles: readonly string[];
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
}

export function upstreamRoot(): string {
  return resolve(process.env.OH_STORY_UPSTREAM_DIR ?? join(repoRoot, "..", "oh-story-claudecode"));
}

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return stdout.trim();
}

async function regularFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
    }
  }
  await visit(root);
  return output.sort();
}

async function fileDigest(path: string): Promise<{ sha256: string; bytes: number }> {
  const bytes = await readFile(path);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
}

export async function buildManifest(root: string, generatedAt: string): Promise<AssetManifest> {
  const skillRoot = join(root, "skills");
  const rolesRoot = join(root, "skills/story-setup/references/templates/agents");
  const skills = (await readdir(skillRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const roles = (await readdir(rolesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => basename(entry.name, ".md"))
    .sort();
  const releaseVersion = (await readFile(join(root, "skills/story/VERSION"), "utf8")).trim();
  const writeSkill = await readFile(join(root, "skills/story-long-write/SKILL.md"), "utf8");
  const agentsVersionMatch = /agents_version:\s*(\d+)/u.exec(writeSkill);
  if (agentsVersionMatch?.[1] === undefined) {
    throw new Error("Unable to locate the upstream agents_version contract.");
  }
  const agentsVersion = Number(agentsVersionMatch[1]);
  const commit = await git(root, "rev-parse", "HEAD");
  const repository = await git(root, "remote", "get-url", "origin");
  const files = await Promise.all((await regularFiles(ohStoryRoot))
    .filter((path) => basename(path) !== "manifest.json")
    .map(async (path) => ({ path: portableRelative(ohStoryRoot, path), ...await fileDigest(path) })));
  return {
    schemaVersion: 2,
    upstream: { repository, commit, releaseVersion, agentsVersion },
    generatedAt,
    skills,
    roles,
    files
  };
}

export async function synchronizeAssets(): Promise<AssetManifest> {
  const source = upstreamRoot();
  const sourceStats = await stat(source).catch(() => undefined);
  if (!sourceStats?.isDirectory()) {
    throw new Error(`Oh Story upstream not found: ${source}. Set OH_STORY_UPSTREAM_DIR.`);
  }
  await rm(ohStoryRoot, { recursive: true, force: true });
  await mkdir(ohStoryRoot, { recursive: true });
  await mkdir(generatedRoot, { recursive: true });
  const sourceSkills = join(source, "skills");
  await cp(sourceSkills, join(ohStoryRoot, "skills"), {
    recursive: true,
    dereference: false,
    filter: (path) => {
      const bundledPath = portableRelative(sourceSkills, path);
      return isPortableSourceAsset(path)
        && !platformGlue.some((entry) => bundledPath === entry.replace(/\/$/u, "") || bundledPath.startsWith(entry));
    }
  });
  await cp(join(source, "skills/story-setup/references/templates/agents"), join(ohStoryRoot, "roles"), { recursive: true });
  await cp(join(source, "LICENSE"), join(ohStoryRoot, "LICENSE.upstream"));
  const generatedAt = new Date().toISOString();
  const manifest = await buildManifest(source, generatedAt);
  await writeFile(join(ohStoryRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readManifest(): Promise<AssetManifest> {
  return JSON.parse(await readFile(join(ohStoryRoot, "manifest.json"), "utf8")) as AssetManifest;
}

export async function currentOhStoryFiles(): Promise<AssetManifest["files"]> {
  const files = await regularFiles(ohStoryRoot);
  return Promise.all(files
    .filter((path) => basename(path) !== "manifest.json")
    .map(async (path) => ({ path: portableRelative(ohStoryRoot, path), ...await fileDigest(path) })));
}
