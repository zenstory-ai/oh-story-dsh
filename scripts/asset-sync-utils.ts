import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface ManifestFileEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export function isPortableSourceAsset(path: string): boolean {
  const normalized = path.split(sep).join("/");
  // Local checkouts can accumulate bytecode, Finder metadata, or ignored agent state next to tracked files.
  return !normalized.includes("/.omc/")
    && !normalized.endsWith("/.omc")
    && !normalized.includes("/.omx/")
    && !normalized.endsWith("/.omx")
    && !normalized.includes("/__pycache__/")
    && !normalized.endsWith("/__pycache__")
    && !normalized.endsWith(".pyc")
    && !normalized.endsWith("/.DS_Store");
}

export function matchesExcludedPrefix(bundledPath: string, excluded: readonly string[]): boolean {
  return excluded.some((entry) => bundledPath === entry.replace(/\/$/u, "") || bundledPath.startsWith(entry));
}

export async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return stdout.trim();
}

export async function regularFiles(root: string): Promise<string[]> {
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

export async function fileDigest(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
  const bytes = await readFile(path);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
}

export async function manifestFiles(root: string): Promise<readonly ManifestFileEntry[]> {
  return Promise.all((await regularFiles(root))
    .filter((path) => basename(path) !== "manifest.json")
    .map(async (path) => ({ path: portableRelative(root, path), ...await fileDigest(path) })));
}
