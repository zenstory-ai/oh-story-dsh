import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export function videoRecapUpstreamRoot(): string {
  return resolve(process.env.VIDEO_RECAP_UPSTREAM_DIR ?? join(repoRoot, "..", "video-recap-skills"));
}

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return stdout.trim();
}

async function regularFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
    }
  };
  await visit(root);
  return output.sort();
}

async function fileDigest(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
  const bytes = await readFile(path);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
}

export async function currentVideoRecapFiles(): Promise<VideoRecapAssetManifest["files"]> {
  return Promise.all((await regularFiles(videoRecapRoot))
    .filter(portableSourceAsset)
    .filter((path) => basename(path) !== "manifest.json")
    .map(async (path) => ({ path: portableRelative(videoRecapRoot, path), ...await fileDigest(path) })));
}

function portableSourceAsset(path: string): boolean {
  const normalized = path.split(sep).join("/");
  return !normalized.includes("/__pycache__/")
    && !normalized.endsWith("/__pycache__")
    && !normalized.endsWith(".pyc")
    && !normalized.endsWith("/.DS_Store");
}

export async function synchronizeVideoRecapAssets(): Promise<VideoRecapAssetManifest> {
  const source = videoRecapUpstreamRoot();
  if (!(await stat(source).catch(() => undefined))?.isDirectory()) {
    throw new Error(`video-recap-skills upstream not found: ${source}. Set VIDEO_RECAP_UPSTREAM_DIR.`);
  }
  await rm(videoRecapRoot, { recursive: true, force: true });
  await mkdir(videoRecapRoot, { recursive: true });
  await cp(join(source, "skills"), join(videoRecapRoot, "skills"), {
    recursive: true,
    dereference: false,
    filter: portableSourceAsset
  });
  for (const file of ["LICENSE", "README.md", "README.en.md", "CHANGELOG.md"]) {
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
