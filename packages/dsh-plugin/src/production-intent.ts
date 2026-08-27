export const OH_STORY_PRODUCTION_TOOL_NAME = "oh_story_production";

export const PRODUCTION_INTENT_ACTIONS = [
  "open_section",
  "focus_target",
  "set_sequence",
  "track_job"
] as const;

export const PRODUCTION_INTENT_SECTIONS = ["shots", "assets", "tasks", "sequence", "canvas"] as const;
export const PRODUCTION_INTENT_JOB_KINDS = ["image", "video", "composition"] as const;

export type ProductionIntentAction = typeof PRODUCTION_INTENT_ACTIONS[number];
export type ProductionIntentSection = typeof PRODUCTION_INTENT_SECTIONS[number];
export type ProductionIntentJobKind = typeof PRODUCTION_INTENT_JOB_KINDS[number];

export interface ProductionIntentArgs {
  readonly action: ProductionIntentAction;
  readonly episode: string;
  readonly section?: ProductionIntentSection | undefined;
  readonly targetId?: string | undefined;
  readonly shotIds?: readonly string[] | undefined;
  readonly jobId?: string | undefined;
  readonly jobKind?: ProductionIntentJobKind | undefined;
  readonly expectedOutputs?: number | undefined;
  readonly prompt?: string | undefined;
}

function requiredText(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`oh_story_production ${field} is required for this action.`);
  if (normalized.length > 512) throw new Error(`oh_story_production ${field} is too long.`);
  return normalized;
}

/** Validate the cross-runtime UI intent without reading or mutating workspace state. */
export function validateProductionIntent(args: ProductionIntentArgs): ProductionIntentArgs {
  const episode = args.episode.trim().replaceAll("\\", "/").replace(/\/$/u, "");
  if (!/^剧集\/EP\d{3,}$/u.test(episode)) {
    throw new Error("oh_story_production episode must use the creator path form 剧集/EP001.");
  }
  if (args.action === "open_section") {
    if (args.section === undefined) throw new Error("oh_story_production section is required for open_section.");
    return { action: args.action, episode, section: args.section };
  }
  if (args.action === "focus_target") {
    return { action: args.action, episode, targetId: requiredText(args.targetId, "targetId"), section: args.section };
  }
  if (args.action === "set_sequence") {
    const shotIds = args.shotIds?.map((value) => value.trim()).filter((value) => value !== "") ?? [];
    if (shotIds.length === 0) throw new Error("oh_story_production shotIds must contain at least one shot for set_sequence.");
    if (shotIds.length > 500 || new Set(shotIds).size !== shotIds.length || shotIds.some((value) => !/^SHOT-[A-Z0-9-]+$/u.test(value))) {
      throw new Error("oh_story_production shotIds must be unique canonical SHOT-* identifiers.");
    }
    return { action: args.action, episode, shotIds };
  }
  const expectedOutputs = args.expectedOutputs ?? 1;
  if (!Number.isInteger(expectedOutputs) || expectedOutputs < 1 || expectedOutputs > 500) {
    throw new Error("oh_story_production expectedOutputs must be an integer between 1 and 500.");
  }
  if (args.jobKind === undefined) throw new Error("oh_story_production jobKind is required for track_job.");
  return {
    action: args.action,
    episode,
    jobId: requiredText(args.jobId, "jobId"),
    targetId: requiredText(args.targetId, "targetId"),
    jobKind: args.jobKind,
    expectedOutputs,
    prompt: args.prompt?.trim() ?? ""
  };
}
