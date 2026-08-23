import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OH_STORY_ROLE_NAMES, loadBundledRole } from "../src/role-provider.js";

describe("bundled Oh Story roles", () => {
  it("loads all seven upstream role definitions as DSH personas", async () => {
    expect(OH_STORY_ROLE_NAMES).toHaveLength(7);
    const root = resolve(import.meta.dirname, "../../knowledge/oh-story/roles");
    for (const name of OH_STORY_ROLE_NAMES) {
      const source = await readFile(resolve(root, `${name}.md`), "utf8");
      const persona = await loadBundledRole(name, root);
      expect(persona).toContain(`OH_STORY_DSH_ROLE:${name}`);
      expect(persona).toContain("Do not read or write project files");
      expect(persona).toContain(source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "").trim());
    }
  });

  it("adapts the same exact role body for native DSH tool execution", async () => {
    const persona = await loadBundledRole("narrative-writer", resolve(import.meta.dirname, "../../knowledge/oh-story/roles"), "native-tools");
    expect(persona).toContain("current DSH workspace and visible tool set");
    expect(persona).toContain("call oh_story_bundled_reference with the exact story-setup/references/agent-references path");
    expect(persona).toContain("Never call the generic skill tool");
    expect(persona).toContain("fall back to a legacy platform path");
    expect(persona).not.toContain("do not call tools");
  });

  it("keeps the updated benchmark-book failure distinction", async () => {
    const persona = await loadBundledRole("story-explorer", resolve(import.meta.dirname, "../../knowledge/oh-story/roles"), "native-tools");
    expect(persona).toContain("benchmark_book_missing: true");
    expect(persona).toContain("profile_missing: true");
    expect(persona).toContain("expected_path");
  });
});
