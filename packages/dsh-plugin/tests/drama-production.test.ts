import { describe, expect, it } from "vitest";
import {
  creatorDocumentPaths,
  episodeDirectoryForPath,
  parseEpisodeProduction,
  parseImagePrompts,
  parseMusicPrompts,
  parseStoryboard,
  parseVideoGroups,
  parseVideoPrompts,
  productionCompleteness,
  productionKnownTargets,
  resolveMediaTargetIds,
  targetDisplayName
} from "../src/client/drama-production.js";

const episode = "剧集/EP001";
const storyboard = `# EP001 分镜

## SHOT-EP001-001 · 门外停步
- 来源：EP001-SC001
- 时长：4s
- 目的：先停住，再揭示门内声音。
- 景别/机位：中近景，轻微低机位。
- 起点：右手悬在门把上方。
- 终点：手收回。
- 图片提示词项：IMG-JIANGCHEN-SHEET《江辰角色板》；IMG-OLD-DOOR《旧门场景板》。

### 冻结关键帧提示词
> 江辰站在旧门外，右手悬停。

## 说明
不是镜头。
`;

const imagePrompts = `# 图片提示词

## IMG-JIANGCHEN-SHEET · 江辰角色板
- 用途：锁定人物造型。
- 参考：无。

### 可复制提示词
> 窄长眼，左眉尾旧疤。

## IMG-OLD-DOOR · 旧门场景板
- 用途：锁定门外空间。

### 可复制提示词
> 旧木门，黄铜门把。
`;

const videoPrompts = `# 视频提示词

## MOTION-EP001-001 · 门外停步
- 分镜：SHOT-EP001-001
- 时长：4 秒
- 起始帧：冻结关键帧。
- 终点：右手收回。

### 可复制提示词
> 从悬停开始，人物缓慢收回右手。
`;

