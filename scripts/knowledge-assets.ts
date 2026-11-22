import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  git,
  isPortableSourceAsset,
  manifestFiles,
  matchesExcludedPrefix,
  portableRelative,
  repoRoot,
  type ManifestFileEntry
} from "./asset-sync-utils.js";

export const ohStoryRoot = join(repoRoot, "packages/knowledge/oh-story");
export const ohStoryPlatformGlue = [
  // Ignored local backup, not an upstream runtime asset.
  "story-long-analyze.zip",
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
  "story-setup/references/deploy-antigravity.md",
  "story-setup/references/deploy-claude-code.md",
  "story-setup/references/deploy-codex.md",
  "story-setup/references/deploy-generic.md",
  "story-setup/references/deploy-openclaw.md",
  "story-setup/references/deploy-opencode.md",
  "story-setup/references/deploy-reasonix.md",
  "story-setup/references/deploy-zcode.md",
  "story-setup/scripts/deploy-antigravity-skills.js",
  "story-setup/scripts/generate-antigravity-agents.mjs",
  "story-setup/scripts/merge-hooks.js",
  // Oh Story 0.9.0+ merges managed blocks into host CLAUDE.md/AGENTS.md; DSH replaces deployment.
  "story-setup/scripts/merge-project-instructions.js",
  "story-setup/scripts/copy-path-safety.js",
  "story-setup/UPGRADING.md"
] as const;

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
  readonly files: readonly ManifestFileEntry[];
}

export function upstreamRoot(): string {
  return resolve(process.env.OH_STORY_UPSTREAM_DIR ?? join(repoRoot, "..", "oh-story-claudecode"));
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
  return {
    schemaVersion: 2,
    upstream: { repository, commit, releaseVersion, agentsVersion },
    generatedAt,
    skills,
    roles,
    files: await manifestFiles(ohStoryRoot)
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
  const sourceSkills = join(source, "skills");
  await cp(sourceSkills, join(ohStoryRoot, "skills"), {
    recursive: true,
    dereference: false,
    filter: (path) => isPortableSourceAsset(path)
      && !matchesExcludedPrefix(portableRelative(sourceSkills, path), ohStoryPlatformGlue)
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
  return manifestFiles(ohStoryRoot);
}
