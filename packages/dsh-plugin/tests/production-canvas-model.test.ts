import { describe, expect, it } from "vitest";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import { layoutGrid, productionCanvasEdges, productionCanvasNodes } from "../src/client/production-canvas-model.js";
import { canvasNodeStatus } from "../src/client/production-canvas.js";

const episode = "剧集/EP001";
const documents = {
  [`${episode}/剧本.md`]: "## EP001-SC001 内 · 候车室 · 夜\n雨水敲窗，林晚攥着一封旧信。\n\n## EP001-SC002 外 · 站台 · 夜\n列车进站。",
  [`${episode}/分镜.md`]: `## SHOT-EP001-001 · 雨夜站台\n- 来源：EP001-SC001\n- 图片提示词项：IMG-LINWAN、IMG-STATION\n- 时长：5s\n- 目的：建立等待。\n\n### 冻结关键帧提示词\n> 林晚站在雨夜站台。\n\n## SHOT-EP001-002 · 信封特写\n- 来源：EP001-SC001\n- 图片提示词项：IMG-LINWAN\n- 时长：4s\n- 目的：揭示旧信。`,
  [`${episode}/图片提示词.md`]: `## IMG-LINWAN · 林晚\n- 用途：锁定人物。\n\n### 可复制提示词\n> 27岁，冷静。\n\n## IMG-STATION · 雨夜候车室\n- 用途：锁定场景。\n\n### 可复制提示词\n> 冷青色雨夜。`,
  [`${episode}/视觉设定.md`]: "",
  [`${episode}/视频提示词.md`]: ""
};

describe("production canvas projection", () => {
  it("projects real screenplay excerpts, assets and shots into readable groups", () => {
    const production = parseEpisodeProduction(documents, episode);
    const nodes = productionCanvasNodes(production, documents);
    const story = nodes.find((node) => node.id === "EP001-SC001");
    expect(story).toMatchObject({ kind: "story", title: "内 · 候车室 · 夜" });
    expect(story?.description).toContain("雨水敲窗");
    expect(nodes.filter((node) => node.kind === "asset")).toHaveLength(2);
    expect(nodes.filter((node) => node.kind === "shot")).toHaveLength(2);
    expect(Math.min(...nodes.filter((node) => node.kind === "story").map((node) => node.initial.x)))
      .toBeLessThan(Math.min(...nodes.filter((node) => node.kind === "asset").map((node) => node.initial.x)));
    expect(Math.min(...nodes.filter((node) => node.kind === "asset").map((node) => node.initial.x)))
      .toBeLessThan(Math.min(...nodes.filter((node) => node.kind === "shot").map((node) => node.initial.x)));
  });

  it("keeps shots in a multi-column grid and derives only document-backed relationships", () => {
    const points = layoutGrid(8, { x: 0, y: 0 }, { width: 292, height: 310 }, 3);
    expect(new Set(points.map((point) => point.x))).toHaveLength(3);
    expect(new Set(points.map((point) => point.y))).toHaveLength(3);

    const production = parseEpisodeProduction(documents, episode);
    const edges = productionCanvasEdges(production);
    expect(edges).toContainEqual({ from: "EP001-SC001", to: "SHOT-EP001-001", kind: "story", label: "故事里的镜头" });
    expect(edges).toContainEqual({ from: "IMG-LINWAN", to: "SHOT-EP001-001", kind: "reference", label: "画面参考" });
    expect(edges).toContainEqual({ from: "SHOT-EP001-001", to: "SHOT-EP001-002", kind: "sequence", label: "接着发生" });
  });

  it("projects screenplay scenes before storyboard exists and exposes natural status copy", () => {
    const screenplayOnly = { [`${episode}/剧本.md`]: documents[`${episode}/剧本.md`] };
    const production = parseEpisodeProduction(screenplayOnly, episode);
    const nodes = productionCanvasNodes(production, screenplayOnly);
    expect(nodes.map((node) => node.id)).toEqual(["EP001-SC001", "EP001-SC002"]);
    expect(nodes[1]?.target).toMatchObject({ path: `${episode}/剧本.md`, id: "EP001-SC002" });
    expect(canvasNodeStatus(nodes[0]!, undefined)).toBe("来自剧本");
    expect(canvasNodeStatus(nodes[0]!, undefined)).not.toContain("EP001");
  });

  it("marks unresolved VISUAL-* nodes as needing image prompts instead of attaching raw descriptions as produce prompts", () => {
    const visualOnly = {
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- ID：VISUAL-CHAR-JIANGCHEN\n- 外观特征：左眉尾旧疤。"
    };
    const production = parseEpisodeProduction(visualOnly, episode);
    const nodes = productionCanvasNodes(production, visualOnly);
    const visualNode = nodes.find((node) => node.id === "VISUAL-CHAR-JIANGCHEN");
    expect(visualNode).toMatchObject({ kind: "asset", needsImagePrompt: true, prompt: undefined });
    expect(canvasNodeStatus(visualNode!, undefined)).toBe("待写图片提示词");
  });

  it("prefers GROUP-* over MOTION-* for shot video prompts, wires 输入参考图 edges, and leaves safe row spacing", () => {
    const v13Docs = {
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 门外 · 夜\n许棠抬头。",
      [`${episode}/图片提示词.md`]: "## IMG-XUTANG · 许棠\n### 可复制提示词\n> 窄长眼。",
      [`${episode}/分镜.md`]: [
        "## SHOT-EP001-001 · 抬头",
        "- 来源：EP001-SC001",
        "- 输入参考图：PLAN-LOOK（顺序：1）· IMG-XUTANG《许棠》（用途：外貌）",
        "- 时长：4s",
        "## SHOT-EP001-002 · 转身",
        "- 来源：EP001-SC001",
        "- 时长：4s",
        "## SHOT-EP001-003 · 推门",
        "- 来源：EP001-SC001",
        "- 时长：3s",
        "## SHOT-EP001-004 · 进屋",
        "- 来源：EP001-SC001",
        "- 时长：3s"
      ].join("\n"),
      [`${episode}/视频提示词.md`]: [
        "## MOTION-EP001-001 · 抬头",
        "- 分镜：SHOT-EP001-001",
        "### 可复制提示词",
        "> Single motion prompt.",
        "## MOTION-EP001-002 · 转身",
        "- 分镜：SHOT-EP001-002",
        "### 可复制提示词",
        "> Second motion prompt.",
        "## GROUP-EP001-01 · 抬头接转身",
        "- 成员：MOTION-EP001-001、MOTION-EP001-002",
        "### 可复制提示词",
        "> Grouped continuous prompt."
      ].join("\n")
    };
    const production = parseEpisodeProduction(v13Docs, episode);
    const nodes = productionCanvasNodes(production, v13Docs);
    const shot1 = nodes.find((node) => node.id === "SHOT-EP001-001")!;
    const shot4 = nodes.find((node) => node.id === "SHOT-EP001-004")!;
    expect(shot1).toMatchObject({
      groupId: "GROUP-EP001-01",
      motionId: "MOTION-EP001-001",
      videoTargetId: "GROUP-EP001-01",
      videoPrompt: "Grouped continuous prompt."
    });
    expect(shot1.height).toBeGreaterThanOrEqual(380);
    expect(shot4.initial.y - shot1.initial.y).toBeGreaterThanOrEqual(shot1.height + 64);

    const edges = productionCanvasEdges(production, new Set(nodes.map((node) => node.id)));
    expect(edges).toContainEqual({ from: "IMG-XUTANG", to: "SHOT-EP001-001", kind: "reference", label: "画面参考" });
  });
});
