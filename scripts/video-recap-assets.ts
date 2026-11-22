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

export const videoRecapRoot = join(repoRoot, "packages/knowledge/video-recap");

export interface VideoRecapAssetManifest {
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

export function videoRecapUpstreamRoot(): string {
  return resolve(process.env.VIDEO_RECAP_UPSTREAM_DIR ?? join(repoRoot, "..", "video-recap-skills"));
}

// Upstream ships a standalone local dashboard (0.8.0's read-only review dashboard: zero-server HTML
// builder + local 127.0.0.1 loopback server). The native 视频 tab owns that view in DSH, so the
// dashboard script and its HTML asset stay out.
export const videoRecapPlatformGlue: readonly string[] = [
  "video-recap/scripts/dashboard.py",
  "video-recap/assets/dashboard.html"
];

export async function currentVideoRecapFiles(): Promise<VideoRecapAssetManifest["files"]> {
  return manifestFiles(videoRecapRoot);
}

export async function synchronizeVideoRecapAssets(): Promise<VideoRecapAssetManifest> {
  const source = videoRecapUpstreamRoot();
  if (!(await stat(source).catch(() => undefined))?.isDirectory()) {
    throw new Error(`video-recap-skills upstream not found: ${source}. Set VIDEO_RECAP_UPSTREAM_DIR.`);
  }
  await rm(videoRecapRoot, { recursive: true, force: true });
  await mkdir(videoRecapRoot, { recursive: true });
  const sourceSkills = join(source, "skills");
  await cp(sourceSkills, join(videoRecapRoot, "skills"), {
    recursive: true,
    dereference: false,
    filter: (path) => isPortableSourceAsset(path)
      && !matchesExcludedPrefix(portableRelative(sourceSkills, path), videoRecapPlatformGlue)
  });
  for (const file of ["LICENSE", "README.md", "README_EN.md", "CHANGELOG.md"]) {
    await cp(join(source, file), join(videoRecapRoot, file));
  }
  const plugin = JSON.parse(await readFile(join(source, ".claude-plugin/plugin.json"), "utf8")) as { readonly version?: unknown };
  const skills = (await readdir(join(videoRecapRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const manifest: VideoRecapAssetManifest = {
    schemaVersion: 1,
    upstream: {
      repository: await git(source, "remote", "get-url", "origin"),
      commit: await git(source, "rev-parse", "HEAD"),
      releaseVersion: typeof plugin.version === "string" ? plugin.version : "unknown"
    },
    generatedAt: new Date().toISOString(),
    skills,
    files: await currentVideoRecapFiles()
  };
  await writeFile(join(videoRecapRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readVideoRecapManifest(): Promise<VideoRecapAssetManifest> {
  return JSON.parse(await readFile(join(videoRecapRoot, "manifest.json"), "utf8")) as VideoRecapAssetManifest;
}
