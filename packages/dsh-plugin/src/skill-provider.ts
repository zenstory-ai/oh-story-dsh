import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider
} from "@deepseek-ai/dsh-skill";

const STORY_PROVIDER_NAME = "oh-story";
const DRAMA_PROVIDER_NAME = "short-drama";
const INVOCATION = { modelInvocable: true, userInvocable: true } as const;
const DSH_SKILL_BRIDGE = [
  "<oh-story-dsh-integration>",
  "This Skill is a native contribution to the current DeepSeek Harness session.",
  "DSH owns the workspace, model, preset, permissions, Session Log, tools, subagents, cancellation, resume, and Agent UI.",
  "Never start another Agent runtime, session transport, Dashboard, SSE stream, polling loop, or model configuration.",
  "All seven upstream Oh Story specialist Roles are bundled. Invoke one with oh_story_role and a self-contained prompt.",
  "Never inspect .claude/agents, .codex/agents, .opencode/agents, .agents/agents, .zcode, or .story-deployed to decide whether a Role is available, and never call invoke_subagent with a TypeName.",
  "Use only DSH-visible tools. DSH sandbox and permission policy remain authoritative.",
  "</oh-story-dsh-integration>"
].join("\n");
const DSH_SKILL_OVERRIDES: Readonly<Partial<Record<string, string>>> = {
  story: "The 小说 workspace is an official DSH conversation view. Never start or open a second web application.",
  "story-setup": "Initialize or validate novel project data only. DSH already supplies Skills, Roles, hooks, tools, permissions, sessions, and UI; never deploy Claude/OpenCode/Codex/Antigravity/ZCode/OpenClaw/Reasonix files or a .story-deployed marker.",
  "story-long-analyze": "Use oh_story_role for chapter extraction or specialist analysis. Never inspect platform agent directories or require a deployed external Agent definition.",
  "story-long-write": "All named Roles are provided through oh_story_role. Do not check platform agent files. Keep the upstream writing, Tracking, lint, outline, revision, and quality workflows.",
  "story-review": "All named reviewer Roles are provided through oh_story_role. Do not check platform agent files; full/lean review may use the bundled Roles directly.",
  "story-import": "All named Roles are provided through oh_story_role. Do not require story-setup to deploy them, and never inspect platform agent directories.",
  "story-deslop": "Use the bundled narrative-writer Role through oh_story_role when specialist review is useful. Never inspect platform agent directories.",
  "story-short-analyze": "Use oh_story_role for specialist analysis. Never inspect platform agent directories or require external Agent deployment.",
  "story-short-write": "All named Roles are provided through oh_story_role. Do not inspect platform agent files; preserve the upstream short-fiction workflow and quality gates.",
  "browser-cdp": "Use only browser or web capabilities visible in the current DSH preset. Do not start a parallel browser host; if no compatible capability is visible, explain the limitation.",
  "story-cover": "Use only image-generation or HTTP capabilities visible in the current DSH preset. Never assume a separate Codex or Claude runtime."
};
const DSH_DRAMA_BRIDGE = [
  "<short-drama-dsh-integration>",
  "This Skill is a native contribution to the current DeepSeek Harness session.",
  "DSH owns the workspace, model, preset, permissions, Session Log, tools, approvals, cancellation, resume, and Agent UI.",
  "The 短剧 tab is the creator workspace. Never start dashboard_server.py, another web server, Dashboard, Agent runtime, session transport, or model configuration.",
  "Drama Skills v0.6 uses a creator-first contract: each episode keeps only the requested documents, up to five creator-facing sources at 剧集/<EP>/剧本.md, 视觉设定.md, 分镜.md, 图片提示词.md, and 视频提示词.md. Never precreate empty documents, backfill nominal stages, or start work the creator did not request. Persisted reviews use creator-readable Markdown under 审查/; an oral review writes nothing.",
  "For a v0.6 project, never create a parallel JSON/JSONL lifecycle truth, indexes, fingerprints, coverage tables, or QA records merely because legacy maintenance scripts and templates remain bundled.",
  "Never upgrade a v0.5 structured project in place or mix both contracts in one project root. Keep legacy production/audit artifacts read-only and pinned to v0.5; migrate only into a new creator-first root with manual per-episode creator confirmation.",
  "Use only tools visible in the current DSH preset and preserve the upstream project ownership, freshness, review, and explicit production-confirmation contracts.",
  "Production credentials remain outside project files. Never treat a prior acceptance, preview, continuation request, or budget discussion as confirmation for a paid production run.",
  "</short-drama-dsh-integration>"
].join("\n");
const DSH_DRAMA_OVERRIDES: Readonly<Partial<Record<string, string>>> = {
  "short-drama": "A dashboard request means focus or use the native 短剧 tab in this DSH Session. Do not run the bundled standalone Dashboard script. New projects follow only the v0.6 creator-first contract and create only documents required by the current request.",
  "short-drama-produce": "Use an upstream adapter only after the creator explicitly confirms the exact current job. Its source must be the current creator-first Markdown and its output belongs under 剧集/<EP>/制作成果/. DSH permissions and approval UI remain authoritative."
};

