import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { currentDramaFiles, dramaRoot, dramaUpstreamRoot, readDramaManifest } from "./drama-assets.js";

const execFileAsync = promisify(execFile);

async function dramaPython(): Promise<string> {
  const candidates = process.env.DRAMA_PYTHON === undefined
    ? (process.platform === "win32" ? ["python", "python3"] : ["python3", "python"])
    : [process.env.DRAMA_PYTHON];
  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["-c", "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)"], { encoding: "utf8" });
      return candidate;
    } catch (error) {
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Drama Skills selftests require Python 3 (override with DRAMA_PYTHON). Tried: ${failures.join("; ")}`);
}
const manifest = await readDramaManifest();
const actualFiles = await currentDramaFiles();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
  throw new Error("Bundled Drama Skills files differ from manifest; run pnpm assets:sync:drama.");
}
if (manifest.skills.length !== 10 || !manifest.skills.every((name) => name === "short-drama" || name.startsWith("short-drama-"))) {
  throw new Error(`Expected 10 pinned Drama Skills, found ${String(manifest.skills.length)}.`);
}
const paths = new Set(manifest.files.map(({ path }) => path));
for (const required of [
  "skills/short-drama/references/creator-documents.md",
  "skills/short-drama-storyboard/references/comic-keyframe-lexicon.md"
]) {
  if (!paths.has(required)) throw new Error(`Bundled Drama Skills are missing the v0.6 contract asset ${required}.`);
}
for (const forbidden of [
  "skills/short-drama/references/lifecycle-commands.md",
  "skills/short-drama/scripts/dashboard_server.py"
]) {
  if (paths.has(forbidden)) throw new Error(`Bundled Drama Skills retained incompatible runtime content ${forbidden}.`);
}
if (manifest.files.some(({ path }) => path.includes("/__pycache__/") || path.endsWith(".pyc") || path.endsWith("/.DS_Store"))) {
  throw new Error("Bundled Drama Skills retained upstream workspace artifacts.");
}
const routeSkill = await readFile(join(dramaRoot, "skills/short-drama/SKILL.md"), "utf8");
for (const document of ["剧本.md", "视觉设定.md", "分镜.md", "图片提示词.md", "视频提示词.md"]) {
  if (!routeSkill.includes(document)) throw new Error(`Drama v0.6 route no longer declares ${document}.`);
}
const reviewSkill = await readFile(join(dramaRoot, "skills/short-drama-review/SKILL.md"), "utf8");
if (!reviewSkill.includes("审查/EP001-审查.md")) throw new Error("Drama v0.6 review Markdown contract is missing.");
const produceSkill = await readFile(join(dramaRoot, "skills/short-drama-produce/SKILL.md"), "utf8");
if (!produceSkill.includes("剧集/<EP>/制作成果/")) throw new Error("Drama v0.6 production output contract is missing.");
const fixtureSources = JSON.parse(await readFile(join(import.meta.dirname, "demo-fixtures/sources.json"), "utf8")) as {
  readonly fixtures: readonly {
    readonly kind: string;
    readonly commit: string;
    readonly sourcePath: string;
    readonly localPath: string;
    readonly files?: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
  }[];
};
const dramaFixture = fixtureSources.fixtures.find((fixture) => fixture.kind === "drama");
if (dramaFixture === undefined || dramaFixture.commit !== manifest.upstream.commit || dramaFixture.files === undefined) {
  throw new Error("Drama demo fixture provenance is missing or does not match the pinned upstream commit.");
}
const fixtureRoot = join(import.meta.dirname, "demo-fixtures", dramaFixture.localPath);
const fixtureFiles = (await readdir(fixtureRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(fixtureFiles) !== JSON.stringify(dramaFixture.files.map(({ path }) => path).sort())) {
  throw new Error("Drama demo fixture files differ from their recorded provenance.");
}
for (const expected of dramaFixture.files) {
  const bytes = await readFile(join(fixtureRoot, expected.path));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error(`Drama demo fixture ${expected.path} differs from its recorded upstream content.`);
  }
}
const selftests = manifest.files
  .map(({ path }) => path)
  .filter((path) => path.endsWith("/scripts/selftest.py"));
if (selftests.length !== manifest.skills.length) {
  throw new Error(`Expected one Drama selftest per Skill, found ${String(selftests.length)}.`);
}
const python = await dramaPython();
for (const selftest of selftests) {
  await execFileAsync(python, ["-B", join(dramaRoot, selftest)], {
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
}
const source = dramaUpstreamRoot();
if (process.env.DRAMA_SKILLS_UPSTREAM_DIR !== undefined && (await stat(source).catch(() => undefined))?.isDirectory()) {
  const { stdout } = await execFileAsync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (stdout.trim() !== manifest.upstream.commit) throw new Error("Drama Skills upstream commit differs from the pinned manifest.");
  for (const expected of dramaFixture.files) {
    const upstream = await readFile(join(source, dramaFixture.sourcePath, expected.path));
    const local = await readFile(join(fixtureRoot, expected.path));
    if (!upstream.equals(local)) throw new Error(`Drama demo fixture ${expected.path} differs from the pinned upstream example.`);
  }
}
process.stdout.write(`Drama parity OK: ${String(manifest.skills.length)} bundled skills and selftests at ${manifest.upstream.commit.slice(0, 12)}.\n`);