describe("short-drama production projection", () => {
  it("recognizes episode creator documents and keeps their canonical order", () => {
    expect(episodeDirectoryForPath("剧集/EP001/分镜.md")).toBe(episode);
    expect(episodeDirectoryForPath("交付/EP001/a.mp4")).toBeUndefined();
    expect(creatorDocumentPaths([
      { path: `${episode}/视频提示词.md` },
      { path: `${episode}/notes.txt` },
      { path: `${episode}/剧本.md` },
      { path: `${episode}/分镜.md` },
      { path: "剧集/EP002/剧本.md" },
      { path: "剧集/EP002/分镜.md" }
    ], episode)).toEqual([`${episode}/剧本.md`, `${episode}/分镜.md`, `${episode}/视频提示词.md`]);
  });

  it("parses stable shots, prompts and cross-document references", () => {
    const shot = parseStoryboard(`${episode}/分镜.md`, storyboard)[0];
    expect(shot).toMatchObject({
      id: "SHOT-EP001-001",
      title: "门外停步",
      source: "EP001-SC001",
      durationSeconds: 4,
      start: "右手悬在门把上方。",
      end: "手收回。",
      references: ["IMG-JIANGCHEN-SHEET", "IMG-OLD-DOOR"],
      keyframePrompt: "江辰站在旧门外，右手悬停。"
    });
    expect(parseImagePrompts(`${episode}/图片提示词.md`, imagePrompts)[0]).toMatchObject({
      id: "IMG-JIANGCHEN-SHEET",
      kind: "character",
      prompt: "窄长眼，左眉尾旧疤。"
    });
    expect(parseVideoPrompts(`${episode}/视频提示词.md`, videoPrompts)[0]).toMatchObject({
      id: "MOTION-EP001-001",
      shotId: "SHOT-EP001-001",
      durationSeconds: 4,
      prompt: "从悬停开始，人物缓慢收回右手。"
    });
  });

  it("projects all documents without turning the projection into a second source of truth", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 门外 · 夜\n江辰：我回来了。",
      [`${episode}/分镜.md`]: storyboard,
      [`${episode}/图片提示词.md`]: imagePrompts,
      [`${episode}/视频提示词.md`]: videoPrompts,
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- ID：VISUAL-CHAR-JIANGCHEN\n- 识别锚点：左眉尾旧疤。"
    }, episode);
    expect(production.shots).toHaveLength(1);
    expect(production.shots[0]?.motion?.id).toBe("MOTION-EP001-001");
    expect(production.targets.get("EP001-SC001")?.path).toBe(`${episode}/剧本.md`);
    expect(production.targets.get("IMG-JIANGCHEN-SHEET")?.path).toBe(`${episode}/图片提示词.md`);
    expect(production.visualAssets[0]).toMatchObject({ title: "江辰", kind: "character" });
    expect(production.protocolVersion).toBe("short-drama/v1");
    expect(production.diagnostics).toEqual([]);
    expect(productionCompleteness(production.shots[0]!)).toEqual({ keyframe: true, motion: true, references: true, complete: true });
  });

  it("reports malformed, duplicate and unresolved protocol relationships instead of silently dropping them", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 门外 · 夜",
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- ID：BAD_ID\n- 识别锚点：左眉尾旧疤。",
      [`${episode}/分镜.md`]: `## SHOT EP001 001 · 错误标题\n\n## SHOT-EP001-001 · A\n- 来源：EP001-SC404\n- 参考：IMG-MISSING\n\n## SHOT-EP001-001 · B`,
      [`${episode}/图片提示词.md`]: "",
      [`${episode}/视频提示词.md`]: `## MOTION-EP001-001 · A\n- 分镜：SHOT-EP001-404\n\n## MOTION-EP001-002 · B`
    }, episode);
    expect(new Set(production.diagnostics.map((item) => item.code))).toEqual(new Set([
      "duplicate_id",
      "invalid_visual_id",
      "malformed_heading",
      "motion_without_shot",
      "unknown_motion_shot",
      "unknown_reference",
      "unknown_source"
    ]));
    expect(production.diagnostics.every((item) => item.line > 0)).toBe(true);
  });

  it("aligns with upstream v0.13.0 输入参考图, bare category dividers, and zero false generated_visual_id warnings", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 门外 · 夜\n许棠停步。",
      [`${episode}/视觉设定.md`]: [
        "## 人物",
        "人物总览说明。",
        "",
        "## 人物 · 许棠",
        "- 外观特征：窄长眼、左眉尾旧疤。",
        "",
        "## 地点",
        "",
        "## 地点 · 旧走廊",
        "- 外观特征：冷青色日光灯。"
      ].join("\n"),
      [`${episode}/图片提示词.md`]: "## IMG-XUTANG · 许棠\n- 用途：外貌\n### 可复制提示词\n> 窄长眼。",
      [`${episode}/分镜.md`]: [
        "## SHOT-EP001-001 · 门外停步",
        "- 来源：EP001-SC001",
        "- 时长：4s",
        "- 输入参考图：PLAN-LOOK（顺序：1）· IMG-XUTANG《许棠》（用途：外貌；控制：面部）；REF-01（顺序：2）· 输入/door.png《旧门》（用途：空间布局）",
        "### 首帧提示词",
        "> 许棠站在旧门外。"
      ].join("\n")
    }, episode);

    expect(production.visualAssets.map((item) => item.title)).toEqual(["许棠", "旧走廊"]);
    expect(production.diagnostics).toEqual([]);
    expect(production.shots[0]?.references).toEqual(["IMG-XUTANG", "REF-01"]);
    expect(productionCompleteness(production.shots[0]!).references).toBe(true);
  });
});

