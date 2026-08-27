import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDramaSkillProvider } from "../src/skill-provider.js";
import { PRODUCTION_INTENT_JOB_KINDS } from "../src/production-intent.js";

const dramaRoot = resolve(import.meta.dirname, "../../knowledge/drama/skills");

/**
 * The DSH-specific production and asset-ID instructions belong in the plugin's
 * bridge, never edited into the pinned upstream files. Editing them in place
 * makes packages/knowledge/drama/manifest.json attest locally authored text as
 * upstream, and the next `pnpm assets:sync:drama` silently reverts the change.
 */
describe("pinned Drama Skills stay upstream-pure", () => {
  it("keeps DSH-only instructions out of the pinned files on disk", async () => {
    const pinned = await Promise.all([
      readFile(resolve(dramaRoot, "short-drama-produce/SKILL.md"), "utf8"),
      readFile(resolve(dramaRoot, "short-drama-assets/SKILL.md"), "utf8"),
      readFile(resolve(dramaRoot, "short-drama/references/creator-documents.md"), "utf8")
    ]);
    for (const content of pinned) {
      expect(content).not.toContain("oh_story_production");
      expect(content).not.toContain("track_job");
      expect(content).not.toContain("VISUAL-CHAR-JIANGCHEN");
    }
  });

  it("still delivers those instructions to the Agent through the DSH bridge", async () => {
    const provider = createDramaSkillProvider(dramaRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a complete Drama Skills catalog.");

    const produce = await provider.get(listed.find((candidate) => candidate.name === "short-drama-produce")!, {});
    expect(produce?.content).toContain("oh_story_production");
    expect(produce?.content).toContain("track_job");
    expect(produce?.content).toContain("不得在 `prepare` 阶段登记为运行中");

    const assets = await provider.get(listed.find((candidate) => candidate.name === "short-drama-assets")!, {});
    expect(assets?.content).toContain("- ID：VISUAL-*");
    expect(assets?.content).toContain("修改标题或文案时不得更换 ID");
  });

  it("names only jobKind values the oh_story_production tool actually accepts", async () => {
    const provider = createDramaSkillProvider(dramaRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a complete Drama Skills catalog.");
    const produce = await provider.get(listed.find((candidate) => candidate.name === "short-drama-produce")!, {});
    const content = produce?.content ?? "";

    // The upstream skill's modalities include tts and music, which the tool's
    // jobKind enum does not accept — instructing the Agent to register a
    // "modality" would make those calls fail.
    expect(content).toContain("`jobKind`");
    expect(content).not.toMatch(/登记[^\n]*modality/u);
    for (const kind of PRODUCTION_INTENT_JOB_KINDS) expect(content).toContain(kind);
    expect(content).toContain("tts 与 music 任务继续按上游契约执行，但不登记到生产任务板");
  });
});
