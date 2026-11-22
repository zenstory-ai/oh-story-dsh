import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import { canvasNodeMatchesFilter, ProductionCanvas } from "../src/client/production-canvas.js";

describe("ProductionCanvas", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("keeps internal ids out of visible metadata and enables playback for real video", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const episode = "剧集/EP001";
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 房间 · 夜\n她抬起头。",
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 抬头\n- 来源：EP001-SC001\n- 时长：3s"
    }, episode);
    const markup = renderToStaticMarkup(<ProductionCanvas
      production={production}
      selectedId="SHOT-EP001-001"
      canvas={{}}
      viewport={undefined}
      versions={[{ id: "workspace:shot-video:1", targetId: "SHOT-EP001-001", kind: "video", url: "/media/shot.mp4" }]}
      onSelect={() => undefined}
      onNavigate={() => undefined}
      onCanvasChange={() => undefined}
      onViewportChange={() => undefined}
    />);
    const metas = [...markup.matchAll(/class="oh-story-canvas-node-meta">(.*?)<\/div>/gu)].map((match) => match[1]);
    const shotMeta = metas.find((meta) => meta?.includes("已有视频"));
    expect(shotMeta).toContain("已有视频");
    expect(shotMeta).not.toContain("SHOT-EP001-001");
    const video = /<video[^>]*src="\/media\/shot\.mp4"[^>]*>/u.exec(markup)?.[0];
    expect(video).toContain("controls=\"\"");
    // Cards must use role="group" (never nested role="button") and min-height/auto height.
    expect(markup).toContain('role="group"');
    expect(markup).not.toContain('class="oh-story-canvas-node" tabIndex="0" role="button"');
    expect(markup).toContain("min-height:384px;height:auto");
  });

  it("shows 去写图片提示词 instead of 准备素材 for unresolved VISUAL-* cards and deduplicates GROUP-* video versions", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const episode = "剧集/EP001";
    const production = parseEpisodeProduction({
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- ID：VISUAL-CHAR-JIANGCHEN\n- 外观特征：左眉尾旧疤。",
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 抬头\n- 时长：3s",
      [`${episode}/视频提示词.md`]: "## MOTION-EP001-001 · 抬头\n- 分镜：SHOT-EP001-001\n### 可复制提示词\n> Single\n## GROUP-EP001-01 · 连镜\n- 成员：MOTION-EP001-001\n### 可复制提示词\n> Group prompt"
    }, episode);
    // Simulate workspace projection emitting both GROUP-* and SHOT-* entries sharing the same version id.
    const markup = renderToStaticMarkup(<ProductionCanvas
      production={production}
      selectedId={undefined}
      canvas={{}}
      viewport={undefined}
      versions={[
        { id: "group-vid", targetId: "GROUP-EP001-01", kind: "video", url: "/media/group.mp4" },
        { id: "group-vid", targetId: "SHOT-EP001-001", kind: "video", url: "/media/group.mp4" }
      ]}
      onSelect={() => undefined}
      onNavigate={() => undefined}
      onCanvasChange={() => undefined}
      onViewportChange={() => undefined}
      onPrepare={() => undefined}
      onWriteImagePrompts={() => undefined}
    />);
    expect(markup).toContain(">去写图片提示词</button>");
    expect(markup).not.toContain(">准备素材</button>");
    expect(markup).toContain('src="/media/group.mp4"');
    expect(markup).toContain("1 个版本");
    expect(markup).not.toContain("2 个版本");
    expect(markup).not.toContain("oh-story-canvas-node-versions");
  });

  it("renders segmented canvas filter, dims non-matching nodes without unmounting them, and styles version badges", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const episode = "剧集/EP001";
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 房间 · 夜\n她抬起头。",
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 抬头\n- 来源：EP001-SC001\n- 时长：3s\n## SHOT-EP001-002 · 转身\n- 来源：EP001-SC001\n- 时长：3s"
    }, episode);
    const twoVersions = [
      { id: "v1", targetId: "SHOT-EP001-001", kind: "image" as const, url: "/media/s1.png" },
      { id: "v2", targetId: "SHOT-EP001-001", kind: "video" as const, url: "/media/s1.mp4" }
    ];
    expect(canvasNodeMatchesFilter({ kind: "story" }, [], "all")).toBe(true);
    expect(canvasNodeMatchesFilter({ kind: "story" }, [], "pending")).toBe(false);
    expect(canvasNodeMatchesFilter({ kind: "story" }, [], "ready")).toBe(false);
    expect(canvasNodeMatchesFilter({ kind: "shot" }, [], "pending")).toBe(true);
    expect(canvasNodeMatchesFilter({ kind: "shot" }, twoVersions, "pending")).toBe(false);
    expect(canvasNodeMatchesFilter({ kind: "shot" }, twoVersions, "ready")).toBe(true);

    const htmlAll = renderToStaticMarkup(<ProductionCanvas
      production={production}
      selectedId={undefined}
      canvas={{}}
      viewport={undefined}
      versions={twoVersions}
      onSelect={() => undefined}
      onNavigate={() => undefined}
      onCanvasChange={() => undefined}
      onViewportChange={() => undefined}
    />);
    expect(htmlAll).toContain('class="oh-story-canvas-filter"');
    expect(htmlAll).toContain('aria-pressed="true">全部</button>');
    expect(htmlAll).toContain('aria-pressed="false">待准备</button>');
    expect(htmlAll).toContain('aria-pressed="false">已生成</button>');
    expect(htmlAll).toContain('<span class="oh-story-canvas-version-badge">V1</span>');
    expect(htmlAll).toContain('<span class="oh-story-canvas-version-badge">V2</span>');
    expect(htmlAll.match(/<article class="oh-story-canvas-node"/gu)).toHaveLength(3);
    expect(htmlAll).not.toContain('data-dimmed="true"');

    const htmlReady = renderToStaticMarkup(<ProductionCanvas
      production={production}
      selectedId={undefined}
      canvas={{}}
      viewport={undefined}
      versions={twoVersions}
      initialFilter="ready"
      onSelect={() => undefined}
      onNavigate={() => undefined}
      onCanvasChange={() => undefined}
      onViewportChange={() => undefined}
    />);
    // All 3 articles stay mounted; only non-matching story + pending shot are dimmed.
    expect(htmlReady.match(/<article class="oh-story-canvas-node"/gu)).toHaveLength(3);
    expect(htmlReady.match(/<article[^>]*data-dimmed="true"/gu)).toHaveLength(2);
  });
});