describe("storyboard contract regressions", () => {
  it("reads shot references from the contract field 图片提示词项", () => {
    const shots = parseStoryboard(`${episode}/分镜.md`, storyboard);
    expect(shots[0]?.references).toEqual(["IMG-JIANGCHEN-SHEET", "IMG-OLD-DOOR"]);
    expect(productionCompleteness(shots[0]!).references).toBe(true);
  });

  it("still accepts the legacy 参考 spelling", () => {
    const shots = parseStoryboard(`${episode}/分镜.md`, "## SHOT-A-001 · x\n- 参考：IMG-ONE。\n");
    expect(shots[0]?.references).toEqual(["IMG-ONE"]);
  });

  it("does not raise malformed_heading for a separator the parser accepts", () => {
    const production = parseEpisodeProduction({
      [`${episode}/分镜.md`]: "## SHOT-EP001-001·门外停步\n- 时长：4s\n"
    }, episode);
    expect(production.shots.map((shot) => shot.id)).toEqual(["SHOT-EP001-001"]);
    expect(production.diagnostics.filter((item) => item.code === "malformed_heading")).toEqual([]);
  });

  it("still reports a heading that carries the prefix but no parsable ID", () => {
    const production = parseEpisodeProduction({ [`${episode}/分镜.md`]: "## SHOT 待补编号\n" }, episode);
    expect(production.diagnostics.map((item) => item.code)).toContain("malformed_heading");
  });

  it("says a declared VISUAL id was rejected instead of claiming it is missing", () => {
    const production = parseEpisodeProduction({
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- ID：VISUAL_CHAR_JIANGCHEN\n- 识别锚点：左眉尾旧疤。\n"
    }, episode);
    const diagnostic = production.diagnostics.find((item) => item.code === "invalid_visual_id");
    expect(diagnostic?.message).toContain("VISUAL_CHAR_JIANGCHEN");
    expect(production.diagnostics.map((item) => item.code)).not.toContain("generated_visual_id");
  });
});

describe("storyboard scene sources (Drama Skills 0.6.5, #100)", () => {
  const screenplay = "## EP001-SC001 内 · 门外 · 夜\n\n## EP001-SC002 内 · 走廊 · 夜";

  it("resolves every scene ID named by 来源, including quotes and 、-joined lists", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: screenplay,
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · A\n- 来源：EP001-SC001 「你先进去」、EP001-SC002\n"
    }, episode);
    expect(production.shots[0]?.sceneIds).toEqual(["EP001-SC001", "EP001-SC002"]);
    expect(production.targets.get("EP001-SC002")?.path).toBe(`${episode}/剧本.md`);
    expect(production.targets.get("EP001-SC001")?.id).toBe("EP001-SC001");
    expect(production.diagnostics.filter((item) => item.code === "unknown_source")).toEqual([]);
  });

  it("names the one scene ID the screenplay lacks instead of rejecting the whole field", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: screenplay,
      [`${episode}/分镜.md`]: "## SHOT-EP001-002 · B\n- 来源：EP001-SC002、EP001-SC404\n"
    }, episode);
    expect(production.diagnostics.filter((item) => item.code === "unknown_source").map((item) => item.message))
      .toEqual(["SHOT-EP001-002 的来源 EP001-SC404 在剧本中不存在。"]);
    expect(production.targets.has("EP001-SC002")).toBe(true);
  });

  it("keeps matching a 来源 that names no scene ID against the whole heading", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## 序幕 · 夜",
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · A\n- 来源：序幕\n\n## SHOT-EP001-002 · B\n- 来源：尾声\n"
    }, episode);
    expect(production.shots.map((shot) => shot.sceneIds)).toEqual([[], []]);
    expect(production.targets.get("序幕")?.path).toBe(`${episode}/剧本.md`);
    expect(production.diagnostics.filter((item) => item.code === "unknown_source").map((item) => item.message))
      .toEqual(["SHOT-EP001-002 的来源 尾声 在剧本中不存在。"]);
  });
});

