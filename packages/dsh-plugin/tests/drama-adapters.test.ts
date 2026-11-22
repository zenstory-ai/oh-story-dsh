import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  DRAMA_ADAPTER_ALIASES,
  DRAMA_ADAPTER_CONFIG_ENV,
  DRAMA_ADAPTERS,
  dramaAdapterConfigDocument,
  dramaAdapterConfigPath,
  dramaAdapterStatuses,
  dramaAdapterSummary,
  ensureDramaAdapterConfig
} from "../src/drama-adapters.js";
import { DRAMA_PYTHON, hostPython, VIDEO_PYTHON } from "../src/host-python.js";
import { createDramaSkillProvider } from "../src/skill-provider.js";

const execFileAsync = promisify(execFile);

const dramaRoot = resolve(import.meta.dirname, "../../knowledge/drama/skills");
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function bundledDramaScripts(): Promise<{ readonly path: string; readonly source: string }[]> {
  const paths = (await readdir(dramaRoot, { recursive: true })).filter((path) => path.endsWith(".py"));
  return Promise.all(paths.map(async (path) => ({ path, source: await readFile(join(dramaRoot, path), "utf8") })));
}

function providerSection(document: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`^## ${escaped}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "mu").exec(document);
  if (match?.[1] === undefined) throw new Error(`Missing provider section: ${heading}`);
  return match[1];
}

describe("bundled Drama media adapters", () => {
  it("names exactly the adapters the pinned upstream provider script accepts", async () => {
    const script = await readFile(join(dramaRoot, "short-drama-produce/scripts/provider_adapters.py"), "utf8");
    const choices = /choices=\(([^)]*)\)/u.exec(script)?.[1]?.match(/"([^"]+)"/gu)?.map((entry) => entry.replaceAll('"', ""));
    const expected = [...DRAMA_ADAPTERS.map((adapter) => adapter.name), ...Object.keys(DRAMA_ADAPTER_ALIASES)].sort();
    expect(choices?.sort()).toEqual(expected);
  });

  it("documents each required and optional environment variable in the pinned upstream provider reference", async () => {
    for (const adapter of DRAMA_ADAPTERS) {
      const section = providerSection(await readFile(join(dramaRoot, adapter.reference), "utf8"), adapter.referenceHeading);
      for (const name of [...adapter.requiredEnv, ...adapter.optionalEnv]) expect(section, `${adapter.name} ${name}`).toContain(`\`${name}\``);
    }
  });

  it("requires and allows exactly the environment each pinned upstream provider section lists", async () => {
    const envName = /`([A-Z][A-Z0-9]*_[A-Z0-9_]+)`/gu;
    for (const adapter of DRAMA_ADAPTERS) {
      const section = providerSection(await readFile(join(dramaRoot, adapter.reference), "utf8"), adapter.referenceHeading);
      const requiredLine = /^- \*\*必填环境变量\*\*：([^\r\n]+)/mu.exec(section)?.[1];
      const optionalLine = /^- \*\*可选环境变量\*\*：([^\r\n]+)/mu.exec(section)?.[1];
      const combinedLine = /^- \*\*环境变量\*\*：([^\r\n]+)/mu.exec(section)?.[1];
      // Drama 0.13.0 documents `parameters.model` OR `<PROVIDER>_MODEL` inline on the same bullet;
      // treat env vars preceded by `parameters.model` 或 as optional (since parameters.model satisfies them).
      const modelEnv = (line: string | undefined): Set<string> => new Set(
        [...(line ?? "").matchAll(/`parameters\.model`\s*或\s*`([A-Z][A-Z0-9]*_[A-Z0-9_]+)`/gu)].map((match) => match[1]!)
      );
      const requiredModelFallback = modelEnv(requiredLine);
      const combinedModelFallback = modelEnv(combinedLine);
      const required = requiredLine === undefined
        ? [...(combinedLine ?? "").matchAll(/`([A-Z][A-Z0-9]*_[A-Z0-9_]+)`（必填）/gu)].map((match) => match[1]!)
        : [...requiredLine.matchAll(envName)].map((match) => match[1]!).filter((name) => !requiredModelFallback.has(name));
      const optional = optionalLine === undefined
        ? [...[...(combinedLine ?? "").matchAll(/`([A-Z][A-Z0-9]*_[A-Z0-9_]+)`（可选/gu)].map((match) => match[1]!), ...combinedModelFallback]
        : [...[...optionalLine.matchAll(envName)].map((match) => match[1]!), ...requiredModelFallback];
      expect(required.sort(), `${adapter.name} required`).toEqual([...adapter.requiredEnv].sort());
      expect(optional.sort(), `${adapter.name} optional`).toEqual([...adapter.optionalEnv].sort());
    }
  });

  it("takes each adapter's timeout and job modality from its pinned upstream provider reference", async () => {
    for (const adapter of DRAMA_ADAPTERS) {
      const section = providerSection(await readFile(join(dramaRoot, adapter.reference), "utf8"), adapter.referenceHeading);
      const command = /\{"command": \[[^\]]*"([^"]+)"\], "timeout_seconds": (\d+)\}/u.exec(section);
      expect(command?.slice(1), adapter.name).toEqual([adapter.name, String(adapter.timeoutSeconds)]);
      const modality = /`modality` 为 `([a-z]+)`/u.exec(section);
      expect(modality?.[1], adapter.name).toBe(adapter.modality);
    }
  });

  it("registers MiniMax Speech as the tts adapter in the generated config and the Skill summary", () => {
    expect(DRAMA_ADAPTERS.find((adapter) => adapter.name === "minimax-speech")).toMatchObject({ label: "MiniMax Speech", modality: "tts" });
    expect(dramaAdapterConfigDocument(dramaRoot, "python").adapters["minimax-speech"]).toEqual({
      command: ["python", resolve(dramaRoot, "short-drama-produce/scripts/provider_adapters.py"), "minimax-speech"],
      timeout_seconds: 600
    });
    expect(dramaAdapterSummary()).toContain("minimax-speech (tts: MINIMAX_API_KEY)");
  });

  it("writes an upstream-shaped adapter config that points at the bundled script and carries no credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapters-"));
    temporary.push(root);
    const location = await ensureDramaAdapterConfig(dramaRoot, { python: "python", env: {}, temporaryRoot: root });
    expect(location).toEqual({ path: dramaAdapterConfigPath(dramaRoot, {}, root).path, generated: true, ok: true });
    // Compare segments, not separators: Windows joins with backslashes and has no uid.
    expect(basename(dirname(location.path))).toMatch(/^oh-story-dsh(?:-\d+)?$/u);
    expect(basename(location.path)).toMatch(/^drama-adapters-[0-9a-f]{12}\.json$/u);
    expect(dramaAdapterConfigPath(join(root, "elsewhere"), {}, root).path).not.toBe(location.path);
    const written = JSON.parse(await readFile(location.path, "utf8")) as ReturnType<typeof dramaAdapterConfigDocument>;
    expect(written).toEqual(dramaAdapterConfigDocument(dramaRoot, "python"));
    expect(written.adapters["seedance"]).toEqual({ command: ["python", resolve(dramaRoot, "short-drama-produce/scripts/provider_adapters.py"), "seedance"], timeout_seconds: 3_600 });
    expect(JSON.stringify(written)).not.toContain("reference_roles");
    expect(JSON.stringify(written)).not.toMatch(/key|token|secret/iu);
  });

  it("leaves a creator-owned config untouched and only reports whether it exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapters-"));
    temporary.push(root);
    const custom = join(root, "mine.json");
    expect(dramaAdapterConfigPath(dramaRoot, { [DRAMA_ADAPTER_CONFIG_ENV]: custom }, root)).toEqual({ path: custom, generated: false });
    expect(await ensureDramaAdapterConfig(dramaRoot, { env: { [DRAMA_ADAPTER_CONFIG_ENV]: custom }, temporaryRoot: root })).toEqual({ path: custom, generated: false, ok: false });
    const document = '{"adapters":{"seedance":{"command":["python","adapter.py"],"timeout_seconds":10,"reference_roles":["reference_audio"]}}}\n';
    await writeFile(custom, document);
    expect(await ensureDramaAdapterConfig(dramaRoot, { env: { [DRAMA_ADAPTER_CONFIG_ENV]: custom }, temporaryRoot: root })).toEqual({ path: custom, generated: false, ok: true });
    expect(await readFile(custom, "utf8")).toBe(document);
  });

  it("admits built-in video reference_audio by default while requiring explicit reference_roles on custom adapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapter-roles-"));
    temporary.push(root);
    const project = join(root, "project");
    await mkdir(project);
    const builtin = join(root, "builtin.json");
    const customUndeclared = join(root, "custom-undeclared.json");
    const customDeclared = join(root, "custom-declared.json");
    await writeFile(builtin, JSON.stringify(dramaAdapterConfigDocument(dramaRoot, "python")));
    await writeFile(customUndeclared, JSON.stringify({ adapters: { custom: { command: ["python", "adapter.py"], timeout_seconds: 10 } } }));
    await writeFile(customDeclared, JSON.stringify({ adapters: { custom: {
      command: ["python", "adapter.py"], timeout_seconds: 10, reference_roles: ["reference_audio"]
    } } }));
    const script = String.raw`
import runpy, sys
from pathlib import Path
tool = runpy.run_path(sys.argv[1])
project = Path(sys.argv[5])
for builtin_video in ("seedance", "minimax-h3"):
    _, _, roles, _ = tool["_load_adapter"](Path(sys.argv[2]), builtin_video, project)
    tool["_require_adapter_roles"]({"adapter": builtin_video, "reference_bindings": [{"role": "reference_audio"}]}, roles)
for image_adapter in ("openai-image", "gpt-image-2"):
    _, _, image_roles, _ = tool["_load_adapter"](Path(sys.argv[2]), image_adapter, project)
    try:
        tool["_require_adapter_roles"]({"adapter": image_adapter, "reference_bindings": [{"role": "reference_audio"}]}, image_roles)
    except ValueError as error:
        assert "reference_audio; nothing was submitted" in str(error), error
    else:
        raise AssertionError(f"{image_adapter} admitted reference_audio")
_, _, undeclared_roles, _ = tool["_load_adapter"](Path(sys.argv[3]), "custom", project)
try:
    tool["_require_adapter_roles"]({"adapter": "custom", "reference_bindings": [{"role": "reference_audio"}]}, undeclared_roles)
except ValueError as error:
    assert "reference_audio; nothing was submitted" in str(error), error
else:
    raise AssertionError("undeclared custom profile admitted reference_audio")
_, _, declared_roles, _ = tool["_load_adapter"](Path(sys.argv[4]), "custom", project)
tool["_require_adapter_roles"]({"adapter": "custom", "reference_bindings": [{"role": "reference_audio"}]}, declared_roles)
print("builtin video admitted; non-video and undeclared custom rejected; explicit profile admitted")
`;
    const result = await execFileAsync((await hostPython(DRAMA_PYTHON)).command, ["-B", "-c", script,
      resolve(dramaRoot, "short-drama-produce/scripts/production_tool.py"), builtin, customUndeclared, customDeclared, project], { encoding: "utf8" });
    expect(result.stdout.trim()).toBe("builtin video admitted; non-video and undeclared custom rejected; explicit profile admitted");
  });

  it("reports presence per adapter including v0.13.0 optional model/site env hints without exposing values", () => {
    const statuses = dramaAdapterStatuses({
      OPENAI_API_KEY: "sk-secret",
      OPENAI_IMAGE_MODEL: "gpt-image-2.6",
      MINIMAX_API_KEY: "mm",
      MINIMAX_VIDEO_MODEL: "",
      MINIMAX_BASE_URL: "https://api.minimaxi.com/v1",
      ARK_API_KEY: "ark"
    });
    expect(statuses.map((status) => [status.name, status.configured, status.missing])).toEqual([
      ["openai-image", true, []],
      ["seedance", false, ["SEEDANCE_MODEL"]],
      ["minimax-h3", false, ["MINIMAX_VIDEO_MODEL"]],
      ["minimax-music", true, []],
      ["minimax-speech", true, []]
    ]);
    const openaiImage = statuses.find((status) => status.name === "openai-image");
    expect(openaiImage?.optionalEnv).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "OPENAI_IMAGE_MODEL", configured: true }),
      expect.objectContaining({ name: "OPENAI_BASE_URL", configured: false })
    ]));
    const minimaxMusic = statuses.find((status) => status.name === "minimax-music");
    expect(minimaxMusic?.optionalEnv).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "MINIMAX_MUSIC_MODEL", configured: false }),
      expect.objectContaining({ name: "MINIMAX_BASE_URL", configured: true })
    ]));
    expect(JSON.stringify(statuses)).not.toContain("sk-secret");
  });

  it("tells the produce Skill where the adapters are registered and which variables each needs", async () => {
    const provider = createDramaSkillProvider(dramaRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a bundled catalog.");
    const skill = await provider.get(listed.find((candidate) => candidate.name === "short-drama-produce")!, {});
    expect(skill?.content).toContain(dramaAdapterConfigPath(dramaRoot).path);
    expect(skill?.content).toContain(dramaAdapterSummary());
    expect(skill?.content).toContain("minimax-speech (tts: MINIMAX_API_KEY)");
    expect(skill?.content).toContain("DeepSeek generates no media");
    expect(skill?.content).toContain("Never read, print, or write credential values");
  });
});

