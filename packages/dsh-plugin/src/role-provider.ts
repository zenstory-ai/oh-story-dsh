import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bundledKnowledgePath } from "./bundled-paths.js";

export const OH_STORY_ROLE_NAMES = [
  "chapter-extractor",
  "character-designer",
  "consistency-checker",
  "narrative-writer",
  "story-architect",
  "story-explorer",
  "story-researcher"
] as const;

export type OhStoryRoleName = typeof OH_STORY_ROLE_NAMES[number];

function roleBody(source: string): string {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u.exec(source);
  return source.slice(frontmatter?.[0].length ?? 0).trim();
}

export function defaultBundledRoleRoot(): string {
  return bundledKnowledgePath(import.meta.url, "oh-story/roles");
}

export async function loadBundledRole(
  name: OhStoryRoleName,
  roleRoot = defaultBundledRoleRoot()
): Promise<string> {
  const body = roleBody(await readFile(join(resolve(roleRoot), `${name}.md`), "utf8"));
  if (body.length === 0) throw new Error(`Bundled role "${name}" is empty.`);
  return [
    `OH_STORY_DSH_ROLE:${name}`,
    "You are running as a native oh-story-dsh specialist. The current DSH workspace and visible tool set are your complete authority boundary.",
    "Never inspect or require legacy .claude/.opencode/.codex agent deployment files; this exact pinned Role is already active.",
    "Bundled story-setup references are pinned plugin resources, not project files or project Skills. When the upstream Role marks one mandatory, call oh_story_bundled_reference with the exact story-setup/references/agent-references path, then use only the returned content.",
    "When a task brief lists agent-references/<file>.md, call oh_story_bundled_reference with story-setup/references/agent-references/<file>.md.",
    "If oh_story_bundled_reference or a required bundled reference is unavailable, report the missing reference to the caller. Never call the generic skill tool, fall back to a legacy platform path, or claim that an unread reference was used.",
    "Use only the tools actually visible to you. Mutate files only when the caller explicitly requests it and your visible DSH tools permit it; otherwise return findings to the caller.",
    "",
    body
  ].join("\n");
}

export async function loadBundledRolePersonas(
  roleRoot = defaultBundledRoleRoot()
): Promise<ReadonlyMap<OhStoryRoleName, string>> {
  return new Map(await Promise.all(OH_STORY_ROLE_NAMES.map(async (role) =>
    [role, await loadBundledRole(role, roleRoot)] as const)));
}
