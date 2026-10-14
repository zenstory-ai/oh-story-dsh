import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ohStoryRoot, refreshBundledManifest } from "./knowledge-assets.js";

const rankBridgeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../overlays/rank-bridge");

function skipBytecode(source: string): boolean {
  return !source.includes("__pycache__") && !source.endsWith(".pyc");
}

async function copyTree(source: string, target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, filter: skipBytecode });
}

async function copyRankBridge(): Promise<void> {
  const bridgeRoot = join(ohStoryRoot, "skills/story-long-scan/bridge");
  await mkdir(bridgeRoot, { recursive: true });
  await copyTree(join(rankBridgeRoot, "rankmin"), join(bridgeRoot, "rankmin"));
  await copyFile(join(rankBridgeRoot, "rankmin_cli.py"), join(bridgeRoot, "rankmin_cli.py"));
  await copyFile(join(rankBridgeRoot, "net.py"), join(bridgeRoot, "net.py"));
  await copyFile(join(rankBridgeRoot, "requirements.txt"), join(bridgeRoot, "requirements.txt"));
  await copyTree(join(rankBridgeRoot, "ciweimao_app"), join(bridgeRoot, "ciweimao_app"));
  await copyTree(join(rankBridgeRoot, "fanqie_app"), join(bridgeRoot, "fanqie_app"));
  await copyTree(join(rankBridgeRoot, "jjwxc_app"), join(bridgeRoot, "jjwxc_app"));
}

async function spliceLongScanPhase2(): Promise<void> {
  const body = await readFile(join(rankBridgeRoot, "long-scan-phase2.md"), "utf8");
  const normalized = body.endsWith("\n") ? body : `${body}\n`;
  const target = join(ohStoryRoot, "skills/story-long-scan/SKILL.md");
  const text = await readFile(target, "utf8");
  const start = "### Phase 2：确定数据来源";
  const end = "### Phase 3：数据分析";
  const startAt = text.indexOf(start);
  const endAt = text.indexOf(end);
  if (startAt < 0 || endAt < 0 || endAt <= startAt) {
    throw new Error("story-long-scan Phase 2 anchors missing");
  }
  const next = `${text.slice(0, startAt)}${normalized}\n${text.slice(endAt)}`;
  if (next !== text) await writeFile(target, next);
}

async function replaceOnce(relativePath: string, from: string, to: string): Promise<void> {
  const target = join(ohStoryRoot, relativePath);
  const text = await readFile(target, "utf8");
  if (text.includes(to)) return;
  if (!text.includes(from)) throw new Error(`Rank anchor missing in ${relativePath}`);
  const next = text.replace(from, to);
  if (next === text) throw new Error(`Rank replacement did not change ${relativePath}`);
  await writeFile(target, next);
}

async function copyPlatformDocs(): Promise<void> {
  const sourceDir = join(rankBridgeRoot, "platforms");
  const names = (await readdir(sourceDir)).filter((name) => name.endsWith(".md")).sort();
  for (const name of names) {
    await copyFile(
      join(sourceDir, name),
      join(ohStoryRoot, "skills/story-long-scan/references", name)
    );
  }
}

async function patchScanDocs(): Promise<void> {
  await replaceOnce(
    "skills/story-long-scan/SKILL.md",
    "以聚合结果为主，按所选平台参考里的「分析维度」看，再提取通用维度：",
    "以本次输出目录里的榜单 markdown 为主，按所选平台参考里的「分析维度」看，再提取通用维度："
  );
  await replaceOnce(
    "skills/story-long-scan/SKILL.md",
    "2. **新题材信号**：新书榜列、多榜重合；`扫榜/` 下上一次的日期目录里有 `扫榜聚合.md` 就对比",
    "2. **新题材信号**：新书榜列、多榜重合；`扫榜/` 下上一次的日期目录里有榜单 markdown 就对比"
  );
  await replaceOnce(
    "skills/story-long-scan/SKILL.md",
    "**从文件接上：** 先读 `{outdir}/选题决策.md` 的「扫榜结论」和 `扫榜聚合.md`，不靠对话记忆；两者都没有就回 Phase 2。",
    "**从文件接上：** 先读 `{outdir}/选题决策.md` 的「扫榜结论」和本次榜单 markdown，不靠对话记忆；两者都没有就回 Phase 2。"
  );
  await replaceOnce(
    "skills/story-long-scan/SKILL.md",
    `| 五份平台参考（链接见「脚本采集模式」第 1 步） | 「确定数据来源」：只读所选平台那份——榜单网址、命令、字段、故障排查、平台分析维度 |
| [scripts/aggregate-rank.js](scripts/aggregate-rank.js) | 把输出目录里的原始榜单聚合成短表（\`--out\` 落盘，\`--sample\` 抽原始条目，\`--json\` 机读），主会话只读它 |
| [scripts/cdp-utils.js](scripts/cdp-utils.js) 与各平台采集脚本 | CDP 公共工具与各平台采集脚本（\`{平台}-rank-scraper.js\`），命令见所选平台参考 |`,
    `| 五份平台参考（链接见 Phase 2） | 起点、番茄、刺猬猫、晋江读「分析维度」和字段；七猫本版本没有 provider，不执行其中的采集命令 |
| [bridge/rankmin_cli.py](bridge/rankmin_cli.py) | 起点移动榜、番茄分类落地、刺猬猫 App 排行、晋江书店榜。\`--self-test\` 不联网。stdout 是已写出的榜；有榜失败则退出码 2，stderr 点名，不编造榜单，也不要打开网页榜、library 页或作品页去补，也不要跑 searchmin_cli.py 去补 |`
  );
  await replaceOnce(
    "skills/story-short-scan/SKILL.md",
    "**核心信念：短篇市场变化快，题材信号有效期短。** 扫榜报告必须标注样本日期、趋势可信度和下次重新扫榜的时间。",
    "**核心信念：短篇市场变化快，题材信号有效期短。** 扫榜报告必须标注样本日期、趋势可信度和下次重新扫榜的时间。长篇起点、番茄、刺猬猫和晋江不在这里采集，走 story-long-scan 的 `bridge/rankmin_cli.py`。"
  );
  await replaceOnce(
    "skills/story-long-scan/references/topic-decision.md",
    "- 聚合表：扫榜聚合.md     # 同目录；内置知识模式写「无」",
    "- 榜单：本次目录里的榜单 markdown     # 内置知识模式写「无」"
  );
  await replaceOnce(
    "skills/story-long-scan/references/topic-decision.md",
    "1. 写到本次扫榜的输出目录 `扫榜/{YYYYMMDD}/`（和榜单、`扫榜聚合.md` 同目录）：`{outdir}/选题决策.md`。",
    "1. 写到本次扫榜的输出目录 `扫榜/{YYYYMMDD}/`（和榜单 markdown 同目录）：`{outdir}/选题决策.md`。"
  );
}

export async function applyRankBridge(): Promise<void> {
  await copyRankBridge();
  await spliceLongScanPhase2();
  await copyPlatformDocs();
  await patchScanDocs();
  const skill = await readFile(join(ohStoryRoot, "skills/story-long-scan/SKILL.md"), "utf8");
  if (skill.includes("python3 bridge/searchmin_cli.py")) {
    throw new Error("story-long-scan contains a runnable searchmin command");
  }
  if (!skill.includes("不要跑 searchmin_cli.py 去补")) {
    throw new Error("story-long-scan is missing the searchmin forbid sentence");
  }
  await refreshBundledManifest();
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await applyRankBridge();
  process.stdout.write("Applied rank bridge onto bundled Oh Story.\n");
}