describe("adapter config hardening", () => {
  it("reports a write failure instead of throwing when the directory cannot be created", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapters-"));
    temporary.push(root);
    const blocker = join(root, "not-a-directory");
    await writeFile(blocker, "x");
    const location = await ensureDramaAdapterConfig(dramaRoot, { env: {}, temporaryRoot: blocker });
    expect(location.generated).toBe(true);
    expect(location.ok).toBe(false);
  });

  it("refuses a generated path that is a symlink and leaves the link target alone", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapters-"));
    temporary.push(root);
    const expected = dramaAdapterConfigPath(dramaRoot, {}, root).path;
    await mkdir(dirname(expected), { recursive: true, mode: 0o700 });
    const victim = join(root, "victim.json");
    await writeFile(victim, "{}");
    await symlink(victim, expected);
    expect((await ensureDramaAdapterConfig(dramaRoot, { env: {}, temporaryRoot: root })).ok).toBe(false);
    expect(await readFile(victim, "utf8")).toBe("{}");
  });

  it("keys the generated directory by uid and writes the file private to this user", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapters-"));
    temporary.push(root);
    const location = await ensureDramaAdapterConfig(dramaRoot, { env: {}, temporaryRoot: root });
    expect(location.ok).toBe(true);
    if (process.getuid !== undefined) {
      expect(dirname(location.path)).toBe(join(root, `oh-story-dsh-${String(process.getuid())}`));
      expect((await stat(dirname(location.path))).mode & 0o777).toBe(0o700);
      expect((await stat(location.path)).mode & 0o777).toBe(0o600);
    }
  });
});

