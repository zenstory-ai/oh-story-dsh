import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ohStoryRoot, refreshBundledManifest } from "./knowledge-assets.js";

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../overlays/story-craft");

const copies = [
  ["scene-grammar.md", "skills/story-long-write/references/scene-grammar.md"],
  ["check-scene-grammar.cjs", "skills/story-long-write/scripts/check-scene-grammar.cjs"],
  ["prose-surface.md", "skills/story-long-write/references/prose-surface.md"],
  ["check-prose-surface.cjs", "skills/story-long-write/scripts/check-prose-surface.cjs"]
] as const;

const removedAfterSync = [
  "skills/story-setup/references/agent-references/scene-grammar.md"
] as const;

interface Replacement {
  readonly path: string;
  readonly to: string;
  readonly from: readonly string[];
}

const replacements: readonly Replacement[] = [
  {
    path: "skills/story-long-write/SKILL.md",
    to: "2. 主会话直接写正文时，首次落笔前完整读取 `references/long-format.md` 与 `references/writing-craft.md`（和写手同一套技法；第 11 节是场面计数，不另读 scene-grammar.md；第 12 节是句子表面计数，不另读 prose-surface.md）；`references/long-chapter-quality.md`、`references/long-chapter-hooks.md` 只在排查具体问题时读，去味走检测器，不预读。交给 narrative-writer 时，由该 agent 按自己的 reference 表完成写前读取，主会话不得用未读 reference 的临时 prompt 替代。",
    from: [
      "2. 主会话直接写正文时，首次落笔前完整读取 `references/long-format.md` 与 `references/writing-craft.md`（和写手同一套技法）；`references/long-chapter-quality.md`、`references/long-chapter-hooks.md` 只在排查具体问题时读，去味走检测器，不预读。交给 narrative-writer 时，由该 agent 按自己的 reference 表完成写前读取，主会话不得用未读 reference 的临时 prompt 替代。",
      "2. 主会话直接写正文时，首次落笔前完整读取 `references/long-format.md` 与 `references/writing-craft.md`（和写手同一套技法；第 11 节是场面计数，不另读 scene-grammar.md）；",
      "2. 主会话直接写正文时，首次落笔前完整读取 `references/long-format.md`、`references/writing-craft.md` 与 `references/scene-grammar.md`（场面语法；和写手同一套技法）；",
      "2. 主会话直接写正文时，首次落笔前完整读取 `references/long-format.md` 与 `references/writing-craft.md`（和写手同一套技法）；"
    ]
  },
  {
    path: "roles/narrative-writer.md",
    to: "| `story-setup/references/agent-references/writing-craft.md` | **产出正文全程**（从细纲到正文、场景推进、疏密分配、物件三次出现、套式反应删除测试；第 11 节场面计数必须执行，不另读 scene-grammar.md；第 12 节句子表面计数必须执行，不另读 prose-surface.md） |",
    from: [
      "| `story-setup/references/agent-references/writing-craft.md` | **产出正文全程**（从细纲到正文、场景推进、疏密分配、物件三次出现、套式反应删除测试；第 11 节场面计数必须执行，不另读 scene-grammar.md） |",
      [
        "| `story-setup/references/agent-references/writing-craft.md` | **产出正文全程**（从细纲到正文、场景推进、疏密分配、物件三次出现、套式反应删除测试；第 11 节场面语法必须执行） |",
        "| `story-setup/references/agent-references/scene-grammar.md` | **产出正文全程**。与 writing-craft.md 第 11 节是同一份规则。若 oh_story_bundled_reference 的可选列表里还没有该路径，以第 11 节为准，视为已读，继续写，不要停笔 |"
      ].join("\n"),
      "| `story-setup/references/agent-references/writing-craft.md` | **产出正文全程**（从细纲到正文、场景推进、疏密分配、物件三次出现、套式反应删除测试） |"
    ]
  },
  {
    path: "skills/story-long-write/references/workflow-chapter.md",
    to: "   - **意图确认**：一句话写清本章意图（例：「快节奏打脸——账单暴露→逼问→反证→公开代价」）。对照：细纲是唯一剧情蓝图，新增物按「新增物三级」；底牌不因章尾钩子提前泄露；细纲重复的同一要求只兑现一次；爽点前有可指认的铺垫，打脸/揭露章写在场配角的差异反应。场面以细纲计数表为准：有「危机层」就按表里的阻碍数和展示对象写，不改数、不另加阻碍。没有这块或全是 `[待补充]`，不扩纲。",
    from: [
      "   - **意图确认**：一句话写清本章意图（例：「快节奏打脸——账单暴露→逼问→反证→公开代价」）。对照：细纲是唯一剧情蓝图，新增物按「新增物三级」；底牌不因章尾钩子提前泄露；细纲重复的同一要求只兑现一次；爽点前有可指认的铺垫，打脸/揭露章写在场配角的差异反应。再按 [scene-grammar.md](scene-grammar.md) 核对这场戏：危机落在哪一层需求，行动有没有阻碍或转折，展示打在谁的旧认知上，章尾新坑是什么。细纲可选块写了「场面」就照它，没写就在意图里补这四句，不为此扩纲。",
      "   - **意图确认**：一句话写清本章意图（例：「快节奏打脸——账单暴露→逼问→反证→公开代价」）。对照：细纲是唯一剧情蓝图，新增物按「新增物三级」；底牌不因章尾钩子提前泄露；细纲重复的同一要求只兑现一次；爽点前有可指认的铺垫，打脸/揭露章写在场配角的差异反应。"
    ]
  },
  {
    path: "skills/story-long-write/references/workflow-chapter.md",
    to: "9. **检查钩子、爽点与契约**：章尾有往下看的理由（低压/过场章留阶段目标即可）；高压/推进章爽点到位；对着成稿过契约四问——主角是否靠自己的选择挣到本章结果？收益是否被配角、机构或巧合无交换地拿走？有没有提前动用后面的底牌？旧期待付利息、留新期待了吗？任一问不过就按问改：没挣到→让结果落在他的选择或判断上；收益被拿走→补交换或让他拿回控制点；提前用了底牌→换成本卷已解锁的手段；没付利息→给旧期待一个小兑现再留新钩。然后跑 `node scripts/check-scene-grammar.cjs --json --prose {本章正文路径}`：exit 1 只改 `repair_scope` 点名的集体反应句和章尾感悟，改成某个在场者的动作或台词；不新增情节，也不为了凑阻碍数另写一次拦阻。细纲里的阻碍数是几，正文就写表里那几次。低压且阻碍数为 0 时不补阻碍。再跑 `node scripts/check-prose-surface.cjs --json --prose {本章正文路径}`：exit 1 只改 `repair_scope` 点名的套语、引号外的「你」和不足 11 个汉字的动作段。套语换成这句里已有的动作或物件，不换成另一个套语。引号内的「你」和「我」不动。文风写明第二人称时给检查器加 `--allow-ni`。不新增情节，最多两轮。不达标只修批准内容，修后重跑步骤 8；需补强、契约破坏都在本章汇报里告诉作者。",
    from: [
      "9. **检查钩子、爽点与契约**：章尾有往下看的理由（低压/过场章留阶段目标即可）；高压/推进章爽点到位；对着成稿过契约四问——主角是否靠自己的选择挣到本章结果？收益是否被配角、机构或巧合无交换地拿走？有没有提前动用后面的底牌？旧期待付利息、留新期待了吗？任一问不过就按问改：没挣到→让结果落在他的选择或判断上；收益被拿走→补交换或让他拿回控制点；提前用了底牌→换成本卷已解锁的手段；没付利息→给旧期待一个小兑现再留新钩。然后跑 `node scripts/check-scene-grammar.cjs --json --prose {本章正文路径}`：exit 1 只改 `repair_scope` 点名的集体反应句和章尾感悟，改成某个在场者的动作或台词；不新增情节，也不为了凑阻碍数另写一次拦阻。细纲里的阻碍数是几，正文就写表里那几次。低压且阻碍数为 0 时不补阻碍。不达标只修批准内容，修后重跑步骤 8；需补强、契约破坏都在本章汇报里告诉作者。",
      "9. **检查钩子、爽点与契约**：章尾有往下看的理由（低压/过场章留阶段目标即可）；高压/推进章爽点到位；对着成稿过契约四问——主角是否靠自己的选择挣到本章结果？收益是否被配角、机构或巧合无交换地拿走？有没有提前动用后面的底牌？旧期待付利息、留新期待了吗？再过场面四问：危机有没有落到具体的那一层需求上，而不只是被命名；行动里有没有阻碍或转折；展示有没有打在某个在场者的旧认知上；章尾有没有新坑。任一问不过就按问改：没挣到→让结果落在他的选择或判断上；收益被拿走→补交换或让他拿回控制点；提前用了底牌→换成本卷已解锁的手段；没付利息→给旧期待一个小兑现再留新钩；危机只是标签→写成那一层需求被伤到的事实；没有阻碍→在得手前补上已批准范围内的阻力；没有旧认知→补这个在场者事先的一句判断；没有新坑→停在下一个麻烦上，不另起感悟。不达标只修批准内容，修后重跑步骤 8；需补强、契约破坏都在本章汇报里告诉作者。",
      "9. **检查钩子、爽点与契约**：章尾有往下看的理由（低压/过场章留阶段目标即可）；高压/推进章爽点到位；对着成稿过契约四问——主角是否靠自己的选择挣到本章结果？收益是否被配角、机构或巧合无交换地拿走？有没有提前动用后面的底牌？旧期待付利息、留新期待了吗？任一问不过就按问改：没挣到→让结果落在他的选择或判断上；收益被拿走→补交换或让他拿回控制点；提前用了底牌→换成本卷已解锁的手段；没付利息→给旧期待一个小兑现再留新钩。不达标只修批准内容，修后重跑步骤 8；需补强、契约破坏都在本章汇报里告诉作者。"
    ]
  },
  {
    path: "skills/story-long-write/references/workflow-outline.md",
    to: "语义仍不设 checker。场面计数另跑 `check-scene-grammar.cjs`，见下方落盘段。",
    from: ["语义仍不设 checker。"]
  },
  {
    path: "skills/story-long-write/references/workflow-outline.md",
    to: "本检查只在新建/补建/回填时执行；既有项目的旧细纲不因此阻断写正文。场面块另跑 `node scripts/check-scene-grammar.cjs --json --project {书目录} --chapter {N}`：没有场面块或十二字段全是 `[待补充]` 时 exit 0。exit 1 只改 `repair_scope` 点名的场面字段，最多两轮。exit 2 如实报告。旧细纲没有场面块，不阻断写正文。",
    from: ["本检查只在新建/补建/回填时执行；既有项目的旧细纲不因此阻断写正文。"]
  },
  {
    path: "skills/story-long-write/references/workflow-outline.md",
    to: `- 契约风险：只在本章让单元卡「契约风险」变化时写
- 场面（新写或补建时可填；不填或整表 \`[待补充]\` 都通过。写了实词就必须十二字段齐全，由 check-scene-grammar.cjs 计数，不新增必填字段）：
  - 压力：{高压 / 推进 / 低压 / 修炼 / 过场 / 关系 / 信息}
  - 危机层：{生理 / 安全 / 归属 / 尊重 / 自我实现}
  - 危机事实：{至少 8 个汉字，不能只写层名}
  - 短线目标：{一个，至少 4 个汉字，不要分号}
  - 阻碍数：{高压或推进写 1 或 2；低压类写 0 或 1}
  - 阻碍：{阻碍数 ≥ 1 时写那一次，至少 8 个汉字；为 0 时写「无」}
  - 收获类：{身份 / 资源 / 能力 / 尊重 / 认同；低压类可以写「无」}
  - 收获物：{一件可见物，至少 4 个汉字；收获类为无时写「无」}
  - 展示对象：{一个在场者；低压类可以写「无」}
  - 旧认知：{此人得手前的一句台词或动作，至少 8 个汉字；展示对象为无时写「无」}
  - 展示落点：{改口 / 收手 / 不肯认 / 换评价；展示对象为无时写「无」}
  - 章尾新坑：{至少 8 个汉字；低压类写成「阶段：…」}
\`\`\``,
    from: [
      `- 契约风险：只在本章让单元卡「契约风险」变化时写
- 场面（新写或补建时尽量填；未知写 \`[待补充]\`，不因此判失败，也不新增必填字段）：
  - 危机：{伤到谁的哪一层需求：生理 / 安全 / 归属 / 尊重 / 自我实现}
  - 收获：{这一场拿到的身份、资源、能力、尊重或认同；行动里的阻碍或转折}
  - 展示：{向谁亮；对方原认知；被打掉的那一个认知}
  - 章尾新坑：{本场结束后的下一个危机；没有就写「无，功能是…」}
\`\`\``,
      "- 契约风险：只在本章让单元卡「契约风险」变化时写\n```"
    ]
  },
  {
    path: "skills/story-long-write/references/workflow-outline.md",
    to: "字段不完整时先补齐；无法从材料确定的关系或副线写 `[待补充]`，不得杜撰。新写或补建的细纲可以在可选块填场面计数表；不填或整表 `[待补充]` 时 `check-scene-grammar.cjs` 通过。写了实词就必须过该检查，exit 1 只改点名的场面字段。",
    from: [
      "字段不完整时先补齐；无法从材料确定的关系或副线写 `[待补充]`，不得杜撰。新写或补建的细纲，材料够时在可选块写下场面四行；不够就写 `[待补充]`，检查器不因此失败。",
      "字段不完整时先补齐；无法从材料确定的关系或副线写 `[待补充]`，不得杜撰。"
    ]
  }
];

