import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const dramaRoot = join(repoRoot, "packages/knowledge/drama");

export interface DramaAssetManifest {
  readonly schemaVersion: 1;
  readonly upstream: { readonly repository: string; readonly commit: string };
  readonly generatedAt: string;
  readonly skills: readonly string[];
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export function dramaUpstreamRoot(): string {
  return resolve(process.env.DRAMA_SKILLS_UPSTREAM_DIR ?? join(repoRoot, "..", "drama-skills"));
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

export async function currentDramaFiles(): Promise<DramaAssetManifest["files"]> {
  return Promise.all((await regularFiles(dramaRoot))
    .filter((path) => basename(path) !== "manifest.json")
    .map(async (path) => ({ path: portableRelative(dramaRoot, path), ...await fileDigest(path) })));
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
    filter: (path) => {
      const normalized = path.split(sep).join("/");
      const bundledPath = portableRelative(sourceSkills, path);
      return !normalized.includes("/__pycache__/")
        && !normalized.endsWith("/__pycache__")
        && !normalized.endsWith(".pyc")
        && !normalized.endsWith("/.DS_Store")
        && bundledPath !== "short-drama/scripts/dashboard_server.py"
        && !bundledPath.startsWith("short-drama/assets/dashboard/");
    }
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
