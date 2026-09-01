import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One packaged smoke pass captures every workbench, so a single run renders all
 * four demos; naming a workbench only narrows which GIFs get written.
 */
const demos = {
  story: "docs/images/story-workbench-demo.gif",
  drama: "docs/images/drama-workbench-demo.gif",
  game: "docs/images/game-workbench-demo.gif",
  video: "docs/images/video-workbench-demo.gif"
} as const;

type Workbench = keyof typeof demos;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requested = process.argv[2];
const names = Object.keys(demos) as readonly Workbench[];
if (requested !== "all" && !names.includes(requested as Workbench)) {
  throw new Error(`Usage: render-workbench-demo.ts <${[...names, "all"].join("|")}>`);
}
const targets = requested === "all" ? names : [requested as Workbench];

/**
 * Demos ship the real model's voice, so a paid provider is the default. Set
 * OH_STORY_DEMO_MOCK=1 to re-render the surfaces from the deterministic
 * fixtures instead — useful for checking the pipeline without spending a key.
 */
const useMock = process.env.OH_STORY_DEMO_MOCK === "1";
if (!useMock && process.env.DEEPSEEK_API_KEY === undefined) {
  throw new Error("Rendering demos calls the real provider: set DEEPSEEK_API_KEY, or OH_STORY_DEMO_MOCK=1 for fixture output.");
}

const frames = await mkdtemp(join(tmpdir(), `oh-story-dsh-${requested}-demo-`));

function run(command: string, args: readonly string[], env = process.env): void {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}`);
}

try {
  run("pnpm", ["test:dsh"], {
    ...process.env,
    OH_STORY_DEMO_FRAMES_DIR: frames,
    ...useMock ? {} : { OH_STORY_DEMO_USE_REAL_DEEPSEEK: "1" }
  });
  for (const target of targets) {
    const output = resolve(repositoryRoot, demos[target]);
    run("ffmpeg", [
      "-v", "error",
      "-framerate", "1/2",
      "-start_number", "1",
      "-i", join(frames, `${target}-%02d.png`),
      "-filter_complex",
      "scale=1200:-2:flags=lanczos,split[original][palette];[palette]palettegen=max_colors=128:stats_mode=diff[p];[original][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
      "-loop", "0",
      "-y",
      output
    ]);
    process.stdout.write(`Rendered ${output}\n`);
  }
} finally {
  await rm(frames, { recursive: true, force: true });
}
