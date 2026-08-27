import type { Context } from "@deepseek-ai/cordis";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
  OH_STORY_PRODUCTION_TOOL_NAME,
  PRODUCTION_INTENT_ACTIONS,
  PRODUCTION_INTENT_JOB_KINDS,
  PRODUCTION_INTENT_SECTIONS,
  validateProductionIntent,
  type ProductionIntentArgs
} from "./production-intent.js";

function intentMessage(intent: ProductionIntentArgs): string {
  if (intent.action === "track_job") return `已把 ${intent.targetId ?? "生产对象"} 的 ${intent.jobKind ?? "媒体"} 任务投影到 ${intent.episode} 的任务板。`;
  if (intent.action === "set_sequence") return `已把 ${String(intent.shotIds?.length ?? 0)} 个镜头的顺序发送到 ${intent.episode} 成片视图。`;
  if (intent.action === "focus_target") return `已请求 ${intent.episode} 生产视图聚焦 ${intent.targetId ?? "目标"}。`;
  return `已把 ${intent.action} 界面意图发送到 ${intent.episode} 生产工作台。`;
}

export function createOhStoryProductionTool(): ToolDefinition {
  return defineTool({
    name: OH_STORY_PRODUCTION_TOOL_NAME,
    description: "Operate the native oh-story short-drama production projection in the current DSH Session. It can open or focus semantic production targets, set an explicit shot order, or track a job the Agent is actually executing. It never controls cosmetic canvas layout, generates media, changes creator documents, or counts as creator confirmation for paid production.",
    parameters: {
      action: { type: "string", required: true, enum: PRODUCTION_INTENT_ACTIONS, description: "The exact production UI/task projection operation." },
      episode: { type: "string", required: true, description: "Creator-first episode directory, for example 剧集/EP001." },
      section: { type: "string", enum: PRODUCTION_INTENT_SECTIONS },
      targetId: { type: "string" },
      shotIds: { type: "array", items: { type: "string" } },
      jobId: { type: "string", description: "Stable ID that must also appear in produced output filenames." },
      jobKind: { type: "string", enum: PRODUCTION_INTENT_JOB_KINDS },
      expectedOutputs: { type: "integer" },
      prompt: { type: "string", description: "Exact prompt/specification for a tracked job; not a production authorization." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", required: true, enum: PRODUCTION_INTENT_ACTIONS },
          episode: { type: "string", required: true },
          message: { type: "string", required: true }
        }
      },
      render: (_args, value) => [{ type: "text", text: value.message }]
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const intent = validateProductionIntent(args);
      return Promise.resolve({ action: intent.action, episode: intent.episode, message: intentMessage(intent) });
    }
  });
}

export function registerOhStoryProductionTool(context: Context): void {
  context.tools.register(createOhStoryProductionTool());
}