describe("host Python selection", () => {
  it("prefers the first interpreter meeting the video 3.10 floor over an older one that answers first", async () => {
    const outputs: Record<string, string | undefined> = { python3: "Python 3.9.18", python: "Python 3.12.1" };
    expect(await hostPython(VIDEO_PYTHON, (command) => Promise.resolve(outputs[command]))).toEqual({ command: "python", probe: { ok: true, version: "3.12.1", minimum: "3.10" } });
    expect(await hostPython(VIDEO_PYTHON, (command) => Promise.resolve(command === "python3" ? "Python 3.9.18" : undefined))).toEqual({ command: "python3", probe: { ok: false, version: "3.9.18", minimum: "3.10" } });
    expect(await hostPython(VIDEO_PYTHON, () => Promise.resolve(undefined))).toEqual({ command: "python3", probe: { ok: false, minimum: "3.10" } });
  });

  it("accepts the Python 3.9 that every bundled Drama script declares as its floor", async () => {
    expect(await hostPython(DRAMA_PYTHON, (command) => Promise.resolve(command === "python3" ? "Python 3.9.6" : undefined))).toEqual({ command: "python3", probe: { ok: true, version: "3.9.6", minimum: "3.9" } });
    expect(await hostPython(DRAMA_PYTHON, () => Promise.resolve("Python 3.8.18"))).toEqual({ command: "python3", probe: { ok: false, version: "3.8.18", minimum: "3.9" } });
  });

  it("matches the floor the bundled Drama scripts declare", async () => {
    const scripts = await bundledDramaScripts();
    const floors = new Set(scripts.flatMap(({ source }) => [...source.matchAll(/^MINIMUM_PYTHON = \((\d+), (\d+)\)$/gmu)].map((match) => `${match[1] ?? ""}.${match[2] ?? ""}`)));
    expect(floors).toEqual(new Set([DRAMA_PYTHON.join(".")]));
  });
});