const DSH_NATIVE_SKILLS: Readonly<Partial<Record<string, string>>> = {
  story: `# story — DSH 小说流程入口

在当前 DSH Session 内判断用户意图，并加载最匹配的 Oh Story Skill：

- 新建或修复小说工程：story-setup
- 长篇选题/扫榜/拆文/日更：story-long-scan、story-long-analyze、story-long-write
- 短篇选题/拆文/写作：story-short-scan、story-short-analyze、story-short-write
- 导入已有作品：story-import
- 审稿与去 AI 味：story-review、story-deslop
- 封面：story-cover
- 管理作者习惯（记住/查看/确认/替换/忘掉写作偏好）：加载本 skill 的
  references/author-memory.md，只用本 skill 的 scripts/author_memory_commit.py 管理
  工作区级 .story/作者记忆/；工具未返回 Author Memory Receipt 前不得声称已记住。

意图明确时直接进入对应 Skill；不明确时只问一个会改变流程的问题。项目文件、
Agent、模型、权限、Session Log 和 UI 均由当前 DSH 会话管理。小说文件通过“小说”
视图查看，Agent 过程通过右侧动态栏或官方 Chat 查看。禁止启动独立 Dashboard。`,
  "story-setup": `# story-setup — DSH 原生小说工程初始化

只初始化或校验当前 DSH workspace 中的小说数据，不部署任何 Agent 平台文件。

1. 检查现有正文、设定、大纲和追踪文件，已有内容绝不覆盖。
2. 根据用户声明与现有结构判断长篇/短篇；无法可靠判断时请求确认。
3. 长篇按需建立 正文/、设定/、大纲/、追踪/，并准备追踪/_tracking-state.json；
   第一章正文落盘前必须有对应细纲。短篇保持轻量结构，不强加长篇 Tracking。
4. 需要架构、角色或研究工作时，通过 oh_story_role 调用已打包 Role；不要检查或
   生成 .claude、.codex、.opencode、.agents、.zcode、AGENTS.md 或 .story-deployed。
5. 复述创建、保留和待用户确认的文件。不要配置模型、权限、Hooks 或 Session。

题材、角色、节奏、冲突、开篇和写作方法资料位于 references/agent-references/；
只加载当前任务需要的文件。`,
  "browser-cdp": `# browser-cdp — DSH 浏览器能力适配

本 Skill 不启动 Chrome、CDP 端口、独立浏览器 Host 或 setup-cdp-chrome.js。
仅使用当前 DSH Preset 已暴露的 web_search、web_fetch 或浏览器工具完成网页读取、
榜单采集和资料核验。保持以下原则：

1. 优先使用结构化搜索/抓取工具；需要登录态或交互页面时才使用可见浏览器能力。
2. 尊重站点条款、访问频率与用户授权；不绕过验证码、付费墙或访问控制。
3. 记录来源 URL、采集时间、失败项和数据质量，不把推断写成页面事实。
4. 当前 Preset 没有兼容能力时，说明缺失能力和可行的手工步骤，不另起运行时。`,
  "story-long-scan": `# story-long-scan — DSH 原生长篇扫榜

基于可核验样本识别长篇网文趋势，不运行打包脚本、不提取登录凭据，也不绕过验证码、
访问控制或站点限制。

1. 明确平台、频道和题材方向；只有答案会改变采样范围时才问一个问题。
2. 数据来源依次为：用户提供的数据或链接、当前 DSH Preset 可见的网页工具、
   references/genre-trends.md 中的历史趋势。无法获取实时数据时必须明确标为历史假设。
3. 每个样本记录来源 URL、采集日期、榜单口径、有效条目数、缺失字段和异常项；
   不把搜索摘要、推断或过期缓存写成页面事实。
4. 按题材分布、新题材信号、经典题材变化、篇幅与更新、书名模式、开头卖点和
   差异化元素分析。需要决策门禁时使用 references/topic-decision.md。
5. 输出市场概况、题材热度、证据与可信度、风险、三项可执行方向和下次复扫时间。

当前 Preset 没有网页能力且用户也未提供样本时，使用内置参考完成方法论分析，
并列出仍需核验的榜单；不要启动 CDP、独立浏览器或并行运行时。`,
  "story-short-scan": `# story-short-scan — DSH 原生短篇扫榜

基于可核验样本识别短篇市场的情绪、题材与传播信号，不运行打包脚本、不读取 Cookie
或 token，也不绕过验证码、登录或访问控制。

1. 明确平台与方向；只有答案会改变采样范围时才问一个问题。
2. 数据来源依次为：用户提供的数据或链接、当前 DSH Preset 可见的网页工具、
   references/real-market-data.md 中的历史资料。无法联网时必须把结论标为候选假设。
3. 记录来源 URL、采集日期、榜单口径、有效样本数、缺失字段和异常项。
4. 分析情绪类型、题材热点、篇幅、开头、结尾、标题、人设与传播触发点；
   给每个趋势标注证据强度、饱和风险和有效期。
5. 输出市场概况、情绪热度、题材热点、关键数据、风口预警、三项可写方向和复扫时间。

当前 Preset 没有网页能力且用户也未提供样本时，只做历史资料分析并列出验证动作；
不要启动 CDP、独立浏览器或并行运行时。`
};

