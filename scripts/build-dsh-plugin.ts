import { spawnSync } from "node:child_process";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { build, transform, type Plugin } from "esbuild";

import { isLocalArtifactPath } from "../packages/dsh-plugin/build-path-policy.js";
import { matchesExcludedPrefix } from "./asset-sync-utils.js";
import { dramaPlatformGlue, dramaRoot } from "./drama-assets.js";
import { ohStoryPlatformGlue, ohStoryRoot } from "./knowledge-assets.js";
import { novelToGameRoot } from "./novel-to-game-assets.js";
import { videoRecapPlatformGlue, videoRecapRoot } from "./video-recap-assets.js";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages/dsh-plugin");
const outputRoot = resolve(packageRoot, "lib");
const ohStoryBundleExcluded = [
  "skills/story-long-scan/scripts/",
  "skills/story-short-scan/scripts/",
  ...ohStoryPlatformGlue
    .filter((entry) => entry !== "story-long-analyze.zip")
    .map((entry) => `skills/${entry}`)
];
const dramaBundleExcluded = dramaPlatformGlue.map((entry) => `skills/${entry}`);
const videoRecapBundleExcluded = videoRecapPlatformGlue.map((entry) => `skills/${entry}`);

const inlineCss: Plugin = {
  name: "inline-css",
  setup(builder) {
    builder.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -"?inline".length)),
      namespace: "inline-css"
    }));
    builder.onLoad({ filter: /.*/, namespace: "inline-css" }, async (args) => {
      const raw = await readFile(args.path, "utf8");
      const minified = await transform(raw, { loader: "css", minify: true, target: ["chrome120", "safari17"] });
      return {
        contents: minified.code,
        loader: "text"
      };
    });
  }
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

// Emit a single minified external stylesheet for the workbench + tool cards so Wave 2b
// can serve it via `/api/oh-story/workbench.css` (and `/oh-story/workbench.css`) instead of
// inlining ~135 KB of CSS into `lib/client.js`.
const workbenchCssFiles = [
  resolve(packageRoot, "src/client/plugin.css"),
  resolve(packageRoot, "src/client/game-canvas.css"),
  resolve(packageRoot, "src/client/video-studio.css"),
  resolve(packageRoot, "src/client/tool-card.css")
];
const rawWorkbenchCss = (await Promise.all(workbenchCssFiles.map((file) => readFile(file, "utf8")))).join("\n");
const minifiedWorkbenchCss = await transform(rawWorkbenchCss, {
  loader: "css",
  minify: true,
  target: ["chrome120", "safari17"]
});
if (minifiedWorkbenchCss.code.trim() === "") {
  throw new Error("Minified workbench.css asset is unexpectedly empty.");
}
await writeFile(resolve(outputRoot, "workbench.css"), minifiedWorkbenchCss.code, "utf8");

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: resolve(outputRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  treeShaking: true,
  packages: "bundle",
  external: ["@deepseek-ai/*"]
});

const hostEntry = resolve(outputRoot, "index.js");
await writeFile(hostEntry, (await readFile(hostEntry, "utf8")).replace(/[\t ]+$/gmu, ""));

