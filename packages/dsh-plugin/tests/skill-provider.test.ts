import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderSkillContent } from "@deepseek-ai/dsh-skill";
import { describe, expect, it } from "vitest";
import { createDramaSkillProvider, createNovelToGameSkillProvider, createOhStorySkillProvider, createVideoRecapSkillProvider, parseBundledSkill } from "../src/skill-provider.js";

const skillRoot = resolve(import.meta.dirname, "../../knowledge/oh-story/skills");
const dramaRoot = resolve(import.meta.dirname, "../../knowledge/drama/skills");
const gameRoot = resolve(import.meta.dirname, "../../knowledge/novel-to-game/skills");
const videoRoot = resolve(import.meta.dirname, "../../knowledge/video-recap/skills");

describe("Oh Story bundled skill provider", () => {
  it("publishes the complete upstream capability catalog with a DSH bridge", async () => {
    const provider = createOhStorySkillProvider(skillRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a complete bundled catalog.");
    const candidates = listed;
    expect(candidates).toHaveLength(13);
    expect(candidates.map((candidate) => candidate.name)).toContain("story-long-write");
    expect(candidates.every((candidate) => candidate.source === "bundled" && candidate.invocation.modelInvocable)).toBe(true);
    const selected = candidates.find((candidate) => candidate.name === "story-long-write");
    expect(selected).toBeDefined();
    const skill = await provider.get(selected!, {});
    expect(skill?.content).toContain("# story-long-write");
    expect(skill?.content).toContain("oh_story_role");
    expect(skill?.content).toContain("DSH owns the workspace, model, preset, permissions, Session Log");
    for (const platformPath of [".claude/agents", ".codex/agents", ".opencode/agents", ".agents/agents", "invoke_subagent"]) {
      expect(skill?.content).toContain(platformPath);
    }
    expect(skill?.content).toContain("Keep the upstream writing, Tracking, lint, outline, revision, and quality workflows");
    const workflowSetup = await readFile(resolve(skillRoot, "story-long-write/references/workflow-setup.md"), "utf8");
    expect(workflowSetup).toContain("| # | 情节点（谁做了什么） | 功能标签 | 执行边界 |");
    expect(skill?.content.startsWith("---")).toBe(false);
    const setupCandidate = candidates.find((candidate) => candidate.name === "story-setup");
    const setup = await provider.get(setupCandidate!, {});
    expect(setup?.content).toContain("never deploy Claude/OpenCode/Codex/Antigravity/ZCode/OpenClaw/Reasonix files");
    expect(setup?.content).not.toContain("merge-codex-hooks.py");
    expect(setup?.resourceBase).toEqual({ kind: "directory", path: resolve(skillRoot, "story-setup") });
    for (const reference of ["character-basics.md", "long-quality.md", "short-quality.md", "writing-craft.md", "outline-methods.md"]) {
      await expect(readFile(resolve(skillRoot, "story-setup/references/agent-references", reference), "utf8"))
        .resolves.toMatch(/\S/u);
    }
    const renderedSetup = renderSkillContent(setup!);
    expect(renderedSetup).toContain("<skill_resources>");
    expect(renderedSetup).toContain(`Base directory for this skill: ${resolve(skillRoot, "story-setup")}`);
    const routeCandidate = candidates.find((candidate) => candidate.name === "story");
    const route = await provider.get(routeCandidate!, {});
    expect(route?.content).toContain("The 小说 workspace is an official DSH conversation view");
    expect(routeCandidate?.description).toContain("记住我的写作习惯");
    expect(route?.content).toContain("scripts/author_memory_commit.py");
    await expect(readFile(resolve(skillRoot, "story/scripts/author_memory_commit.py"), "utf8")).resolves.toMatch(/\S/u);
    expect(route?.content).not.toContain("dashboard-server.mjs");
    const browserCandidate = candidates.find((candidate) => candidate.name === "browser-cdp");
    const browser = await provider.get(browserCandidate!, {});
    expect(browser?.content).not.toContain("setup-cdp-chrome.js 9222");
    for (const name of ["story-long-scan", "story-short-scan"]) {
      const candidate = candidates.find((value) => value.name === name);
      const scan = await provider.get(candidate!, {});
      expect(scan?.content).toContain("当前 DSH Preset 可见的网页工具");
      expect(scan?.content).not.toContain("rank-scraper.js");
      expect(scan?.content).not.toContain("WebFetch");
      expect(scan?.content).not.toContain("Bearer token");
    }
  });

  it("rejects missing frontmatter", () => {
    expect(() => parseBundledSkill("# no metadata")).toThrow(/frontmatter/u);
  });

  it("parses folded YAML descriptions and user invocation metadata", () => {
    const parsed = parseBundledSkill("---\nname: folded-skill\nuser-invocable: false\ndescription: >\n first line\n second line\n---\n# Body\n");
    expect(parsed.description).toBe("first line second line");
    expect(parsed.userInvocable).toBe(false);
  });

  it("rejects candidate paths outside the packaged skill root", async () => {
    const provider = createOhStorySkillProvider(skillRoot);
    await expect(provider.get({
      name: "story-long-write",
      description: "invalid external candidate",
      invocation: { modelInvocable: true, userInvocable: true },
      provider: "oh-story",
      source: "bundled",
      resourceBase: { kind: "directory", path: resolve(skillRoot, "..") },
      rank: 0,
      locator: new URL("file:///tmp/SKILL.md"),
      path: resolve(skillRoot, "../SKILL.md")
    }, {})).rejects.toThrow(/escaped/u);
  });
});

describe("Drama Skills bundled provider", () => {
  it("publishes the complete upstream short-drama workflow through DSH", async () => {
    const provider = createDramaSkillProvider(dramaRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a complete Drama Skills catalog.");
    expect(listed).toHaveLength(10);
    expect(listed.map((candidate) => candidate.name)).toEqual(expect.arrayContaining([
      "short-drama", "short-drama-write", "short-drama-storyboard", "short-drama-produce"
    ]));
    for (const candidate of listed) {
      const skill = await provider.get(candidate, {});
      expect(skill?.content).toContain("each episode keeps only the requested documents, up to five creator-facing sources");
      expect(skill?.content).toContain("Never precreate empty documents, backfill nominal stages, or start work the creator did not request");
      expect(skill?.content).toContain("an oral review writes nothing");
      expect(skill?.content).toContain("never create a parallel JSON/JSONL lifecycle truth");
      expect(skill?.content).toContain("Never upgrade a v0.5 structured project in place");
    }
    const routeCandidate = listed.find((candidate) => candidate.name === "short-drama");
    const route = await provider.get(routeCandidate!, {});
    expect(route?.content).toContain("native 短剧 tab");
    expect(route?.content).toContain("each episode keeps only the requested documents, up to five creator-facing sources");
    expect(route?.content).toContain("剧集/<EP>/剧本.md, 视觉设定.md, 分镜.md, 图片提示词.md, and 视频提示词.md");
    expect(route?.content).toContain("never create a parallel JSON/JSONL lifecycle truth");
    expect(route?.content).toContain("Never upgrade a v0.5 structured project in place");
    expect(route?.content).toContain("New projects follow only the v0.6 creator-first contract and create only documents required by the current request");
    expect(route?.content).toContain("不建立并行的结构化创作真相");
    const reviewCandidate = listed.find((candidate) => candidate.name === "short-drama-review");
    const review = await provider.get(reviewCandidate!, {});
    expect(review?.content).toContain("审查/EP001-审查.md");
    const productionCandidate = listed.find((candidate) => candidate.name === "short-drama-produce");
    const production = await provider.get(productionCandidate!, {});
    expect(production?.content).toContain("explicitly confirms the exact current job");
    expect(production?.content).toContain("DSH permissions and approval UI");
    expect(production?.content).toContain("source must be the current creator-first Markdown");
    expect(production?.content).toContain("剧集/<EP>/制作成果/");
  });
});

describe("NovelToGame bundled provider", () => {
  it("publishes the complete seven-Skill playable adaptation pipeline through DSH", async () => {
    const provider = createNovelToGameSkillProvider(gameRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a complete NovelToGame catalog.");
    expect(listed.map((candidate) => candidate.name)).toEqual([
      "game-art-direction",
      "game-build",
      "game-concept",
      "game-qa",
      "game-world-design",
      "novel-game-analyze",
      "novel-to-game"
    ]);
    for (const candidate of listed) {
      const skill = await provider.get(candidate, {});
      expect(skill?.content).toContain("The 游戏 tab is the playable Game Studio");
      expect(skill?.content).toContain("game-adaptations/<project>/");
      expect(skill?.content).toContain("qa/verification.json remains the sole machine QA truth");
      expect(skill?.resourceBase).toEqual({ kind: "directory", path: resolve(gameRoot, candidate.name) });
    }
    const route = await provider.get(listed.find((candidate) => candidate.name === "novel-to-game")!, {});
    expect(route?.content).toContain("# NovelToGame 总入口");
    expect(route?.content).toContain("quick");
    expect(route?.content).toContain("director");
    expect(route?.content).toContain("resume");
    const qa = await provider.get(listed.find((candidate) => candidate.name === "game-qa")!, {});
    for (const check of ["launch", "render", "input", "coreLoop", "outcome", "restart"]) {
      expect(qa?.content).toContain(check);
    }
  });
});

describe("video-recap bundled provider", () => {
  it("publishes the complete six-Skill pipeline with native DSH boundaries", async () => {
    const provider = createVideoRecapSkillProvider(videoRoot);
    const listed = await provider.list({});
    if (!Array.isArray(listed)) throw new Error("Expected a complete video-recap catalog.");
    expect(listed.map((candidate) => candidate.name)).toEqual([
      "video-assemble",
      "video-cut",
      "video-recap",
      "video-script",
      "video-understanding",
      "video-voiceover"
    ]);
    expect(listed.find((candidate) => candidate.name === "video-recap")?.invocation.userInvocable).toBe(true);
    expect(listed.find((candidate) => candidate.name === "video-cut")?.invocation.userInvocable).toBe(false);
    expect(listed.find((candidate) => candidate.name === "video-understanding")?.description).toContain("结构化理解索引");
    for (const candidate of listed) {
      const skill = await provider.get(candidate, {});
      expect(skill?.content).toContain("The Video Studio is a preview and artifact surface");
      expect(skill?.content).toContain("video-recaps/<project>/");
      expect(skill?.content).toContain("MIMO_API_KEY, FISH_API_KEY");
      expect(skill?.resourceBase).toEqual({ kind: "directory", path: resolve(videoRoot, candidate.name) });
    }
  });
});