interface ParsedSkill {
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "mu").exec(frontmatter);
  const raw = match?.[1]?.trim();
  if (raw === undefined) return undefined;
  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    try { return JSON.parse(raw) as string; }
    catch { return raw.slice(1, -1); }
  }
  return raw.replace(/^['"]|['"]$/gu, "");
}

export function parseBundledSkill(source: string): ParsedSkill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(source);
  if (match?.[1] === undefined) throw new Error("Bundled skill is missing YAML frontmatter.");
  const name = frontmatterValue(match[1], "name");
  const description = frontmatterValue(match[1], "description");
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) throw new Error("Bundled skill has an invalid name.");
  if (!description) throw new Error(`Bundled skill "${name}" has no description.`);
  return { name, description, content: source.slice(match[0].length) };
}

export function dshSkillContent(name: string, content: string): string {
  const override = DSH_SKILL_OVERRIDES[name];
  const native = DSH_NATIVE_SKILLS[name];
  return `${DSH_SKILL_BRIDGE}${override === undefined ? "" : `\n<skill-specific-dsh-override>${override}</skill-specific-dsh-override>`}\n\n${native ?? content}`;
}

export function defaultBundledSkillRoot(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return basename(current) === "src"
    ? resolve(current, "../../knowledge/oh-story/skills")
    : resolve(current, "oh-story/skills");
}

export function defaultDramaSkillRoot(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return basename(current) === "src"
    ? resolve(current, "../../knowledge/drama/skills")
    : resolve(current, "drama/skills");
}

function createBundledSkillProvider(
  providerName: string,
  skillRoot: string,
  content: (name: string, source: string) => string
): SkillProvider {
  const root = resolve(skillRoot);
  return {
    name: providerName,
    async list(): Promise<readonly SkillCandidate[]> {
      const directories = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      return Promise.all(directories.map(async (directory): Promise<SkillCandidate> => {
        const path = join(root, directory, "SKILL.md");
        const parsed = parseBundledSkill(await readFile(path, "utf8"));
        if (parsed.name !== directory) throw new Error(`Bundled skill directory "${directory}" does not match name "${parsed.name}".`);
        return {
          name: parsed.name,
          description: parsed.description,
          invocation: INVOCATION,
          provider: providerName,
          source: "bundled",
          resourceBase: { kind: "directory", path: join(root, directory) },
          rank: BUNDLED_SKILL_RANK,
          locator: pathToFileURL(path),
          path
        };
      }));
    },
    async get(candidate): Promise<SkillDefinition | undefined> {
      if (candidate.provider !== providerName || typeof candidate.path !== "string") return undefined;
      const path = resolve(candidate.path);
      const relativePath = relative(root, path);
      if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error("Bundled skill locator escaped the packaged skill root.");
      }
      const parsed = parseBundledSkill(await readFile(path, "utf8"));
      if (parsed.name !== candidate.name) return undefined;
      return {
        name: parsed.name,
        description: parsed.description,
        invocation: INVOCATION,
        provider: providerName,
        source: "bundled",
        resourceBase: { kind: "directory", path: join(root, parsed.name) },
        path,
        content: content(parsed.name, parsed.content)
      };
    }
  };
}

export function createOhStorySkillProvider(skillRoot = defaultBundledSkillRoot()): SkillProvider {
  return createBundledSkillProvider(STORY_PROVIDER_NAME, skillRoot, dshSkillContent);
}

export function dshDramaSkillContent(name: string, content: string): string {
  const override = DSH_DRAMA_OVERRIDES[name];
  return `${DSH_DRAMA_BRIDGE}${override === undefined ? "" : `\n<skill-specific-dsh-override>${override}</skill-specific-dsh-override>`}\n\n${content}`;
}

export function createDramaSkillProvider(skillRoot = defaultDramaSkillRoot()): SkillProvider {
  return createBundledSkillProvider(DRAMA_PROVIDER_NAME, skillRoot, dshDramaSkillContent);
}
