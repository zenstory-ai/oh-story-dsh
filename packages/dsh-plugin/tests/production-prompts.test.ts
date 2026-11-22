import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  nativeBatchPrompt,
  nativeCompositionPrompt,
  nativeMusicProductionPrompt,
  nativeProductionPrompt,
  nativeVisualImagePromptRequest
} from "../src/client/production-prompts.js";
import { parseEpisodeProduction } from "../src/client/drama-production.js";
import { createPendingJob, referencesForTarget, type ProductionMediaVersion } from "../src/client/production-runtime.js";
import { dshDramaSkillContent } from "../src/skill-provider.js";

const dramaRoot = resolve(import.meta.dirname, "../../knowledge/drama/skills");
const episodeDirectory = "剧集/EP001";
const production = parseEpisodeProduction({
  [`${episodeDirectory}/分镜.md`]: `## SHOT-EP001-001 · 门外停步\n- 时长：4s\n\n### 冻结关键帧提示词\n> 江辰站在旧门外。`
}, episodeDirectory);
const videoSources = [
  { shotId: "SHOT-EP001-001", sourceId: "MOTION-EP001-001", kind: "video" as const, path: "one.mp4" },
  { shotId: "SHOT-EP001-002", sourceId: "MOTION-EP001-002", kind: "video" as const, path: "two.mp4" }
];

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
    expect(prompt).toContain("请为「门外停步」准备一份视频生成预览，先让我核对内容和成本，再决定是否开始生成。");
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

  it("keeps listed references supplementary and takes frame roles from the source entry's own 用途", () => {
    const video = createPendingJob({ id: "job-002", targetId: "SHOT-EP001-001", kind: "video", prompt: "人物缓慢收回右手。" });
    const prompt = nativeProductionPrompt(production, video, []);
    expect(prompt).toContain("工作台列出的补充参考（不是生产输入快照）");
    expect(prompt).toContain("reference_bindings 必须与该条目逐槽一致");
    expect(prompt).toContain("起始帧与结束帧的角色只取自来源条目自己「输入参考图」各槽位记录的用途（起始帧／结束帧）：SHOT-* 看《分镜.md》，MOTION-* 看《视频提示词.md》");
    expect(prompt).toContain("目标方言用 first_frame／last_frame 位置承接这组输入时，结束帧只进 last_frame，绝不降级成普通参考图");
    // MiniMax H3 cannot mix frame and reference inputs, so a mixed group goes out whole as reference_image.
    expect(prompt).toContain("方言要求整组走多槽参考时（如 MiniMax H3 的 full-reference：首尾帧输入与参考输入互斥，起始帧、结束帧都随整组以 reference_image 送入）");
    expect(prompt).toContain("并在预览里写明结束帧将作为参考图送入，或先请分镜 owner 取舍");
    expect(prompt).toContain("MOTION-* 的「参考音频」不混入「输入参考图」");
    expect(prompt).toContain("role 固定为 reference_audio，character 逐字照抄该行「角色」");
    expect(prompt).toContain("内置 seedance 与 minimax-h3 在所选模型支持时默认承接 reference_audio");
    expect(prompt).toContain("自定义外部 adapter profile 未显式声明支持 reference_audio 时必须在提交前失败");
    expect(prompt).not.toContain("绝不能当普通参考图提交");
    // Upstream's SHOT-* selector only yields the start frame; that note matters to image jobs alone.
    expect(prompt).not.toContain("SHOT-* 只产出起始帧");
    const image = createPendingJob({ id: "job-003", targetId: "SHOT-EP001-001", kind: "image", prompt: "江辰站在旧门外。" });
    expect(nativeProductionPrompt(production, image, [])).toContain("分镜.md 的 SHOT-* 只产出起始帧；要产出结束帧，先由图片提示词阶段建立独立的 IMG-* 条目再投产。");
  });

  it("gives batch jobs the same reference rules as single jobs", () => {
    const keyframes = createPendingJob({ id: "batch-002", targetId: "BATCH-KEYFRAMES", kind: "image", prompt: "batch", expectedOutputs: 1 });
    const videos = createPendingJob({ id: "batch-003", targetId: "BATCH-VIDEOS", kind: "video", prompt: "batch", expectedOutputs: 1 });
    const candidates = [{ id: "SHOT-EP001-001", prompt: "第一镜" }];
    const referenceRules = /参考输入以来源条目自己的声明为准[^\n]+/u;
    const single = (job: typeof keyframes) => referenceRules.exec(nativeProductionPrompt(production, { ...job, targetId: "SHOT-EP001-001" }, []))?.[0];
    expect(referenceRules.exec(nativeBatchPrompt(production, keyframes, candidates))?.[0]).toBe(single(keyframes));
    expect(referenceRules.exec(nativeBatchPrompt(production, videos, candidates))?.[0]).toBe(single(videos));
    expect(nativeBatchPrompt(production, videos, candidates)).not.toContain("SHOT-* 只产出起始帧");
  });

  it("keeps batch outputs correlatable and composition order explicit", () => {
    const batch = createPendingJob({ id: "batch-001", targetId: "BATCH-KEYFRAMES", kind: "image", prompt: "batch", expectedOutputs: 2 });
    const batchPrompt = nativeBatchPrompt(production, batch, [
      { id: "SHOT-EP001-001", prompt: "第一镜" },
      { id: "SHOT-EP001-002", prompt: "第二镜" }
    ]);
    expect(batchPrompt).toContain("对应镜头 ID 与批次任务 ID batch-001");
    expect(batchPrompt).toContain("请为这 2 个镜头准备一份关键帧生成预览，先让我核对内容和成本，再决定是否开始生成。");
    expect(batchPrompt).toContain("## SHOT-EP001-002\n第二镜");
    expect(batchPrompt).toContain("建议 adapter 契约：openai-image");
    expect(batchPrompt).toContain("不得 confirm 或 run");

    const composition = createPendingJob({ id: "compose-001", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    const compositionPrompt = nativeCompositionPrompt(production, composition, videoSources);
    expect(compositionPrompt).toMatch(/^\/short-drama-edit/u);
    expect(compositionPrompt).toContain("1. SHOT-EP001-001 → MOTION-EP001-001 · 视频 · one.mp4\n2. SHOT-EP001-002 → MOTION-EP001-002 · 视频 · two.mp4");
    expect(compositionPrompt).toContain("显式选源优先于自动结果");
    expect(compositionPrompt).toContain("剧集/EP001/剪辑单.md");
    expect(compositionPrompt).toContain("剧集/EP001/制作成果/成片/");
    expect(compositionPrompt).toContain("先写剪辑单再渲染");
    expect(compositionPrompt).toContain("剪辑单记录素材取舍、入出点、后期处理与交付规格，不改写剧本、分镜或视频提示词的语义；不要退回去生成新素材。");
    expect(compositionPrompt).not.toContain("剪辑单只做取舍");
    expect(compositionPrompt).toContain("遵守 DSH 权限与审批");
  });

  it("declares mixed SHOT and IMG static sources with their paths and storyboard durations", () => {
    const composition = createPendingJob({ id: "compose-static", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    const prompt = nativeCompositionPrompt(production, composition, [
      { shotId: "SHOT-EP001-001", sourceId: "SHOT-EP001-001", kind: "image", path: "制作成果/SHOT-EP001-001/key.png", durationSeconds: 4 },
      { shotId: "SHOT-EP001-002", sourceId: "IMG-EP001-DOOR", kind: "image", path: "制作成果/IMG-EP001-DOOR/door.webp", durationSeconds: 2.5 },
      videoSources[1]!
    ]);
    expect(prompt).toContain("1. SHOT-EP001-001 → SHOT-EP001-001 · 静帧 · 制作成果/SHOT-EP001-001/key.png · 分镜时长 4 秒");
    expect(prompt).toContain("2. SHOT-EP001-002 → IMG-EP001-DOOR · 静帧 · 制作成果/IMG-EP001-DOOR/door.webp · 分镜时长 2.5 秒");
    expect(prompt).toContain("3. SHOT-EP001-002 → MOTION-EP001-002 · 视频 · two.mp4");
    expect(prompt).toContain("静帧的来源逐字使用给出的 SHOT-* 或 IMG-*");
    expect(prompt).toContain("须先量出真实有声区间并据此排时长，不能截断台词");
  });

  it("hands assembly the edit_tool 0.12.0 rules for static cuts, GROUP/MOTION accounting, aspect-ratio normalisation, audio and delivery", () => {
    const composition = createPendingJob({ id: "compose-002", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    const prompt = nativeCompositionPrompt(production, composition, videoSources.slice(0, 1));
    expect(prompt).toContain("静帧段来源写分镜里的 SHOT-* 或图片提示词里的 IMG-*");
    expect(prompt).toContain("不得因为省钱、失败或排队自行把视频改成静帧");
    expect(prompt).toContain("同一镜用了 SHOT-* 可同时覆盖对应 MOTION-*");
    expect(prompt).toContain("第一个「## CUT-」之前");
    expect(prompt).toContain("写明属于文件缺失、质量不可用还是叙事取舍");
    expect(prompt).toContain("同宽高比但分辨率或帧率不同的视频素材由 check 提醒、render 自动缩放并转换帧率至交付规格");
    expect(prompt).toContain("静帧则按交付规格等比铺满、居中裁切并按运镜出画");
    expect(prompt).toContain("静帧来源入点写 0.00、出点等于时长（硬下限为 2 帧即 24fps 下 0.08 秒，短于 0.50 秒会列入提醒）");
    expect(prompt).toContain("新文件写到 剧集/EP001/制作成果/成片/规格统一/——这是剪辑阶段自己的中间文件，不放在生产阶段的原素材旁边、不覆盖已生产的素材");
    expect(prompt).toContain("文件名也不沿用原文件里的任务 ID");
    expect(prompt).not.toContain("原文件旁边的新文件");
    expect(prompt).toContain("把「来源」改指新文件");
    expect(prompt).toContain("默认的硬字幕路线以及普通「字卡」的 ffmpeg 降级路线需要带 libass 的 ffmpeg");
    expect(prompt).toContain("--screen-text-mode auto");
    expect(prompt).toContain("--screen-text-mode ffmpeg");
    expect(prompt).toContain("--screen-text-mode off");
    expect(prompt).toContain("--overlay-renderer");
    expect(prompt).not.toContain("剪辑单里只要有「画面文字」行也必须要它");
    expect(prompt).not.toContain("未同意就不写「画面文字」行");
    expect(prompt).toContain("混入「音效」「配音」「环境声」行");
    expect(prompt).toContain("配音可用负起点做 J-cut，也可跨切点做 L-cut");
    expect(prompt).not.toContain("零依赖");
    expect(prompt).toContain("剪辑单的「声音」行只是记录，render 不执行它");
    expect(prompt).toContain("这一步最后要像 render 一样按剪辑单的「交付响度」对整片做两遍 loudnorm（I=交付响度、TP=真峰值上限（默认 -1.5）、LRA=11，第二遍代入第一遍的实测值并用 linear=true），音频编码为 AAC 192k、48 kHz，然后才替换 剧集/EP001/制作成果/成片/成片.mp4");
    expect(prompt).toContain("最后对交付的这份成片.mp4 运行 edit_tool.py verify");
    expect(prompt).toContain("「未测」项照实写未测");
  });

  it("ends an external mix with the loudnorm pass the pinned render runs", async () => {
    // Pin render's own two-pass loudnorm and audio encode, then hold both the prompt and the overlay to them.
    const tool = await readFile(resolve(dramaRoot, "short-drama-edit/scripts/edit_tool.py"), "utf8");
    expect(tool).toContain("DEFAULT_TRUE_PEAK_DBTP = -1.5");
    expect(tool).toContain('common = f"I={target}:TP={true_peak:g}:LRA=11"');
    expect(tool).toContain(":offset={measured['target_offset']}:linear=true:print_format=summary");
    expect(tool).toContain('command += ["-af", loudnorm, "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]');

    const composition = createPendingJob({ id: "compose-004", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    expect(nativeCompositionPrompt(production, composition, videoSources.slice(0, 1))).toContain("I=交付响度、TP=真峰值上限（默认 -1.5）、LRA=11");
    const overlay = dshDramaSkillContent("short-drama-edit", "", dramaRoot);
    expect(overlay).toContain("ends as render does with whole-film two-pass loudnorm to the declared 交付响度 (I=<交付响度>:TP=<真峰值上限，默认 -1.5>:LRA=11, the second pass fed the first pass's measurements with linear=true, audio re-encoded as AAC 192k at 48 kHz), and only then replaces 剧集/<EP>/制作成果/成片/成片.mp4");
  });

  it("writes 未采用镜头 in the exact form the pinned edit_tool.py accepts", async () => {
    // Pin the upstream parser, then hold both the composition prompt and the edit overlay to it.
    const tool = await readFile(resolve(dramaRoot, "short-drama-edit/scripts/edit_tool.py"), "utf8");
    expect(tool).toContain("UNUSED_LINE = re.compile(");
    expect(tool).toContain("unused.extend(_split_unused_items(unused_match.group(1)))");
    expect(tool).toContain(String.raw`r"^((?:MOTION|GROUP|SHOT|IMG)-[\w-]+)\s*([（(])(.*)$"`);
    const unusedLine = /^-\s*未采用镜头：\s*(.*)$/u;
    const unusedItem = /^((?:MOTION|GROUP|SHOT|IMG)-[\w-]+)\s*[（(]理由[：:]\s*(.+?)[）)]$/u;

    const composition = createPendingJob({ id: "compose-003", targetId: episodeDirectory, kind: "composition", prompt: "合成" });
    const sources = [
      nativeCompositionPrompt(production, composition, videoSources.slice(0, 1)),
      dshDramaSkillContent("short-drama-edit", "", dramaRoot)
    ];
    for (const source of sources) {
      const template = /- 未采用镜头：[^`」\n]+/u.exec(source)?.[0];
      expect(template).toBeDefined();
      // Fill the placeholders the way a real cut list would.
      let counter = 0;
      const line = template!
        .replaceAll("MOTION-…", () => `MOTION-EP001-00${String(++counter)}`)
        .replaceAll("GROUP-…", () => `GROUP-EP001-0${String(++counter)}`)
        .replaceAll("SHOT-…", () => `SHOT-EP001-00${String(++counter)}`)
        .replaceAll("…", "尚未生产");
      const items = unusedLine.exec(line)?.[1]?.split("；").map((item) => item.trim()).filter((item) => item !== "") ?? [];
      expect(items.length).toBeGreaterThanOrEqual(3);
      for (const item of items) expect(unusedItem.exec(item)?.[2]?.trim(), item).toBeTruthy();
    }
  });

  it("routes unresolved VISUAL-* entries to /short-drama-image-prompts and prepares MUSIC-* without track_job", () => {
    const visualPrompt = nativeVisualImagePromptRequest(production, {
      id: "VISUAL-CHAR-JIANGCHEN",
      title: "江辰",
      path: `${episodeDirectory}/视觉设定.md`
    });
    expect(visualPrompt).toMatch(/^\/short-drama-image-prompts/u);
    expect(visualPrompt).toContain("VISUAL-CHAR-JIANGCHEN");
    expect(visualPrompt).toContain(`${episodeDirectory}/图片提示词.md`);
    expect(visualPrompt).not.toContain("/short-drama-produce");

    const musicPrompt = nativeMusicProductionPrompt(production, {
      id: "MUSIC-EP001-01",
      title: "监控室悬疑铺底",
      prompt: "Dark minimalist suspense underscore."
    });
    expect(musicPrompt).toMatch(/^\/short-drama-produce/u);
    expect(musicPrompt).toContain("MUSIC-EP001-01");
    expect(musicPrompt).toContain("minimax-music");
    expect(musicPrompt).toContain("不调用 oh_story_production track_job");
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

  it("passes canonical GROUP-* / MOTION-* source_entry for video production while keeping shot context", () => {
    const groupedProduction = parseEpisodeProduction({
      [`${episodeDirectory}/分镜.md`]: [
        "## SHOT-EP001-001 · 抬头",
        "- 时长：4s",
        "## SHOT-EP001-002 · 转身",
        "- 时长：4s",
        "## SHOT-EP001-003 · 推门",
        "- 时长：3s"
      ].join("\n"),
      [`${episodeDirectory}/视频提示词.md`]: [
        "## MOTION-EP001-001 · 抬头",
        "- 分镜：SHOT-EP001-001",
        "### 可复制提示词",
        "> Look up.",
        "## MOTION-EP001-002 · 转身",
        "- 分镜：SHOT-EP001-002",
        "### 可复制提示词",
        "> Turn around.",
        "## MOTION-EP001-003 · 推门",
        "- 分镜：SHOT-EP001-003",
        "### 可复制提示词",
        "> Push the door.",
        "## GROUP-EP001-01 · 抬头接转身",
        "- 成员：MOTION-EP001-001、MOTION-EP001-002",
        "### 可复制提示词",
        "> Continuous look-up into turn."
      ].join("\n")
    }, episodeDirectory);

    const groupJob = createPendingJob({ id: "vid-group-1", targetId: "GROUP-EP001-01", kind: "video", prompt: "Continuous look-up into turn." });
    const groupPrompt = nativeProductionPrompt(groupedProduction, groupJob, []);
    expect(groupPrompt).toContain("投产对象（source_entry）：GROUP-EP001-01（对应分镜：SHOT-EP001-001、SHOT-EP001-002）");
    expect(groupPrompt).toContain(`${episodeDirectory}/制作成果/GROUP-EP001-01`);

    // Even if a bare SHOT-* id reaches nativeProductionPrompt for a video job, it resolves to GROUP-* / MOTION-*.
    const shotVideoJob = createPendingJob({ id: "vid-shot-3", targetId: "SHOT-EP001-003", kind: "video", prompt: "Push the door." });
    const motionPrompt = nativeProductionPrompt(groupedProduction, shotVideoJob, []);
    expect(motionPrompt).toContain("投产对象（source_entry）：MOTION-EP001-003（对应分镜：SHOT-EP001-003）");
    expect(motionPrompt).toContain(`${episodeDirectory}/制作成果/MOTION-EP001-003`);

    const batchJob = createPendingJob({ id: "vid-batch-1", targetId: "BATCH-VIDEOS", kind: "video", prompt: "batch", expectedOutputs: 2 });
    const batchPrompt = nativeBatchPrompt(groupedProduction, batchJob, [
      { id: "SHOT-EP001-001", prompt: "Continuous look-up into turn." },
      { id: "SHOT-EP001-002", prompt: "Continuous look-up into turn." },
      { id: "MOTION-EP001-003", prompt: "Push the door." }
    ]);
    expect(batchPrompt).toContain("投产对象（source_entry）：GROUP-EP001-01、MOTION-EP001-003");
    expect(batchPrompt).toContain("## GROUP-EP001-01（对应分镜：SHOT-EP001-001、SHOT-EP001-002）");
    expect(batchPrompt).toContain("## MOTION-EP001-003（对应分镜：SHOT-EP001-003）");
    expect(batchPrompt.match(/## GROUP-EP001-01/gu)).toHaveLength(1);
  });
});
