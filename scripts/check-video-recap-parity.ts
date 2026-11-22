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
  "skills/video-recap/SKILL.md",
  "skills/video-recap/references/timeline-schema.md",
  "skills/video-recap/references/editorial-craft.md",
  "skills/video-recap/references/remote-services.md",
  "skills/video-recap/scripts/probe.py",
  "skills/video-recap/scripts/frames.py",
  "skills/video-recap/scripts/transcribe.py",
  "skills/video-recap/scripts/tts.py",
  "skills/video-recap/scripts/render.py",
  "skills/video-recap/scripts/check.py",
  "skills/video-recap/scripts/packaging.py",
  "skills/video-recap/scripts/export_jianying.py",
  "skills/video-recap/scripts/library.py",
  "skills/video-reference/SKILL.md",
  "skills/video-reference/scripts/analyze_reference.py"
]) {
  if (!manifest.files.some((entry) => entry.path === required)) throw new Error(`Bundled video-recap asset is missing ${required}.`);
}
const timelineSchema = await readFile(join(videoRecapRoot, "skills/video-recap/references/timeline-schema.md"), "utf8");
if (!timelineSchema.includes('"schema_version": 3') || !timelineSchema.includes("review_hints")) {
  throw new Error("Bundled timeline-schema.md no longer carries the v0.8.0 timeline v3 / check.json review_hints contract.");
}
const checkScript = await readFile(join(videoRecapRoot, "skills/video-recap/scripts/check.py"), "utf8");
if (!checkScript.includes("review_hints")) {
  throw new Error("Bundled check.py no longer emits v0.8.0 review_hints.");
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
