import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import { ProductionCanvas } from "../src/client/production-canvas.js";

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
  });
});
