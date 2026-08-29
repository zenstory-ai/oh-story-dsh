import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  currentNovelToGameFiles,
  novelToGameRoot,
  novelToGameUpstreamRoot,
  readNovelToGameManifest
} from "./novel-to-game-assets.js";

const execFileAsync = promisify(execFile);
const manifest = await readNovelToGameManifest();
const actualFiles = await currentNovelToGameFiles();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
  throw new Error("Bundled NovelToGame files differ from manifest; run pnpm assets:sync:game.");
}

const expectedSkills = [
  "game-art-direction",
  "game-build",
  "game-concept",
  "game-qa",
  "game-world-design",
  "novel-game-analyze",
  "novel-to-game"
];
const skills = (await readdir(join(novelToGameRoot, "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(skills) !== JSON.stringify(expectedSkills) || JSON.stringify(skills) !== JSON.stringify(manifest.skills)) {
  throw new Error(`Expected the complete seven-Skill NovelToGame pipeline, found ${String(skills.length)}.`);
}
if ((await readFile(join(novelToGameRoot, "VERSION"), "utf8")).trim() !== manifest.upstream.releaseVersion) {
  throw new Error("NovelToGame release version does not match the bundled manifest.");
}
for (const required of [
  "skills/novel-to-game/references/pipeline-contract.md",
  "skills/game-build/references/playable-model-contract.md",
  "skills/game-qa/references/qa-contract.md",
  "examples/jin-ping-mei/example.json",
  "examples/jin-ping-mei/build/app/index.html",
  "examples/jin-ping-mei/qa/verification.json"
]) {
  if (!manifest.files.some((entry) => entry.path === required)) throw new Error(`Bundled NovelToGame asset is missing ${required}.`);
}
// The Game Studio serves build/app/** and reads example.json plus qa/verification.json. Upstream
// authoring material is deliberately not shipped to plugin users; keep it out of the tarball.
const authoringOnly = manifest.files.filter(({ path }) => /^examples\/[^/]+\/(?:source|analysis|concepts|design|screenshots|qa\/evidence)\//u.test(path)
  || /^examples\/[^/]+\/(?:_progress\.md|PRODUCT_BRIEF\.md)$/u.test(path));
if (authoringOnly.length > 0) {
  throw new Error(`Bundled NovelToGame example retained upstream authoring material: ${authoringOnly.map(({ path }) => path).join(", ")}`);
}
if (manifest.files.some(({ path }) => path.includes("/__pycache__/") || path.endsWith(".pyc") || path.endsWith("/.DS_Store"))) {
  throw new Error("Bundled NovelToGame assets retained upstream workspace artifacts.");
}
const verification = JSON.parse(await readFile(join(novelToGameRoot, "examples/jin-ping-mei/qa/verification.json"), "utf8")) as {
  readonly status?: string;
  readonly checks?: Record<string, string>;
};
const checkNames = Object.keys(verification.checks ?? {}).sort();
if (verification.status !== "PASS"
  || JSON.stringify(checkNames) !== JSON.stringify(["coreLoop", "input", "launch", "outcome", "render", "restart"])
  || Object.values(verification.checks ?? {}).some((status) => status !== "PASS")) {
  throw new Error("Bundled Jin Ping Mei example no longer carries the six-item PASS verification contract.");
}

const source = novelToGameUpstreamRoot();
if (process.env.NOVEL_TO_GAME_UPSTREAM_DIR !== undefined && (await stat(source).catch(() => undefined))?.isDirectory()) {
  const { stdout } = await execFileAsync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (stdout.trim() !== manifest.upstream.commit) throw new Error("NovelToGame upstream commit differs from the pinned manifest.");
}

process.stdout.write(
  `NovelToGame parity OK: ${manifest.upstream.releaseVersion}, ${String(skills.length)} Skills, Jin Ping Mei playable example at ${manifest.upstream.commit.slice(0, 12)}.\n`
);