await build({
  entryPoints: [resolve(packageRoot, "src/client/index.tsx")],
  outfile: resolve(outputRoot, "client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["chrome120", "safari17"],
  charset: "utf8",
  sourcemap: true,
  treeShaking: true,
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  external: ["@deepseek-ai/*", "react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  plugins: [inlineCss],
  banner: { js: "window.__ModuleLoader__.load({id:\"@oh-story/dsh\",factory:(require)=>{var module={exports:{}};var exports=module.exports;" },
  footer: { js: ";return module.exports;}});" }
});

/**
 * Bytecode, Finder metadata and local agent state (`.omc/`, `.omx/`, gitignored) that a checkout
 * accumulates next to the pinned assets. The copies below take whole directories, so ignored files
 * would otherwise reach the tarball.
 */
await cp(ohStoryRoot, resolve(outputRoot, "oh-story"), {
  recursive: true,
  filter: (source) => {
    const bundledPath = relative(ohStoryRoot, source).replaceAll("\\", "/");
    return !isLocalArtifactPath(ohStoryRoot, source)
      && !matchesExcludedPrefix(bundledPath, ohStoryBundleExcluded);
  }
});

await cp(dramaRoot, resolve(outputRoot, "drama"), {
  recursive: true,
  filter: (source) => {
    const bundledPath = relative(dramaRoot, source).replaceAll("\\", "/");
    return !isLocalArtifactPath(dramaRoot, source)
      && !matchesExcludedPrefix(bundledPath, dramaBundleExcluded);
  }
});

await cp(novelToGameRoot, resolve(outputRoot, "novel-to-game"), {
  recursive: true,
  filter: (source) => !isLocalArtifactPath(novelToGameRoot, source)
});

await cp(videoRecapRoot, resolve(outputRoot, "video-recap"), {
  recursive: true,
  filter: (source) => {
    const bundledPath = relative(videoRecapRoot, source).replaceAll("\\", "/");
    return !isLocalArtifactPath(videoRecapRoot, source)
      && !matchesExcludedPrefix(bundledPath, videoRecapBundleExcluded);
  }
});

// The plugin's own package.json declares "type": "module", which would make Node load every
// bundled upstream .js script (require-based checkers such as check-outline-contract.js) as ESM
// and fail. Upstream installs them with no enclosing package type, so give each knowledge root
// a package.json without "type": Node's default resolution then matches the upstream install.
for (const knowledgeRoot of ["oh-story", "drama", "novel-to-game", "video-recap"]) {
  await writeFile(resolve(outputRoot, knowledgeRoot, "package.json"),
    `${JSON.stringify({ private: true, description: "Bundled upstream Skills; no module type so scripts resolve as in an upstream install." }, null, 2)}\n`);
}
// A require-based checker must load as CommonJS from the bundle: it prints its JSON verdict for a
// missing outline file instead of failing to load.
const outlineCheck = spawnSync(process.execPath, [
  resolve(outputRoot, "oh-story/skills/story-long-write/scripts/check-outline-contract.js"), "--json", resolve(outputRoot, "missing-outline.md")
], { encoding: "utf8" });
if (!outlineCheck.stdout.includes("story-long-write.outline-contract")) {
  throw new Error(`Bundled CommonJS checker failed to load: ${outlineCheck.stderr.slice(0, 300)}`);
}

for (const excluded of [
  ...ohStoryBundleExcluded.map((entry) => `oh-story/${entry.replace(/\/$/u, "")}`),
  ...dramaPlatformGlue.map((entry) => `drama/skills/${entry.replace(/\/$/u, "")}`),
  ...videoRecapPlatformGlue.map((entry) => `video-recap/skills/${entry.replace(/\/$/u, "")}`)
]) {
  const present = await access(resolve(outputRoot, excluded)).then(() => true, () => false);
  if (present) throw new Error(`Release bundle retained excluded platform/scraper code: ${excluded}`);
}

const hostBundle = await readFile(hostEntry, "utf8");
for (const forbidden of ["dsh-sdk-jsonrpc", "DeepSeekHarness", "FakeRuntimeAdapter", "NativeDshRuntimeAdapter", "EventSource"]) {
  if (hostBundle.includes(forbidden)) {
    throw new Error(`Native DSH plugin bundle retained forbidden parallel runtime code: ${forbidden}`);
  }
}

const clientEntry = resolve(outputRoot, "client.js");
const clientBundle = await readFile(clientEntry, "utf8");
for (const forbidden of ["react-dom.development", "react.development", "process.env.NODE_ENV"]) {
  if (clientBundle.includes(forbidden)) {
    throw new Error(`Browser bundle retained development runtime code: ${forbidden}`);
  }
}
const clientBytes = Buffer.byteLength(clientBundle);
if (clientBytes > 400_000) {
  throw new Error(`Browser bundle exceeds the 400 KB release budget: ${String(clientBytes)} bytes`);
}
