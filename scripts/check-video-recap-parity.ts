import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  currentVideoRecapFiles,
  readVideoRecapManifest,
  videoRecapRoot,
  videoRecapUpstreamRoot
} from "./video-recap-assets.js";

const execFileAsync = promisify(execFile);
const manifest = await readVideoRecapManifest();
const actualFiles = await currentVideoRecapFiles();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
  throw new Error("Bundled video-recap-skills files differ from manifest; run pnpm assets:sync:video.");
}

const expectedSkills = [
  "video-assemble",
  "video-cut",
  "video-recap",
  "video-script",
  "video-understanding",
  "video-voiceover"
];
const skills = (await readdir(join(videoRecapRoot, "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(skills) !== JSON.stringify(expectedSkills) || JSON.stringify(skills) !== JSON.stringify(manifest.skills)) {
  throw new Error(`Expected the complete six-Skill video-recap pipeline, found ${String(skills.length)}.`);
}
for (const required of [
  "skills/video-recap/scripts/recap.py",
  "skills/video-recap/scripts/recap_inspect.py",
  "skills/video-understanding/scripts/understand.py",
  "skills/video-cut/scripts/cut.py",
  "skills/video-voiceover/scripts/voiceover.py",
  "skills/video-assemble/scripts/assemble.py"
]) {
  if (!manifest.files.some((entry) => entry.path === required)) throw new Error(`Bundled video-recap asset is missing ${required}.`);
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
  `video-recap parity OK: ${manifest.upstream.releaseVersion}, ${String(skills.length)} Skills at ${manifest.upstream.commit.slice(0, 12)}.\n`
);
