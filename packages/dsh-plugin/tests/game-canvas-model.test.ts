import { describe, expect, it } from "vitest";
import { gameCanvasEdges, gameCanvasNodes, gameCreativeDocuments } from "../src/client/game-canvas-model.js";
import type { GameProject, GameWorkspaceFile } from "../src/client/game-workspace-types.js";

const project: GameProject = {
  id: "jade-letter",
  root: "projects/jade-letter",
  title: "青石巷来信",
  previewReady: false,
  previewVersion: "0"
};

describe("game creative canvas model", () => {
  it("projects only known creative Markdown files inside the current project", () => {
    const files = [
      file("projects/jade-letter/PRODUCT_BRIEF.md"),
      file("projects/jade-letter/concepts/CONCEPT.md"),
      file("projects/jade-letter/qa/PLAYTEST_NOTES.md"),
      file("projects/jade-letter/build/app/index.html"),
      file("projects/other/design/GAME_DESIGN.md"),
      file("projects/jade-letter/design/ART_DIRECTION.md", "media")
    ];

    expect(gameCreativeDocuments(project, files)).toEqual([
      expect.objectContaining({ id: "game:jade-letter:document:PRODUCT_BRIEF.md", path: "projects/jade-letter/PRODUCT_BRIEF.md", kind: "brief" }),
      expect.objectContaining({ id: "game:jade-letter:document:concepts/CONCEPT.md", path: "projects/jade-letter/concepts/CONCEPT.md", kind: "concept" })
    ]);
  });

  it("uses creator-facing headings and excerpts without leaking Markdown or markup", () => {
    const path = "projects/jade-letter/concepts/CONCEPT.md";
    const nodes = gameCanvasNodes(project, [file(path)], {
      [path]: "<!-- internal -->\n# **一封信，两条路** `draft`\n\n> 玩家先送信，再决定把真相交给[谁](https://example.test)。\n\n```json\n{\"debug\": true}\n```"
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ title: "一封信，两条路 draft", excerpt: "玩家先送信，再决定把真相交给谁。" });
    expect(JSON.stringify(nodes[0])).not.toMatch(/internal|debug|https|\*\*|`/u);
  });

  it("does not join markup fragments or expose multiline comments in excerpts", () => {
    const path = "projects/jade-letter/concepts/CONCEPT.md";
    const nodes = gameCanvasNodes(project, [file(path)], {
      [path]: "# 故事\n<!-- hidden\ninternal -->玩家<b>选择</b>路线。\n<scr<script>ipt>片段"
    });
    expect(nodes[0]?.excerpt).toBe("玩家 选择 路线。 ipt片段");
    expect(nodes[0]?.excerpt).not.toMatch(/[<>]|hidden|internal/u);
  });

  it("removes conventional template filename prefixes from visible titles", () => {
    const briefPath = "projects/jade-letter/PRODUCT_BRIEF.md";
    const designPath = "projects/jade-letter/design/GAME_DESIGN.md";
    const nodes = gameCanvasNodes(project, [file(briefPath), file(designPath)], {
      [briefPath]: "# PRODUCT_BRIEF · 青石巷来信\n一款关于送信和选择的游戏。",
      [designPath]: "# GAME_DESIGN\n玩家读信并决定送给谁。"
    });

    expect(nodes.find((node) => node.kind === "brief")?.title).toBe("青石巷来信");
    expect(nodes.find((node) => node.kind === "design")?.title).toBe("选择与玩法");
  });

  it("does not fabricate missing artifacts or relations", () => {
    const conceptPath = "projects/jade-letter/concepts/CONCEPT.md";
    const designPath = "projects/jade-letter/design/GAME_DESIGN.md";
    const nodes = gameCanvasNodes(project, [file(conceptPath), file(designPath)], {});
    const edges = gameCanvasEdges(nodes);

    expect(nodes.map((node) => node.kind)).toEqual(["concept", "design"]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ from: nodes[0]?.id, to: nodes[1]?.id, label: "核心乐趣" });
    expect(edges.every((edge) => nodes.some((node) => node.id === edge.from) && nodes.some((node) => node.id === edge.to))).toBe(true);
  });

  it("shows a project that has only a build as one real playable card without fake documents", () => {
    const built: GameProject = { ...project, id: "built", previewReady: true, previewVersion: "1" };
    const nodes = gameCanvasNodes(built, [file("projects/jade-letter/build/app/index.html")], {});

    expect(nodes).toEqual([expect.objectContaining({ id: "game:built:preview", kind: "preview", title: "青石巷来信" })]);
    expect(gameCanvasEdges(nodes)).toEqual([]);
  });

  it("derives character and world cards only from real non-empty design sections", () => {
    const path = "projects/jade-letter/design/GAME_DESIGN.md";
    const nodes = gameCanvasNodes({ ...project, previewReady: true }, [file(path)], {
      [path]: "# 选择与玩法\n通用规则。\n\n## 人物与关系\n许知微带着一封迟到十年的信回到青石巷。\n\n## 世界与场景\n故事发生在常年落雨的青石巷。"
    });

    expect(nodes.map((node) => node.kind)).toEqual(["design", "character", "world", "preview"]);
    expect(nodes.find((node) => node.kind === "character")).toMatchObject({ title: "人物与关系", excerpt: "许知微带着一封迟到十年的信回到青石巷。", path });
    expect(nodes.find((node) => node.kind === "world")).toMatchObject({ title: "世界与场景", excerpt: "故事发生在常年落雨的青石巷。", path });
    expect(gameCanvasEdges(nodes).map((edge) => edge.label)).toEqual(["在这里玩起来", "和谁相遇", "在哪里探索"]);
  });

  it("keeps a generic six-document project to seven honest cards with its preview", () => {
    const paths = [
      "PRODUCT_BRIEF.md",
      "analysis/SOURCE_BIBLE.md",
      "concepts/CONCEPT.md",
      "design/GAME_DESIGN.md",
      "design/ART_DIRECTION.md",
      "build/BUILD_BRIEF.md"
    ].map((relative) => `projects/jade-letter/${relative}`);
    const designPath = "projects/jade-letter/design/GAME_DESIGN.md";
    const nodes = gameCanvasNodes({ ...project, previewReady: true }, paths.map((path) => file(path)), {
      [designPath]: "# 选择与玩法\n玩家读信、判断，再承担选择的结果。"
    });

    expect(nodes).toHaveLength(7);
    expect(nodes.map((node) => node.kind)).toEqual(["brief", "source", "concept", "design", "art", "build", "preview"]);
    expect(gameCanvasEdges(nodes).map((edge) => edge.label)).toEqual(["故事与选择", "体验目标", "核心乐趣", "在这里玩起来", "画面与氛围", "这一版想调整"]);
  });
});

function file(path: string, kind: GameWorkspaceFile["kind"] = "text"): GameWorkspaceFile {
  return { path, kind, bytes: 12, version: "1" };
}
