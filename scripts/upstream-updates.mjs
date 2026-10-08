#!/usr/bin/env node
/* global fetch, process */

// Watches the pinned upstream Skill sets and DeepSeek Harness for new releases and keeps one
// GitHub issue per (dependency, version) so a sync is never missed. It only reads upstream state
// and writes issues in this repository; syncing stays a reviewed PR (see .agents/notes).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const label = "upstream-update";
const markerPattern = /<!-- upstream-update:([a-z0-9-]+)@([^\s>]+) -->/;

export const skillSets = [
  { key: "oh-story", name: "Oh Story", set: "oh-story", sync: "assets:sync:story", env: "OH_STORY_UPSTREAM_DIR" },
  { key: "drama", name: "Drama Skills", set: "drama", sync: "assets:sync:drama", env: "DRAMA_SKILLS_UPSTREAM_DIR" },
  { key: "novel-to-game", name: "NovelToGame", set: "novel-to-game", sync: "assets:sync:game", env: "NOVEL_TO_GAME_UPSTREAM_DIR" },
  { key: "video-recap", name: "video-recap-skills", set: "video-recap", sync: "assets:sync:video", env: "VIDEO_RECAP_UPSTREAM_DIR" },
];
const dshPackage = "@deepseek-ai/dsh";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function githubSlug(repository) {
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(repository);
  invariant(match, `not a GitHub repository URL: ${repository}`);
  return `${match[1]}/${match[2]}`;
}

/** Exact DSH versions this repository declares and tests; `-0` range bounds are not versions. */
export function declaredDshVersions(pluginPackage) {
  const versions = new Set();
  const peer = pluginPackage.peerDependencies?.["@deepseek-ai/dsh-agent"] ?? "";
  for (const [version] of peer.matchAll(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/g)) {
    if (!version.endsWith("-0")) versions.add(version);
  }
  const dev = pluginPackage.devDependencies?.["@deepseek-ai/dsh-agent"];
  if (dev) versions.add(dev);
  return versions;
}

/** A skill set is behind only when the latest release tag contains commits the pin lacks. */
export function skillUpdate(set, manifest, release, compareStatus) {
  if (compareStatus !== "ahead" && compareStatus !== "diverged") return undefined;
  const version = release.tag_name.replace(/^v/, "");
  return {
    key: set.key,
    version,
    title: `上游更新：${set.name} ${version}`,
    body: skillIssueBody(set, manifest, release, version, compareStatus),
  };
}

/** Each npm dist-tag pointing at a version we neither declare nor test is one update. */
export function dshUpdates(distTags, declared) {
  const byVersion = new Map();
  for (const [tag, version] of Object.entries(distTags)) {
    if (declared.has(version)) continue;
    byVersion.set(version, [...(byVersion.get(version) ?? []), tag]);
  }
  return [...byVersion].map(([version, tags]) => ({
    key: "dsh",
    version,
    title: `上游更新：DeepSeek Harness ${version}（npm ${tags.join(" / ")}）`,
    body: dshIssueBody(version, tags, declared),
  }));
}

export function marker(update) {
  return `<!-- upstream-update:${update.key}@${update.version} -->`;
}

export function parseMarker(body) {
  const match = markerPattern.exec(body ?? "");
  return match ? { key: match[1], version: match[2] } : undefined;
}

/**
 * Any issue already carrying the exact marker (open or closed) settles that version: a closed
 * one means a maintainer decided. Open issues for an older version of the same dependency are
 * superseded — except DSH, whose dist-tags are parallel lines (latest vs alpha), not a sequence.
 */
export function planIssueActions(updates, issues) {
  const seen = new Set(issues.map((issue) => parseMarker(issue.body)).filter(Boolean).map((m) => `${m.key}@${m.version}`));
  const create = updates.filter((update) => !seen.has(`${update.key}@${update.version}`));
  const supersede = [];
  for (const update of create) {
    if (update.key === "dsh") continue;
    for (const issue of issues) {
      const found = parseMarker(issue.body);
      if (issue.state === "open" && found?.key === update.key && found.version !== update.version) {
        supersede.push({ number: issue.number, by: update });
      }
    }
  }
  return { create, supersede };
}

function skillIssueBody(set, manifest, release, version, compareStatus) {
  const slug = githubSlug(manifest.upstream.repository);
  const pinned = manifest.upstream.releaseVersion ? `${manifest.upstream.releaseVersion}（\`${manifest.upstream.commit}\`）` : `\`${manifest.upstream.commit}\``;
  return [
    `${set.name} 发布了 [${release.tag_name}](${release.html_url})（${release.published_at?.slice(0, 10) ?? "日期未知"}），本仓库固定的是 ${pinned}。`,
    "",
    `- 差异：https://github.com/${slug}/compare/${manifest.upstream.commit}...${release.tag_name}${compareStatus === "diverged" ? "（**固定提交不在新 release 的历史上**，同步前先确认上游是否改写了历史）" : ""}`,
    `- 清单：\`packages/knowledge/${set.set}/manifest.json\``,
    "",
    "### 同步清单",
    "",
    `- [ ] 检出上游 \`${release.tag_name}\`，运行 \`${set.env}=<上游目录> pnpm ${set.sync}\`，评审 manifest 与文件差异`,
    "- [ ] 读上游 CHANGELOG：破坏性改动要在 PR 里写清旧项目迁移边界，并同批更新技能桥（`packages/dsh-plugin/src/skill-provider.ts`）、demo fixture、原生浏览器测试与真实 provider fixture",
    "- [ ] 更新 README / README_EN / 包 README / `docs/ARCHITECTURE.md` 的版本与提交，`CHANGELOG.md` 的 Unreleased 写上游版本与提交",
    `- [ ] \`${set.env}=<上游目录> pnpm verify\` 全绿`,
    "",
    "不打算跟进这个版本就关闭本 issue，之后不会再为它提醒。",
    "",
    marker({ key: set.key, version }),
  ].join("\n");
}

