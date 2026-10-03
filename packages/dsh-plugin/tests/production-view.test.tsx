import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compositionSources, SequenceBoard } from "../src/client/drama-production-view.js";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import type { ProductionMediaVersion } from "../src/client/production-runtime.js";

const versions: ProductionMediaVersion[] = [
  { id: "still", targetId: "SHOT-EP001-001", kind: "image", url: "/media/still", path: "剧集/EP001/制作成果/SHOT-EP001-001/still.png" },
  { id: "video", targetId: "SHOT-EP001-002", kind: "video", url: "/media/video", path: "剧集/EP001/制作成果/SHOT-EP001-002/video.mp4" },
  { id: "img-card", targetId: "IMG-EP001-CARD", kind: "image", url: "/media/card", path: "剧集/EP001/制作成果/IMG-EP001-CARD/card.webp" }
];

describe("production sequence view", () => {
  it("maps selected media to exact MOTION, SHOT and IMG composition sources", () => {
    const episode = "剧集/EP001";
    const production = parseEpisodeProduction({
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 一\n- 时长：4s\n\n## SHOT-EP001-002 · 二\n- 时长：2.5s",
      [`${episode}/视频提示词.md`]: "## MOTION-EP001-001 · 一\n- 分镜：SHOT-EP001-001\n- 时长：4 秒\n\n### 可复制提示词\n> 动作"
    }, episode);
    const selected: ProductionMediaVersion[] = [
      { id: "motion", targetId: "SHOT-EP001-001", kind: "video", url: "/motion", path: `${episode}/制作成果/SHOT-EP001-001/motion.mp4` },
      { id: "img", targetId: "IMG-EP001-CARD", kind: "image", url: "/img", path: `${episode}/制作成果/IMG-EP001-CARD/card.webp` }
    ];
    expect(compositionSources(production, [
      { shotId: "SHOT-EP001-001", versionId: "motion" },
      { shotId: "SHOT-EP001-002", versionId: "img" }
    ], selected)).toEqual([
      { shotId: "SHOT-EP001-001", sourceId: "MOTION-EP001-001", kind: "video", path: `${episode}/制作成果/SHOT-EP001-001/motion.mp4`, durationSeconds: 4 },
      { shotId: "SHOT-EP001-002", sourceId: "IMG-EP001-CARD", kind: "image", path: `${episode}/制作成果/IMG-EP001-CARD/card.webp`, durationSeconds: 2.5 }
    ]);
  });

  it("previews a mixed image/video sequence and enables composition", () => {
    const html = renderToStaticMarkup(<SequenceBoard
      jobs={[]}
      sequence={[{ shotId: "SHOT-EP001-001", versionId: "still" }, { shotId: "SHOT-EP001-002", versionId: "video" }]}
      versions={versions}
      episodeDirectory="剧集/EP001"
      onSequenceChange={() => undefined}
      onCompose={() => undefined}
    />);
    expect(html).toContain('<img class="oh-story-media-preview" src="/media/still" alt="SHOT-EP001-001"');
    expect(html).toContain('<video class="oh-story-media-preview" src="/media/video"');
    expect(html).toContain("已可合成");
    expect(html).toContain(">合成成片</button>");
    expect(html).not.toContain("缺少素材");
    expect(html).not.toContain('<button type="button" disabled="">合成成片</button>');
    expect(html).toContain('aria-label="选择 SHOT-EP001-001 成片素材"');
    expect(html).toContain("IMG-EP001-CARD · 静帧 · card.webp");
  });

  it("renders an explicitly selected IMG source even when video is available", () => {
    const html = renderToStaticMarkup(<SequenceBoard
      jobs={[]}
      sequence={[
        { shotId: "SHOT-EP001-001", sourceVersionId: "img-card", versionId: "img-card" },
        { shotId: "SHOT-EP001-002", versionId: "video" }
      ]}
      versions={versions}
      episodeDirectory="剧集/EP001"
      onSequenceChange={() => undefined}
      onCompose={() => undefined}
    />);
    expect(html).toContain('<img class="oh-story-media-preview" src="/media/card" alt="IMG-EP001-CARD"');
    expect(html).toContain('<option value="img-card" selected="">IMG-EP001-CARD · 静帧 · card.webp</option>');
    expect(html).toContain("已可合成");
  });

  it("shows an honest missing-material blocker and ignores another episode's preview", () => {
    const other = { ...versions[0]!, id: "other", url: "/media/other", path: "剧集/EP002/制作成果/SHOT-EP001-001/still.png" };
    const html = renderToStaticMarkup(<SequenceBoard
      jobs={[]}
      sequence={[{ shotId: "SHOT-EP001-001", versionId: "other" }, { shotId: "SHOT-EP001-002" }]}
      versions={[other]}
      episodeDirectory="剧集/EP001"
      onSequenceChange={() => undefined}
      onCompose={() => undefined}
    />);
    expect(html).toContain("2 个阻塞项");
    expect(html.match(/缺少素材/gu)).toHaveLength(2);
    expect(html).not.toContain("/media/other");
    expect(html).toContain('<button type="button" disabled="">合成成片</button>');
  });
});
