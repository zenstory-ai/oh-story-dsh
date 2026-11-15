import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { git, isPortableSourceAsset, manifestFiles, repoRoot, type ManifestFileEntry } from "./asset-sync-utils.js";

export const novelToGameRoot = join(repoRoot, "packages/knowledge/novel-to-game");

export interface NovelToGameAssetManifest {
  readonly schemaVersion: 1;
  readonly upstream: {
    readonly repository: string;
    readonly commit: string;
    readonly releaseVersion: string;
  };
  readonly generatedAt: string;
  readonly skills: readonly string[];
  readonly files: readonly ManifestFileEntry[];
}

export function novelToGameUpstreamRoot(): string {
  return resolve(process.env.NOVEL_TO_GAME_UPSTREAM_DIR ?? join(repoRoot, "..", "novel-to-game"));
}

export async function currentNovelToGameFiles(): Promise<NovelToGameAssetManifest["files"]> {
  return manifestFiles(novelToGameRoot);
}

export async function synchronizeNovelToGameAssets(): Promise<NovelToGameAssetManifest> {
  const source = novelToGameUpstreamRoot();
  if (!(await stat(source).catch(() => undefined))?.isDirectory()) {
    throw new Error(`NovelToGame upstream not found: ${source}. Set NOVEL_TO_GAME_UPSTREAM_DIR.`);
  }
  await rm(novelToGameRoot, { recursive: true, force: true });
  await mkdir(novelToGameRoot, { recursive: true });
  await cp(join(source, "skills"), join(novelToGameRoot, "skills"), {
    recursive: true,
    dereference: false,
    filter: isPortableSourceAsset
  });
  // Upstream's example games are not bundled: they are built products (0.7.0's interactive film alone
  // is ~100 MB) and the Skills never read them. Plugin users make their own projects.
  for (const file of ["LICENSE", "README.md", "README_ZH.md", "VERSION"]) {
    await cp(join(source, file), join(novelToGameRoot, file));
  }
  const skills = (await readdir(join(novelToGameRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const manifest: NovelToGameAssetManifest = {
    schemaVersion: 1,
    upstream: {
      repository: await git(source, "remote", "get-url", "origin"),
      commit: await git(source, "rev-parse", "HEAD"),
      releaseVersion: (await readFile(join(source, "VERSION"), "utf8")).trim()
    },
    generatedAt: new Date().toISOString(),
    skills,
    files: await currentNovelToGameFiles()
  };
  await writeFile(join(novelToGameRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readNovelToGameManifest(): Promise<NovelToGameAssetManifest> {
  return JSON.parse(await readFile(join(novelToGameRoot, "manifest.json"), "utf8")) as NovelToGameAssetManifest;
}
