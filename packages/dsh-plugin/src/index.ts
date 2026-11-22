import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-skill";
import type {} from "@deepseek-ai/dsh-subagent";
import type {} from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { createDramaSkillProvider, createNovelToGameSkillProvider, createOhStorySkillProvider, createVideoRecapSkillProvider, defaultDramaSkillRoot } from "./skill-provider.js";
import { ensureDramaAdapterConfig } from "./drama-adapters.js";
import { DRAMA_PYTHON, hostPython } from "./host-python.js";
import { registerOhStoryHooks } from "./native-hooks.js";
import { registerOhStoryRoleTool } from "./role-tool.js";
import { registerOhStoryProductionTool } from "./production-tool.js";
import { registerWorkspaceRoute } from "./workspace-route.js";
import { assertTrustedWorkspaceAuthority } from "./workspace-request-trust.js";

export { createDramaSkillProvider, createNovelToGameSkillProvider, createOhStorySkillProvider, createVideoRecapSkillProvider, parseBundledSkill } from "./skill-provider.js";
export { OH_STORY_ROLE_NAMES, loadBundledRole } from "./role-provider.js";
export { createOhStoryRoleTool, OH_STORY_ROLE_TOOL_NAME, registerOhStoryRoleTool, roleToolFilter, type OhStoryRoleSubagents } from "./role-tool.js";
export { createOhStoryProductionTool, registerOhStoryProductionTool } from "./production-tool.js";
export { OH_STORY_PRODUCTION_TOOL_NAME, validateProductionIntent, type ProductionIntentArgs, type ValidatedProductionIntent } from "./production-intent.js";
export { bundledReferenceGuard, createOhStoryReferenceTool, OH_STORY_REFERENCE_TOOL_NAME } from "./reference-tool.js";
export {
  loadWorkbenchStylesheet,
  registerWorkspaceRoute,
  WORKBENCH_CSS_API_PATH,
  WORKBENCH_CSS_FALLBACK_PATH,
  type DramaPreflightSummary,
  type GamePreviewErrorMessage,
  type GameProjectSummary,
  type PreviewTokenPayload,
  type VideoPreflightStatus,
  type WorkbenchStylesheetAsset,
  type WorkspaceFile,
  type WorkspacePayload
} from "./workspace-route.js";
export { registerOhStoryHooks } from "./native-hooks.js";
export {
  DRAMA_ADAPTER_CONFIG_ENV,
  DRAMA_ADAPTERS,
  dramaAdapterConfigPath,
  dramaAdapterStatuses,
  ensureDramaAdapterConfig,
  type DramaAdapterOptionalEnvStatus,
  type DramaAdapterStatus
} from "./drama-adapters.js";
export type {
  VideoArtifactSummary,
  VideoCheckItemStatus,
  VideoPreviewAsset,
  VideoProjectSummary,
  VideoQualityCheckItem,
  VideoQualityCheckSummary,
  VideoQualityReviewHint
} from "./video-project.js";
export type { VideoTimelineClip } from "./video-narrative.js";

export const name = "oh-story";
export const inject = ["skills", "subagents", "tools", "typert", "webServer"];

interface SettingsPolicyService {
  configure(presentation: { readonly auto?: boolean }, owner?: Context["fiber"]): () => void;
}

/** DSH owns models, providers, presets, permissions, roots, runs, and sessions. */
export interface Config {
  readonly editorMaxBytes?: number;
  readonly trustedHosts?: string[];
  readonly welcomeGuide?: boolean | { readonly get: () => boolean | undefined };
}

export const Config = z.object({
  editorMaxBytes: z.natural().min(65_536).max(8_388_608).default(2_097_152),
  trustedHosts: z.array(String).default([]),
  welcomeGuide: z.boolean().default(true).volatile()
}) as unknown as z<Config>;

export function readWelcomeGuideConfig(value: Config["welcomeGuide"]): boolean {
  const resolved = typeof value === "object" && value !== null ? value.get() : value;
  return resolved ?? true;
}

/** Mount only domain contributions into the current DSH process. */
export async function apply(context: Context, config: Config = {}): Promise<void> {
  const trustedHosts = config.trustedHosts ?? [];
  for (const entry of trustedHosts) assertTrustedWorkspaceAuthority(entry);
  void context.inject(["settings"], (child) => {
    const settings = child.get("settings") as SettingsPolicyService | undefined;
    if (settings !== undefined) child.effect(() => settings.configure({ auto: false }, context.fiber));
  });
  context.skills.registerProvider(() => createOhStorySkillProvider());
  context.skills.registerProvider(() => createDramaSkillProvider());
  context.skills.registerProvider(() => createNovelToGameSkillProvider());
  context.skills.registerProvider(() => createVideoRecapSkillProvider());
  registerOhStoryHooks(context);
  registerOhStoryProductionTool(context);
  registerWorkspaceRoute(context, {
    maxBytes: config.editorMaxBytes ?? 2_097_152,
    trustedHosts,
    welcomeGuide: () => readWelcomeGuideConfig(config.welcomeGuide)
  });
  // Pre-warm the bundled Drama adapter config asynchronously so plugin activation
  // never blocks on Python subprocess probes; cancellation stops writes on dispose.
  context.effect(() => {
    let disposed = false;
    void hostPython(DRAMA_PYTHON)
      .then((probe) => {
        if (disposed || context.fiber.uid === null) return;
        return ensureDramaAdapterConfig(defaultDramaSkillRoot(), { python: probe.command });
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, "oh-story: drama adapter prewarm");
  await registerOhStoryRoleTool(context);
  if (context.fiber.uid === null) return;
}

export default { name, inject, Config, apply };