describe("Drama Skills 0.12.0 creator field names and multi-shot groups", () => {
  it("parses 首帧提示词, 开场画面/动作过程, 0.12 asset purposes and valid GROUP-* sections", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 门外 · 夜\n江辰停步。",
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- ID：VISUAL-CHAR-JIANGCHEN\n- 外观特征：左眉尾旧疤。\n- 提示词名称：Jiangchen\n",
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 门外停步\n- 来源：EP001-SC001\n- 时长：4s\n- 动作：右手收回。\n- 出场设定：《视觉设定.md》·人物「江辰」\n\n### 首帧提示词\n> 江辰站在旧门外。\n",
      [`${episode}/图片提示词.md`]: [
        "## IMG-CHAR-A · 江辰",
        "- 用途：外貌",
        "### 可复制提示词",
        "> 人物参考。",
        "## IMG-ROOM-A · 走廊",
        "- 用途：空间布局",
        "### 可复制提示词",
        "> 空间参考。",
        "## IMG-ITEM-A · 钥匙",
        "- 用途：主体",
        "### 可复制提示词",
        "> 物件参考。",
        "## IMG-WET-A · 雨衣湿透",
        "- 用途：造型状态",
        "### 可复制提示词",
        "> 状态参考。"
      ].join("\n"),
      [`${episode}/视频提示词.md`]: [
        "## MOTION-EP001-001 · 门外停步",
        "- 分镜：SHOT-EP001-001",
        "- 时长：4s",
        "- 开场画面：A lean man at an old door.",
        "- 动作过程：悬停 → 收回右手",
        "### 可复制提示词",
        "> He pulls his hand back.",
        "",
        "## GROUP-EP001-01 · 门外连镜",
        "- 成员：MOTION-EP001-001",
        "",
        "## 成片配乐与主题曲",
        "- 曲风：悬疑低频。"
      ].join("\n")
    }, episode);
    expect(production.shots[0]?.keyframePrompt).toBe("江辰站在旧门外。");
    expect(production.shots[0]?.motion).toMatchObject({
      startFrame: "A lean man at an old door.",
      end: "悬停 → 收回右手"
    });
    expect(production.assets.map((asset) => [asset.id, asset.kind])).toEqual([
      ["IMG-CHAR-A", "character"],
      ["IMG-ROOM-A", "scene"],
      ["IMG-ITEM-A", "prop"],
      ["IMG-WET-A", "state"]
    ]);
    expect(production.diagnostics).toEqual([]);
  });

  it("reports a malformed GROUP heading without rejecting valid GROUP-* IDs", () => {
    const production = parseEpisodeProduction({
      [`${episode}/视频提示词.md`]: "## GROUP 待补编号\n"
    }, episode);
    expect(production.diagnostics.map((item) => item.code)).toContain("malformed_heading");
  });
});

