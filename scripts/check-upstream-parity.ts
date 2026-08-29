import { currentOhStoryFiles, readManifest, upstreamRoot, ohStoryRoot } from "./knowledge-assets.js";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const manifest = await readManifest();
const actualFiles = await currentOhStoryFiles();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
  throw new Error("Bundled knowledge files differ from manifest; run pnpm assets:sync.");
}
const forbiddenPortableAssets = manifest.files.filter(({ path }) =>
  path.includes("/__pycache__/") || path.endsWith(".pyc") || path.endsWith("/.DS_Store")
    || path === "skills/story-setup/scripts/copy-path-safety.py"
    || path === "skills/story/scripts/dashboard-server.mjs"
    || path.startsWith("skills/story-setup/references/antigravity/")
    || path === "skills/story-setup/scripts/deploy-antigravity-skills.py"
    || path === "skills/story-setup/scripts/generate-antigravity-agents.mjs"
    || path === "skills/story-setup/scripts/merge-antigravity-hooks.py");
if (forbiddenPortableAssets.length > 0) {
  throw new Error(`Bundled knowledge retained upstream workspace/platform artifacts: ${forbiddenPortableAssets.map(({ path }) => path).join(", ")}`);
}

const skills = (await readdir(join(ohStoryRoot, "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (skills.length !== 13 || JSON.stringify(skills) !== JSON.stringify(manifest.skills)) {
  throw new Error(`Expected 13 pinned skills, found ${skills.length}.`);
}
const releaseVersion = (await readFile(join(ohStoryRoot, "skills/story/VERSION"), "utf8")).trim();
if (releaseVersion !== manifest.upstream.releaseVersion) {
  throw new Error("Oh Story release version does not match bundled manifest.");
}
const writeSkill = await readFile(join(ohStoryRoot, "skills/story-long-write/SKILL.md"), "utf8");
const agentsVersion = Number(/agents_version:\s*(\d+)/u.exec(writeSkill)?.[1]);
if (!Number.isSafeInteger(agentsVersion) || agentsVersion !== manifest.upstream.agentsVersion) {
  throw new Error("agents_version does not match bundled manifest.");
}

const source = upstreamRoot();
// A neighbouring checkout may intentionally be on a development branch. Only
// compare its HEAD when the caller explicitly selected it as the sync source.
if (process.env.OH_STORY_UPSTREAM_DIR !== undefined && (await stat(source).catch(() => undefined))?.isDirectory()) {
  const { stdout } = await execFileAsync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (stdout.trim() !== manifest.upstream.commit) {
    throw new Error(
      `Upstream commit changed (${manifest.upstream.commit.slice(0, 12)} -> ${stdout.trim().slice(0, 12)}); run pnpm assets:sync.`
    );
  }
}

process.stdout.write(
  `Knowledge parity OK: Oh Story ${releaseVersion}, ${skills.length} bundled skills, ${manifest.roles.length} roles, agents_version ${String(agentsVersion)}.\n`
);
