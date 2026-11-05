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

function isPortableSourceAsset(path: string): boolean {
  const normalized = path.split(sep).join("/");
  // A local checkout can hold ignored agent state (.omc/) next to tracked files; never ship it.
  return !normalized.includes("/.omc/")
    && !normalized.endsWith("/.omc")
    && !normalized.includes("/__pycache__/")
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