function dshIssueBody(version, tags, declared) {
  return [
    `npm 上 \`${dshPackage}\` 的 ${tags.map((tag) => `\`${tag}\``).join("、")} 指向 \`${version}\`，本仓库声明并测试的版本是 ${[...declared].map((v) => `\`${v}\``).join("、")}。`,
    "",
    `- npm：https://www.npmjs.com/package/${dshPackage}/v/${version}`,
    "",
    "### 适配清单",
    "",
    "- [ ] 逐个对比插件引用的 `@deepseek-ai/dsh-*` 包在新旧版本间的产物差异，确认插件读写的接口没有变",
    "- [ ] 更新 `packages/dsh-plugin/package.json` 的 peer 范围与 devDependencies、`pnpm-workspace.yaml` 的 overrides 与 `minimumReleaseAgeExclude`、`scripts/native-dsh-smoke.ts` / `scripts/native-dsh-real.ts` 的 `dshVersion`",
    "- [ ] 更新 README / README_EN / 包 README / `docs/RELEASING.md` 的安装命令与 `docs/VALIDATION.md` 的目标版本",
    "- [ ] `pnpm verify` 与 `pnpm test:dsh` 全绿",
    "",
    "不打算跟进这个版本就关闭本 issue，之后不会再为它提醒。",
    "",
    marker({ key: "dsh", version }),
  ].join("\n");
}

function createGitHub({ token, repository }) {
  async function request(method, url, body) {
    const response = await fetch(url.startsWith("https://") ? url : `https://api.github.com${url}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${url} failed with HTTP ${response.status}: ${await response.text()}`);
    return response.status === 204 ? undefined : response.json();
  }
  return {
    request,
    async latestRelease(slug) {
      return request("GET", `/repos/${slug}/releases/latest`);
    },
    async compareStatus(slug, base, head) {
      return (await request("GET", `/repos/${slug}/compare/${base}...${head}`)).status;
    },
    async trackedIssues() {
      const issues = [];
      for (let page = 1; ; page += 1) {
        const batch = await request("GET", `/repos/${repository}/issues?labels=${label}&state=all&per_page=100&page=${page}`);
        issues.push(...batch.filter((issue) => !issue.pull_request));
        if (batch.length < 100) return issues;
      }
    },
    async ensureLabel() {
      try {
        await request("GET", `/repos/${repository}/labels/${label}`);
      } catch {
        await request("POST", `/repos/${repository}/labels`, { name: label, color: "0e8a16", description: "上游 Skills 或 DeepSeek Harness 有新版本" });
      }
    },
    async createIssue(update) {
      return request("POST", `/repos/${repository}/issues`, { title: update.title, body: update.body, labels: [label] });
    },
    async supersede(number, issue) {
      await request("POST", `/repos/${repository}/issues/${number}/comments`, { body: `已有更新的版本，改在 #${issue.number} 跟进。` });
      await request("PATCH", `/repos/${repository}/issues/${number}`, { state: "closed", state_reason: "not_planned" });
    },
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(path.join(repoRoot, file), "utf8"));
}

export async function collectUpdates(github, fetchDistTags) {
  const updates = [];
  for (const set of skillSets) {
    const manifest = await readJson(`packages/knowledge/${set.set}/manifest.json`);
    const slug = githubSlug(manifest.upstream.repository);
    const release = await github.latestRelease(slug);
    const status = await github.compareStatus(slug, manifest.upstream.commit, release.tag_name);
    const update = skillUpdate(set, manifest, release, status);
    process.stdout.write(`${set.name}: pinned ${manifest.upstream.releaseVersion ?? manifest.upstream.commit.slice(0, 12)}, latest ${release.tag_name} (${status})\n`);
    if (update) updates.push(update);
  }
  const declared = declaredDshVersions(await readJson("packages/dsh-plugin/package.json"));
  const distTags = await fetchDistTags();
  process.stdout.write(`DeepSeek Harness: declared ${[...declared].join(", ")}; npm ${JSON.stringify(distTags)}\n`);
  updates.push(...dshUpdates(distTags, declared));
  return updates;
}

async function fetchDshDistTags() {
  const response = await fetch(`https://registry.npmjs.org/-/package/${dshPackage}/dist-tags`);
  invariant(response.ok, `npm dist-tags lookup failed with HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const repository = process.env.GITHUB_REPOSITORY ?? "zenstory-ai/oh-story-dsh";
  const github = createGitHub({ token: process.env.GITHUB_TOKEN, repository });
  const updates = await collectUpdates(github, fetchDshDistTags);
  const { create, supersede } = planIssueActions(updates, await github.trackedIssues());
  if (create.length === 0) {
    process.stdout.write("No new upstream versions.\n");
    return;
  }
  for (const update of create) process.stdout.write(`${dryRun ? "[dry-run] would open" : "Opening"}: ${update.title}\n`);
  if (dryRun) return;
  await github.ensureLabel();
  const opened = new Map();
  for (const update of create) {
    const issue = await github.createIssue(update);
    opened.set(`${update.key}@${update.version}`, issue);
    process.stdout.write(`Opened #${issue.number}: ${update.title}\n`);
  }
  for (const { number, by } of supersede) {
    await github.supersede(number, opened.get(`${by.key}@${by.version}`));
    process.stdout.write(`Closed #${number} as superseded.\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
