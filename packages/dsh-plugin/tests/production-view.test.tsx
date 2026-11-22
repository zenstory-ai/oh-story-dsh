import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compositionSources, DramaProductionView, productionCanvasAvailable, ProductionStatus, SequenceBoard, targetDisplayName } from "../src/client/drama-production-view.js";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import type { ProductionMediaVersion } from "../src/client/production-runtime.js";

const versions: ProductionMediaVersion[] = [
  { id: "still", targetId: "SHOT-EP001-001", kind: "image", url: "/media/still", path: "剧集/EP001/制作成果/SHOT-EP001-001/still.png" },
  { id: "video", targetId: "SHOT-EP001-002", kind: "video", url: "/media/video", path: "剧集/EP001/制作成果/SHOT-EP001-002/video.mp4" },
  { id: "img-card", targetId: "IMG-EP001-CARD", kind: "image", url: "/media/card", path: "剧集/EP001/制作成果/IMG-EP001-CARD/card.webp" }
];

describe("production sequence view", () => {
  it("keeps the infinite canvas available when the screenplay exists before storyboard cards", () => {
    const episode = "剧集/EP001";
    const documents = { [`${episode}/剧本.md`]: "## SCENE-EP001-001 · 门外\n江辰停在门前。" };
    const production = parseEpisodeProduction(documents, episode);
    expect(production.shots).toHaveLength(0);
    expect(productionCanvasAvailable(production, documents)).toBe(true);
    expect(productionCanvasAvailable(production, { [`${episode}/剧本.md`]: "  " })).toBe(false);
  });

  it("presents the canvas workflow as the primary navigation and keeps technical setup collapsed", () => {
    const episode = "剧集/EP001";
    const production = parseEpisodeProduction({
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 门外停步\n- 时长：4s"
    }, episode);
    const html = renderToStaticMarkup(<DramaProductionView
      sessionId="session-1"
      production={production}
      sessionRunning={false}
      queue={[]}
      section="tasks"
      selectedId={undefined}
      jobs={[]}
      versions={[]}
      libraryVersions={[]}
      selections={{}}
      manualReferences={{}}
      sequence={[]}
      canvas={{}}
      viewport={undefined}
      onSectionChange={() => undefined}
      onSelect={() => undefined}
      onNavigate={() => undefined}
      onJobsChange={() => undefined}
      onSelectionsChange={() => undefined}
      onManualReferencesChange={() => undefined}
      onOpenMedia={() => undefined}
      onSequenceChange={() => undefined}
      onCanvasChange={() => undefined}
      onViewportChange={() => undefined}
      onDispatchPrompt={async () => undefined}
      onCancelTurn={async () => undefined}
      onRemoveQueued={async () => undefined}
      onRefresh={() => undefined}
    />);
    expect(html.match(/role="tab"/gu)).toHaveLength(4);
    expect(html).toContain(">画布</button>");
    expect(html).toContain(">素材</button>");
    expect(html).toContain('aria-selected="true">生成记录</button>');
    expect(html).toContain(">成片</button>");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("制作详情");
    expect(html).not.toContain("供应商已配置");
    expect(html).not.toContain("Adapter 配置");
  });

  it("uses creator-facing names while keeping production identifiers available to the data model", () => {
    const episode = "剧集/EP001";
    const production = parseEpisodeProduction({
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 门外停步\n- 时长：4s\n\n## SHOT-EP001-002 · 推门入室\n- 时长：2.5s",
      [`${episode}/图片提示词.md`]: "## IMG-EP001-CARD · 泛黄卡片\n\n### 可复制提示词\n> 一张泛黄卡片"
    }, episode);

    expect(targetDisplayName(production, "SHOT-EP001-001")).toBe("门外停步");
    expect(targetDisplayName(production, "IMG-EP001-CARD")).toBe("泛黄卡片");
    expect(targetDisplayName(production, "BATCH-VIDEOS")).toBe("批量镜头视频");

    const html = renderToStaticMarkup(<SequenceBoard
      production={production}
      jobs={[]}
      sequence={[{ shotId: "SHOT-EP001-001", versionId: "still" }, { shotId: "SHOT-EP001-002", versionId: "video" }]}
      versions={versions}
      episodeDirectory={episode}
      onSequenceChange={() => undefined}
      onCompose={() => undefined}
    />);
    expect(html).toContain(">门外停步</strong>");
    expect(html).toContain("选择 门外停步 成片素材");
    expect(html).toContain("泛黄卡片 · 静帧 · card.webp");
  });

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

  it("renders an inline final MP4 preview player in SequenceBoard when 制作成果/成片/成片.mp4 exists", () => {
    const finalCut = {
      id: "final-cut",
      targetId: "剧集/EP001",
      kind: "video" as const,
      url: "/media/final.mp4",
      path: "剧集/EP001/制作成果/成片/成片.mp4"
    };
    const html = renderToStaticMarkup(<SequenceBoard
      jobs={[]}
      sequence={[{ shotId: "SHOT-EP001-001", versionId: "still" }, { shotId: "SHOT-EP001-002", versionId: "video" }]}
      versions={versions}
      libraryVersions={[...versions, finalCut]}
      episodeDirectory="剧集/EP001"
      onOpenMedia={() => undefined}
      onSequenceChange={() => undefined}
      onCompose={() => undefined}
    />);
    expect(html).toContain('class="oh-story-sequence-cut"');
    expect(html).toContain('<video class="oh-story-sequence-cut-player" src="/media/final.mp4" controls="" preload="metadata">');
    expect(html).toContain(">最新成片</strong>");
    expect(html).toContain(">打开文件</button>");
  });

  it("shows 去写图片提示词 for unresolved VISUAL-*, audio preview for MUSIC-*/audio library, and group role on shot cards", () => {
    const episode = "剧集/EP001";
    const production = parseEpisodeProduction({
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- ID：VISUAL-CHAR-JIANGCHEN\n- 外观特征：旧疤",
      [`${episode}/图片提示词.md`]: "## IMG-DOOR · 旧门\n### 可复制提示词\n> 旧木门",
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 门外停步\n- 时长：4s",
      [`${episode}/视频提示词.md`]: "## MUSIC-EP001-01 · 悬疑铺底\n- 剧情作用：烘托紧张\n### 可复制提示词\n> Dark synth"
    }, episode);
    const audioVersion = {
      id: "music-1",
      targetId: "MUSIC-EP001-01",
      kind: "audio" as const,
      url: "/media/bgm.mp3",
      path: `${episode}/制作成果/MUSIC-EP001-01/bgm.mp3`
    };
    const assetsHtml = renderToStaticMarkup(<DramaProductionView
      sessionId="s1"
      production={production}
      sessionRunning={false}
      queue={[]}
      section="assets"
      selectedId={undefined}
      jobs={[]}
      versions={[audioVersion]}
      libraryVersions={[audioVersion]}
      selections={{}}
      manualReferences={{}}
      sequence={[]}
      canvas={{}}
      viewport={undefined}
      onSectionChange={() => undefined}
      onSelect={() => undefined}
      onNavigate={() => undefined}
      onJobsChange={() => undefined}
      onSelectionsChange={() => undefined}
      onManualReferencesChange={() => undefined}
      onOpenMedia={() => undefined}
      onSequenceChange={() => undefined}
      onCanvasChange={() => undefined}
      onViewportChange={() => undefined}
      onDispatchPrompt={async () => undefined}
      onCancelTurn={async () => undefined}
      onRemoveQueued={async () => undefined}
      onRefresh={() => undefined}
    />);
    expect(assetsHtml).toContain(">去写图片提示词</button>");
    expect(assetsHtml).toContain(">准备素材</button>");
    expect(assetsHtml).toContain('<option value="audio">音频</option>');
    expect(assetsHtml).toContain('<audio class="oh-story-media-preview oh-story-audio-preview" src="/media/bgm.mp3" controls="" preload="metadata">');

    const shotsHtml = renderToStaticMarkup(<DramaProductionView
      sessionId="s1"
      production={production}
      sessionRunning={false}
      queue={[]}
      section="shots"
      selectedId={undefined}
      jobs={[]}
      versions={[]}
      libraryVersions={[]}
      selections={{}}
      manualReferences={{}}
      sequence={[]}
      canvas={{}}
      viewport={undefined}
      onSectionChange={() => undefined}
      onSelect={() => undefined}
      onNavigate={() => undefined}
      onJobsChange={() => undefined}
      onSelectionsChange={() => undefined}
      onManualReferencesChange={() => undefined}
      onOpenMedia={() => undefined}
      onSequenceChange={() => undefined}
      onCanvasChange={() => undefined}
      onViewportChange={() => undefined}
      onDispatchPrompt={async () => undefined}
      onCancelTurn={async () => undefined}
      onRemoveQueued={async () => undefined}
      onRefresh={() => undefined}
    />);
    expect(shotsHtml).toContain('class="oh-story-shot-card" role="group"');
    expect(shotsHtml).not.toContain('class="oh-story-shot-card" role="button"');
  });

  it("surfaces optional/model env vars inside .oh-story-production-details wrapper alongside diagnostics", () => {
    const html = renderToStaticMarkup(<ProductionStatus
      sessionId="s1"
      initialOpen
      initialPreflight={{
        python: { ok: true, version: "3.12.0", minimum: "3.10" },
        adapterConfig: { path: "/tmp/drama-adapters.json", generated: true, ok: true },
        adapters: [
          {
            name: "openai-image",
            label: "OpenAI Image",
            modality: "image",
            configured: true,
            missing: [],
            optionalEnv: [
              { name: "OPENAI_IMAGE_MODEL", label: "默认图片模型", configured: false, note: "未设置时需在任务参数显式指定模型" }
            ]
          },
          {
            name: "seedance",
            label: "Seedance",
            modality: "video",
            configured: true,
            missing: []
          }
        ]
      }}
      diagnostics={[{
        severity: "warning",
        code: "generated_visual_id",
        path: "剧集/EP001/视觉设定.md",
        offset: 0,
        line: 1,
        message: "缺少稳定的 VISUAL-* ID"
      }]}
      onNavigate={() => undefined}
    />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="oh-story-production-details" class="oh-story-production-details" role="region"');
    expect(html).toContain("需指定模型或设置 <code>OPENAI_IMAGE_MODEL</code>");
    expect(html).toContain('class="oh-story-provider-optional-env"');
    expect(html).toContain("未设置时需在任务参数显式指定模型");
    expect(html).toContain('id="oh-story-production-environment"');
    expect(html).toContain('id="oh-story-production-diagnostics"');
  });
});
