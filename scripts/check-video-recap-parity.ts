import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  currentVideoRecapFiles,
  readVideoRecapManifest,
  videoRecapPlatformGlue,
  videoRecapRoot,
  videoRecapUpstreamRoot
} from "./video-recap-assets.js";

const execFileAsync = promisify(execFile);
const manifest = await readVideoRecapManifest();
const actualFiles = await currentVideoRecapFiles();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
  throw new Error("Bundled video-recap-skills files differ from manifest; run pnpm assets:sync:video.");
}

// 0.7.0 merges the six production Skills into one self-contained video-recap; video-reference stays
// a separate on-demand Skill ("1 + 1").
const expectedSkills = ["video-recap", "video-reference"];
const skills = (await readdir(join(videoRecapRoot, "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(skills) !== JSON.stringify(expectedSkills) || JSON.stringify(skills) !== JSON.stringify(manifest.skills)) {
  throw new Error(`Expected video-recap plus video-reference, found ${skills.join(", ") || "none"}.`);
}
for (const required of [
  "skills/video-recap/scripts/recap.py",
  "skills/video-recap/scripts/recap_inspect.py",
  "skills/video-recap/scripts/doctor.py",
  "skills/video-recap/scripts/understand.py",
  "skills/video-recap/scripts/cut.py",
  "skills/video-recap/scripts/voiceover.py",
  "skills/video-recap/scripts/assemble.py",
  "skills/video-recap/scripts/final_qc.py",
  "skills/video-recap/scripts/validate.py",
  "skills/video-recap/scripts/library.py",
  "skills/video-reference/SKILL.md",
  "skills/video-reference/references/reference-schema.md",
  "skills/video-reference/scripts/reference.py"
]) {
  if (!manifest.files.some((entry) => entry.path === required)) throw new Error(`Bundled video-recap asset is missing ${required}.`);
}
const finalQc = await readFile(join(videoRecapRoot, "skills/video-recap/scripts/final_qc.py"), "utf8");
if (!/^SCHEMA_VERSION = 2$/mu.test(finalQc)) {
  throw new Error("Bundled final_qc.py no longer emits the v0.6.1 schema_version 2 contract.");
}
const narrationValidator = await readFile(join(videoRecapRoot, "skills/video-recap/scripts/validate.py"), "utf8");
if (!narrationValidator.includes("Validation never rewrites the agent's text, timing, order or metadata.")) {
  throw new Error("Bundled narration validator no longer carries the v0.6.1 lint-only contract.");
}
for (const glue of videoRecapPlatformGlue) {
  const forbidden = `skills/${glue}`;
  if (manifest.files.some(({ path }) => path === forbidden.replace(/\/$/u, "") || path.startsWith(forbidden))) {
    throw new Error(`Bundled video-recap assets retained standalone dashboard content ${forbidden}.`);
  }
}
if (manifest.files.some(({ path }) => path.includes("/__pycache__/") || path.endsWith(".pyc") || path.endsWith("/.DS_Store"))) {
  throw new Error("Bundled video-recap assets retained upstream workspace artifacts.");
}

const source = videoRecapUpstreamRoot();
if (process.env.VIDEO_RECAP_UPSTREAM_DIR !== undefined && (await stat(source).catch(() => undefined))?.isDirectory()) {
  const { stdout } = await execFileAsync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (stdout.trim() !== manifest.upstream.commit) throw new Error("video-recap-skills upstream commit differs from the pinned manifest.");
  const plugin = JSON.parse(await readFile(join(source, ".claude-plugin/plugin.json"), "utf8")) as { readonly version?: unknown };
  if (plugin.version !== manifest.upstream.releaseVersion) throw new Error("video-recap-skills release version differs from the pinned manifest.");
}

process.stdout.write(
  `video-recap parity OK: ${manifest.upstream.releaseVersion}, video-recap + video-reference at ${manifest.upstream.commit.slice(0, 12)}.\n`
);