describe("Drama Skills 0.13.0 bold keys, GROUP-* linkage, and MUSIC-* entries", () => {
  it("strips surrounding ** / __ from bullet field keys and colon-wrapped bold keys", () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: "## EP001-SC001 内 · 监控室 · 夜\n江辰盯住屏幕。",
      [`${episode}/视觉设定.md`]: "## 人物 · 江辰\n- **ID**：VISUAL-CHAR-JIANGCHEN\n- **外观特征：** 左眉尾旧疤。",
      [`${episode}/分镜.md`]: [
        "## SHOT-EP001-001 · 监控室停步",
        "- **来源**：EP001-SC001",
        "- **时长：** 4s",
        "- __景别/机位__：中近景",
        "- **图片提示词项**：IMG-CHAR-A",
        "### 首帧提示词",
        "> 江辰站在监控室。"
      ].join("\n"),
      [`${episode}/图片提示词.md`]: [
        "## IMG-CHAR-A · 江辰",
        "- **用途**：外貌",
        "- **核心提示词**：窄长眼，左眉尾旧疤。"
      ].join("\n"),
      [`${episode}/视频提示词.md`]: [
        "## MOTION-EP001-001 · 监控室停步",
        "- **分镜**：SHOT-EP001-001",
        "- **时长**：4s",
        "- **开场画面**：Man in control room.",
        "### 可复制提示词",
        "> Camera holds steady."
      ].join("\n")
    }, episode);

    expect(production.diagnostics).toEqual([]);
    expect(production.visualAssets[0]).toMatchObject({ id: "VISUAL-CHAR-JIANGCHEN", stableId: true });
    expect(production.shots[0]).toMatchObject({
      source: "EP001-SC001",
      durationSeconds: 4,
      shotSpec: "中近景",
      references: ["IMG-CHAR-A"]
    });
    expect(production.assets[0]?.prompt).toBe("窄长眼，左眉尾旧疤。");
    expect(production.shots[0]?.motion).toMatchObject({
      id: "MOTION-EP001-001",
      shotId: "SHOT-EP001-001",
      durationSeconds: 4,
      startFrame: "Man in control room."
    });
  });

  it("parses GROUP-* multi-shot entries and links them to member SHOT-* nodes", () => {
    const videoDoc = [
      "## MOTION-EP001-001 · 抬头",
      "- 分镜：SHOT-EP001-001",
      "- 时长：4s",
      "## MOTION-EP001-002 · 转身",
      "- 分镜：SHOT-EP001-002",
      "- 时长：4s",
      "",
      "## GROUP-EP001-01 · 抬头接转身",
      "- **成员**：MOTION-EP001-001、MOTION-EP001-002",
      "- **时长**：8s",
      "- **理由**：同场紧邻连续动作",
      "### 可复制提示词",
      "> Continuous shot from look-up into turn."
    ].join("\n");
    const rawGroups = parseVideoGroups(`${episode}/视频提示词.md`, videoDoc);
    expect(rawGroups[0]).toMatchObject({
      id: "GROUP-EP001-01",
      title: "抬头接转身",
      memberMotionIds: ["MOTION-EP001-001", "MOTION-EP001-002"],
      durationSeconds: 8,
      reason: "同场紧邻连续动作",
      prompt: "Continuous shot from look-up into turn."
    });

    const production = parseEpisodeProduction({
      [`${episode}/分镜.md`]: "## SHOT-EP001-001 · 抬头\n- 时长：4s\n\n## SHOT-EP001-002 · 转身\n- 时长：4s",
      [`${episode}/视频提示词.md`]: videoDoc
    }, episode);
    expect(production.groups[0]?.memberShotIds).toEqual(["SHOT-EP001-001", "SHOT-EP001-002"]);
    expect(production.shots[0]?.group?.id).toBe("GROUP-EP001-01");
    expect(production.shots[1]?.group?.id).toBe("GROUP-EP001-01");
    expect(production.targets.get("GROUP-EP001-01")?.path).toBe(`${episode}/视频提示词.md`);
    expect(targetDisplayName(production, "GROUP-EP001-01")).toBe("抬头接转身");
    expect(productionKnownTargets(production)).toContain("GROUP-EP001-01");
    expect(resolveMediaTargetIds(production, "GROUP-EP001-01")).toEqual([
      "GROUP-EP001-01",
      "SHOT-EP001-001",
      "SHOT-EP001-002"
    ]);
  });

  it("parses MUSIC-* entries and reports malformed MUSIC headings", () => {
    const musicDoc = [
      "## MUSIC-EP001-01 · 监控室悬疑铺底",
      "- **区间**：SHOT-EP001-001 至 SHOT-EP001-006（约 22s）",
      "- **剧情作用**：压低环境焦躁感",
      "- **情绪与乐器**：低频脉冲合成器、轻拨大提琴",
      "- **禁用**：人声哼唱",
      "### 可复制提示词",
      "> Dark minimalist suspense underscore."
    ].join("\n");
    const parsed = parseMusicPrompts(`${episode}/视频提示词.md`, musicDoc);
    expect(parsed[0]).toMatchObject({
      id: "MUSIC-EP001-01",
      title: "监控室悬疑铺底",
      range: "SHOT-EP001-001 至 SHOT-EP001-006（约 22s）",
      purpose: "压低环境焦躁感",
      mood: "低频脉冲合成器、轻拨大提琴",
      avoid: "人声哼唱",
      prompt: "Dark minimalist suspense underscore."
    });

    const production = parseEpisodeProduction({ [`${episode}/视频提示词.md`]: musicDoc }, episode);
    expect(production.music).toHaveLength(1);
    expect(production.targets.get("MUSIC-EP001-01")?.path).toBe(`${episode}/视频提示词.md`);
    expect(targetDisplayName(production, "MUSIC-EP001-01")).toBe("监控室悬疑铺底");
    expect(productionKnownTargets(production)).toContain("MUSIC-EP001-01");
    expect(production.diagnostics).toEqual([]);

    const malformed = parseEpisodeProduction({ [`${episode}/视频提示词.md`]: "## MUSIC 待补编号\n" }, episode);
    expect(malformed.diagnostics.map((item) => item.code)).toContain("malformed_heading");
  });
});
