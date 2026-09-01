import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { ToolCallBlock } from "@deepseek-ai/dsh-client-ui-conversation/client";
import {
  OH_STORY_PRODUCTION_TOOL_NAME,
  validateProductionIntent,
  type ProductionIntentArgs
} from "../production-intent.js";

export interface SettledProductionIntent {
  readonly callId: string;
  readonly intent: ProductionIntentArgs;
}

function parsedIntent(block: ToolCallBlock): SettledProductionIntent | undefined {
  if (!("kind" in block) || block.isError || block.call?.name !== OH_STORY_PRODUCTION_TOOL_NAME) return undefined;
  try {
    const args = JSON.parse(block.call.argsRaw) as ProductionIntentArgs;
    return { callId: block.callId, intent: validateProductionIntent(args) };
  } catch {
    return undefined;
  }
}

function visit(block: ToolCallBlock, output: SettledProductionIntent[]): void {
  const direct = parsedIntent(block);
  if (direct !== undefined) output.push(direct);
  for (const child of block.subCalls) visit(child, output);
}

/** Replay durable successful Agent UI intents in official DSH Chat order. */
export function settledProductionIntents(chat: ChatSnapshot): SettledProductionIntent[] {
  const output: SettledProductionIntent[] = [];
  for (const key of chat.order) {
    const node = chat.nodes.get(key);
    if (node?.kind !== "tool-call") continue;
    const root = (node.data as { readonly root?: ToolCallBlock }).root;
    if (root !== undefined) visit(root, output);
  }
  return output;
}
