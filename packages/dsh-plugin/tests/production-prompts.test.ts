import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nativeBatchPrompt, nativeCompositionPrompt, nativeProductionPrompt } from "../src/client/production-prompts.js";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import { createPendingJob, referencesForTarget, type ProductionMediaVersion } from "../src/client/production-runtime.js";
import { dshDramaSkillContent } from "../src/skill-provider.js";

const dramaRoot = resolve(import.meta.dirname, "../../knowledge/drama/skills");
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

  it("keeps listed references supplementary and takes frame roles from the storyboard's 用途", () => {
    const video = createPendingJob({ id: "job-002", targetId: "SHOT-EP001-001", kind: "video", prompt: "人物缓慢收回右手。" });
    const prompt = nativeProductionPrompt(production, video, []);
    expect(prompt).toContain("工作台列出的补充参考（不是生产输入快照）");
    expect(prompt).toContain("reference_bindings 必须与该条目逐槽一致");
    expect(prompt).toContain("起始帧与结束帧的角色只取自《分镜.md》「输入参考图」各槽位记录的用途（起始帧／结束帧）");
    expect(prompt).toContain("尾帧（用途：结束帧）绝不能当普通参考图提交");
    // Upstream's SHOT-* selector only yields the start frame; that note matters to image jobs alone.
    expect(prompt).not.toContain("SHOT-* 只产出起始帧");
    const image = createPendingJob({ id: "job-003", targetId: "SHOT-EP001-001", kind: "image", prompt: "江辰站在旧门外。" });
    expect(nativeProductionPrompt(production, image, [])).toContain("分镜.md 的 SHOT-* 只产出起始帧；要产出结束帧，先由图片提示词阶段建立独立的 IMG-* 条目再投产。");
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
    expect(compositionPrompt).toMatch(/^\/short-drama-edit/u);
    expect(compositionPrompt).toContain("1. one.mp4\n2. two.mp4");
    expect(compositionPrompt).toContain("剧集/EP001/剪辑单.md");
    expect(compositionPrompt).toContain("剧集/EP001/制作成果/成片/");
    expect(compositionPrompt).toContain("先写剪辑单再渲染");
    expect(compositionPrompt).toContain("遵守 DSH 权限与审批");
  });

  it("hands assembly the edit_tool 0.7.1 rules for unused shots, clip formats, subtitles and delivery", () => {
    const composition = createPendingJob({ id: "compose-002", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    const prompt = nativeCompositionPrompt(production, composition, ["one.mp4"]);
    expect(prompt).toContain("视频提示词.md 里的每个「## MOTION-*」都必须作为某个 CUT 的「来源」");
    expect(prompt).toContain("第一个「## CUT-」之前");
    expect(prompt).toContain("写明属于文件缺失、质量不可用还是叙事取舍");
    expect(prompt).toContain("所有 CUT 的素材必须同宽、同高、同帧率");
    expect(prompt).toContain("输出到原文件旁边的新文件，不覆盖已生产的素材");
    expect(prompt).toContain("把「来源」改指新文件");
    expect(prompt).toContain("默认的硬字幕路线需要带 libass 的 ffmpeg");
    expect(prompt).not.toContain("零依赖");
    expect(prompt).toContain("剪辑单的「声音」行只是记录，render 不执行它");
    expect(prompt).toContain("先写到临时文件，再替换 剧集/EP001/制作成果/成片/成片.mp4");
    expect(prompt).toContain("最后对交付的这份成片.mp4 运行 edit_tool.py verify");
    expect(prompt).toContain("「未测」项照实写未测");
  });

  it("writes 未采用镜头 in the exact form the pinned edit_tool.py accepts", async () => {
    // Pin the upstream parser, then hold both the composition prompt and the edit overlay to it.
    const tool = await readFile(resolve(dramaRoot, "short-drama-edit/scripts/edit_tool.py"), "utf8");
    expect(tool).toContain(String.raw`UNUSED_LINE = re.compile(r"^-\s*未采用镜头：\s*(.*)$")`);
    expect(tool).toContain(String.raw`item.strip() for item in unused_match.group(1).split("；")`);
    expect(tool).toContain(String.raw`re.fullmatch(r"(MOTION-[\w-]+)\s*[（(]理由[：:]\s*(.+?)[）)]", note.strip())`);
    const unusedLine = /^-\s*未采用镜头：\s*(.*)$/u;
    const unusedItem = /^(MOTION-[\w-]+)\s*[（(]理由[：:]\s*(.+?)[）)]$/u;

    const composition = createPendingJob({ id: "compose-003", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    const sources = [
      nativeCompositionPrompt(production, composition, ["one.mp4"]),
      dshDramaSkillContent("short-drama-edit", "", dramaRoot)
    ];
    for (const source of sources) {
      const template = /- 未采用镜头：[^`」\n]+/u.exec(source)?.[0];
      expect(template).toBeDefined();
      // Fill the placeholders the way a real cut list would.
      let counter = 0;
      const line = template!.replaceAll("MOTION-…", () => `MOTION-EP001-00${String(++counter)}`).replaceAll("…", "尚未生产");
      const items = unusedLine.exec(line)?.[1]?.split("；").map((item) => item.trim()).filter((item) => item !== "") ?? [];
      expect(items.length).toBeGreaterThanOrEqual(2);
      for (const item of items) expect(unusedItem.exec(item)?.[2]?.trim(), item).toBeTruthy();
    }
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
