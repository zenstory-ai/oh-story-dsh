import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  readonly examples: readonly string[];
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export function novelToGameUpstreamRoot(): string {
  return resolve(process.env.NOVEL_TO_GAME_UPSTREAM_DIR ?? join(repoRoot, "..", "novel-to-game"));
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

export async function currentNovelToGameFiles(): Promise<NovelToGameAssetManifest["files"]> {
  return Promise.all((await regularFiles(novelToGameRoot))
    .filter((path) => basename(path) !== "manifest.json")
    .map(async (path) => ({ path: portableRelative(novelToGameRoot, path), ...await fileDigest(path) })));
}

/**
 * Authoring provenance the Game Studio never reads. The product serves examples/<name>/build/app/**
 * and reads example.json plus qa/verification.json; everything below is upstream working material
 * that would otherwise ship to every plugin user (source/ alone is the 2MB public-domain novel).
 */
const exampleAuthoringOnly = [
  "source/",
  "analysis/",
  "concepts/",
  "design/",
  "screenshots/",
  "qa/evidence/",
  "_progress.md",
  "PRODUCT_BRIEF.md"
] as const;

function isPortableExampleAsset(bundledPath: string): boolean {
  return !exampleAuthoringOnly.some((entry) => bundledPath === entry.replace(/\/$/u, "") || bundledPath.startsWith(entry));
}

function isPortableSourceAsset(path: string): boolean {
  const normalized = path.split(sep).join("/");
  return !normalized.includes("/__pycache__/")
    && !normalized.endsWith("/__pycache__")
    && !normalized.endsWith(".pyc")
    && !normalized.endsWith("/.DS_Store");
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
  await mkdir(join(novelToGameRoot, "examples"), { recursive: true });
  const sourceExample = join(source, "examples/jin-ping-mei");
  await cp(sourceExample, join(novelToGameRoot, "examples/jin-ping-mei"), {
    recursive: true,
    dereference: false,
    filter: (path) => isPortableSourceAsset(path) && isPortableExampleAsset(portableRelative(sourceExample, path))
  });
  for (const file of ["LICENSE", "README.md", "README_ZH.md", "VERSION"]) {
    await cp(join(source, file), join(novelToGameRoot, file));
  }
  const skills = (await readdir(join(novelToGameRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const examples = (await readdir(join(novelToGameRoot, "examples"), { withFileTypes: true }))
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
    examples,
    files: await currentNovelToGameFiles()
  };
  await writeFile(join(novelToGameRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readNovelToGameManifest(): Promise<NovelToGameAssetManifest> {
  return JSON.parse(await readFile(join(novelToGameRoot, "manifest.json"), "utf8")) as NovelToGameAssetManifest;
}
