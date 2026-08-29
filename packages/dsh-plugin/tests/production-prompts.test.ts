import { describe, expect, it } from "vitest";
import { nativeBatchPrompt, nativeCompositionPrompt, nativeProductionPrompt } from "../src/client/production-prompts.js";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import { createPendingJob, referencesForTarget, type ProductionMediaVersion } from "../src/client/production-runtime.js";

const episodeDirectory = "剧集/EP001";
const production = parseEpisodeProduction({
  [`${episodeDirectory}/分镜.md`]: `## SHOT-EP001-001 · 门外停步\n- 时长：4s\n\n### 冻结关键帧提示词\n> 江辰站在旧门外。`
}, episodeDirectory);

describe("DSH-native production prompts", () => {
  it("dispatches one explicit job through the short-drama skill and DSH authority", () => {
    const job = createPendingJob({ id: "job-001", targetId: "SHOT-EP001-001", kind: "video", prompt: "人物缓慢收回右手。" });
    const reference: ProductionMediaVersion = {
      id: "reference-001",
      targetId: "IMG-JIANGCHEN",
      kind: "image",
      url: "/oh-story/media?sessionId=s1",
      path: "剧集/EP001/制作成果/IMG-JIANGCHEN/reference.png"
    };
    const prompt = nativeProductionPrompt(production, job, [reference]);

    expect(prompt).toMatch(/^\/short-drama-produce/u);
    expect(prompt).toContain("任务 ID：job-001");
    expect(prompt).toContain("剧集/EP001/制作成果/SHOT-EP001-001");
    expect(prompt).toContain(reference.path);
    expect(prompt).toContain("当前 DSH Preset 可见的工具");
    expect(prompt).toContain("DSH 权限与审批");
    expect(prompt).toContain("只准备当前单项生产任务，不运行 Provider");
    expect(prompt).toContain("建议 adapter 契约：seedance");
    expect(prompt).toContain("不得 confirm 或 run");
    expect(prompt).toContain("不构成看到预览后的生产确认");
  });

  it("keeps batch outputs correlatable and composition order explicit", () => {
    const batch = createPendingJob({ id: "batch-001", targetId: "BATCH-KEYFRAMES", kind: "image", prompt: "batch", expectedOutputs: 2 });
    const batchPrompt = nativeBatchPrompt(production, batch, [
      { id: "SHOT-EP001-001", prompt: "第一镜" },
      { id: "SHOT-EP001-002", prompt: "第二镜" }
    ]);
    expect(batchPrompt).toContain("对应镜头 ID 与批次任务 ID batch-001");
    expect(batchPrompt).toContain("## SHOT-EP001-002\n第二镜");
    expect(batchPrompt).toContain("建议 adapter 契约：gpt-image-2");
    expect(batchPrompt).toContain("不得 confirm 或 run");

    const composition = createPendingJob({ id: "compose-001", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    const compositionPrompt = nativeCompositionPrompt(production, composition, ["one.mp4", "two.mp4"]);
    expect(compositionPrompt).toContain("1. one.mp4\n2. two.mp4");
    expect(compositionPrompt).toContain("成片-compose-001.mp4");
    expect(compositionPrompt).toContain("遵守 DSH 权限与审批");
  });

  it("adds explicit cross-episode image references without accepting videos as reference images", () => {
    const image: ProductionMediaVersion = {
      id: "workspace:ep2-image",
      targetId: "IMG-EP002-HERO",
      kind: "image",
      url: "/media/image",
      path: "剧集/EP002/制作成果/IMG-EP002-HERO/hero.png"
    };
    const video: ProductionMediaVersion = { ...image, id: "workspace:ep2-video", kind: "video", url: "/media/video", path: "剧集/EP002/制作成果/SHOT-EP002-001/shot.mp4" };
    expect(referencesForTarget("SHOT-EP001-001", production, [], {}, [image, video], {
      "SHOT-EP001-001": [image.id, video.id]
    })).toEqual([image]);
  });
});
