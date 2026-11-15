import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  git,
  isPortableSourceAsset,
  manifestFiles,
  matchesExcludedPrefix,
  portableRelative,
  repoRoot,
  type ManifestFileEntry
} from "./asset-sync-utils.js";

export const dramaRoot = join(repoRoot, "packages/knowledge/drama");

export const dramaPlatformGlue = [
  "short-drama/scripts/dashboard_server.py",
  // 创作台 v2 (0.8.0) view models, imported only by dashboard_server.py.
  "short-drama/scripts/creator_views.py",
  "short-drama/assets/dashboard/"
] as const;

export interface DramaAssetManifest {
  readonly schemaVersion: 1;
  readonly upstream: { readonly repository: string; readonly commit: string };
  readonly generatedAt: string;
  readonly skills: readonly string[];
  readonly files: readonly ManifestFileEntry[];
}

export function dramaUpstreamRoot(): string {
  return resolve(process.env.DRAMA_SKILLS_UPSTREAM_DIR ?? join(repoRoot, "..", "drama-skills"));
}

export async function currentDramaFiles(): Promise<DramaAssetManifest["files"]> {
  return manifestFiles(dramaRoot);
}

export async function synchronizeDramaAssets(): Promise<DramaAssetManifest> {
  const source = dramaUpstreamRoot();
  if (!(await stat(source).catch(() => undefined))?.isDirectory()) {
    throw new Error(`Drama Skills upstream not found: ${source}. Set DRAMA_SKILLS_UPSTREAM_DIR.`);
  }
  await rm(dramaRoot, { recursive: true, force: true });
  await mkdir(dramaRoot, { recursive: true });
  const sourceSkills = join(source, "skills");
  await cp(sourceSkills, join(dramaRoot, "skills"), {
    recursive: true,
    dereference: false,
    filter: (path) => isPortableSourceAsset(path)
      && !matchesExcludedPrefix(portableRelative(sourceSkills, path), dramaPlatformGlue)
  });
  await cp(join(source, "LICENSE"), join(dramaRoot, "LICENSE.upstream"));
  const skills = (await readdir(join(dramaRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const manifest: DramaAssetManifest = {
    schemaVersion: 1,
    upstream: {
      repository: await git(source, "remote", "get-url", "origin"),
      commit: await git(source, "rev-parse", "HEAD")
    },
    generatedAt: new Date().toISOString(),
    skills,
    files: await currentDramaFiles()
  };
  await writeFile(join(dramaRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readDramaManifest(): Promise<DramaAssetManifest> {
  return JSON.parse(await readFile(join(dramaRoot, "manifest.json"), "utf8")) as DramaAssetManifest;
}