async function replaceOnce(entry: Replacement): Promise<void> {
  const target = join(ohStoryRoot, entry.path);
  const text = await readFile(target, "utf8");
  if (text.includes(entry.to)) return;
  const hit = entry.from.find((candidate) => text.includes(candidate));
  if (hit === undefined) {
    throw new Error(`Story craft anchor missing in ${entry.path}`);
  }
  const next = text.replace(hit, entry.to);
  if (next === text) throw new Error(`Story craft replacement did not change ${entry.path}`);
  await writeFile(target, next);
}

async function section11Body(): Promise<string> {
  const source = await readFile(join(overlayRoot, "scene-grammar.md"), "utf8");
  const withoutTitle = source.replace(/^# .+\r?\n+/, "");
  const demoted = withoutTitle.replace(/^## /gm, "### ");
  const intro = [
    "## 11. 场面语法",
    "",
    "产出正文时执行下面的计数。写手只读本节，不另读 scene-grammar.md。细纲事实、本书文风和作者本轮明确约束优先。第 8 节深度限知、第 10 节在场者的账仍然有效。",
    ""
  ].join("\n");
  const body = demoted.endsWith("\n") ? demoted : `${demoted}\n`;
  return `${intro}\n${body}`;
}

async function section12Body(): Promise<string> {
  const source = await readFile(join(overlayRoot, "prose-surface.md"), "utf8");
  const withoutTitle = source.replace(/^# .+\r?\n+/, "");
  const demoted = withoutTitle.replace(/^## /gm, "### ");
  const intro = [
    "## 12. 句子表面",
    "",
    "只在写长篇正文时执行。拆书、扫榜、导入不读本节，也不跑下面的检查。写手只读本节，不另读 prose-surface.md。本书文风和作者本轮明确约束优先。",
    ""
  ].join("\n");
  const body = demoted.endsWith("\n") ? demoted : `${demoted}\n`;
  return `${intro}\n${body}`;
}

async function syncCraftSections(): Promise<void> {
  const target = join(ohStoryRoot, "skills/story-setup/references/agent-references/writing-craft.md");
  const text = await readFile(target, "utf8");
  const section = `${await section11Body()}${await section12Body()}`;
  const marker = "## 11. 场面语法";
  const index = text.indexOf(marker);
  const next = index === -1
    ? `${text.endsWith("\n") ? text : `${text}\n`}\n${section}`
    : `${text.slice(0, index)}${section}`;
  if (next !== text) await writeFile(target, next);
}

export async function applyStoryCraft(): Promise<void> {
  for (const relativePath of removedAfterSync) {
    await rm(join(ohStoryRoot, relativePath), { force: true });
  }
  for (const [sourceName, relativePath] of copies) {
    const target = join(ohStoryRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(overlayRoot, sourceName), target);
  }
  for (const entry of replacements) await replaceOnce(entry);
  await syncCraftSections();
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  await applyStoryCraft();
  const manifest = await refreshBundledManifest();
  process.stdout.write(`Applied story craft. Manifest tracks ${String(manifest.files.length)} files.\n`);
}
