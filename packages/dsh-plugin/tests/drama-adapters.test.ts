import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DRAMA_ADAPTER_CONFIG_ENV,
  DRAMA_ADAPTERS,
  dramaAdapterConfigDocument,
  dramaAdapterConfigPath,
  dramaAdapterStatuses,
  dramaAdapterSummary,
  ensureDramaAdapterConfig
} from "../src/drama-adapters.js";
import { hostPython } from "../src/host-python.js";
import { createDramaSkillProvider } from "../src/skill-provider.js";

const dramaRoot = resolve(import.meta.dirname, "../../knowledge/drama/skills");
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("bundled Drama media adapters", () => {
  it("names exactly the adapters the pinned upstream provider script accepts", async () => {
    const script = await readFile(join(dramaRoot, "short-drama-produce/scripts/provider_adapters.py"), "utf8");
    const choices = /choices=\(([^)]*)\)/u.exec(script)?.[1]?.match(/"([^"]+)"/gu)?.map((entry) => entry.replaceAll('"', ""));
    expect(choices?.sort()).toEqual(DRAMA_ADAPTERS.map((adapter) => adapter.name).sort());
  });

  it("documents each required environment variable in the pinned upstream provider reference", async () => {
    for (const adapter of DRAMA_ADAPTERS) {
      const reference = await readFile(join(dramaRoot, adapter.reference), "utf8");
      for (const name of [...adapter.requiredEnv, ...adapter.optionalEnv]) expect(reference, `${adapter.name} ${name}`).toContain(`\`${name}\``);
    }
  });

  it("writes an upstream-shaped adapter config that points at the bundled script and carries no credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapters-"));
    temporary.push(root);
    const location = await ensureDramaAdapterConfig(dramaRoot, { python: "python", env: {}, temporaryRoot: root });
    expect(location).toEqual({ path: dramaAdapterConfigPath(dramaRoot, {}, root).path, generated: true, ok: true });
    expect(location.path).toMatch(/\/oh-story-dsh(?:-\d+)?\/drama-adapters-[0-9a-f]{12}\.json$/u);
    expect(dramaAdapterConfigPath(join(root, "elsewhere"), {}, root).path).not.toBe(location.path);
    const written = JSON.parse(await readFile(location.path, "utf8")) as ReturnType<typeof dramaAdapterConfigDocument>;
    expect(written).toEqual(dramaAdapterConfigDocument(dramaRoot, "python"));
    expect(written.adapters["seedance"]).toEqual({ command: ["python", resolve(dramaRoot, "short-drama-produce/scripts/provider_adapters.py"), "seedance"], timeout_seconds: 3_600 });
    expect(JSON.stringify(written)).not.toMatch(/key|token|secret/iu);
  });

  it("leaves a creator-owned config untouched and only reports whether it exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-adapters-"));
    temporary.push(root);
    const custom = join(root, "mine.json");
    expect(dramaAdapterConfigPath(dramaRoot, { [DRAMA_ADAPTER_CONFIG_ENV]: custom }, root)).toEqual({ path: custom, generated: false });
    expect(await ensureDramaAdapterConfig(dramaRoot, { env: { [DRAMA_ADAPTER_CONFIG_ENV]: custom }, temporaryRoot: root })).toEqual({ path: custom, generated: false, ok: false });
  });

  it("reports presence per adapter without exposing values", () => {
    const statuses = dramaAdapterStatuses({ OPENAI_API_KEY: "sk-secret", MINIMAX_API_KEY: "mm", MINIMAX_VIDEO_MODEL: "", ARK_API_KEY: "ark" });
    expect(statuses.map((status) => [status.name, status.configured, status.missing])).toEqual([
      ["gpt-image-2", true, []],
      ["seedance", false, ["SEEDANCE_MODEL"]],
      ["minimax-h3", false, ["MINIMAX_VIDEO_MODEL", "MINIMAX_VIDEO_RESOLUTIONS"]],
      ["minimax-music", true, []]
    ]);
    expect(JSON.stringify(statuses)).not.toContain("sk-secret");
  });

  it("tells the produce Skill where the adapters are registered and which variables each needs", async () => {
    const provider = createDramaSkillProvider(dramaRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a bundled catalog.");
    const skill = await provider.get(listed.find((candidate) => candidate.name === "short-drama-produce")!, {});
    expect(skill?.content).toContain(dramaAdapterConfigPath(dramaRoot).path);
    expect(skill?.content).toContain(dramaAdapterSummary());
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
  it("prefers the first interpreter meeting the 3.10 floor over an older one that answers first", async () => {
    const outputs: Record<string, string | undefined> = { python3: "Python 3.9.18", python: "Python 3.12.1" };
    expect(await hostPython((command) => Promise.resolve(outputs[command]))).toEqual({ command: "python", probe: { ok: true, version: "3.12.1" } });
    expect(await hostPython((command) => Promise.resolve(command === "python3" ? "Python 3.9.18" : undefined))).toEqual({ command: "python3", probe: { ok: false, version: "3.9.18" } });
    expect(await hostPython(() => Promise.resolve(undefined))).toEqual({ command: "python3", probe: { ok: false } });
  });
});
