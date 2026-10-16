import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { Session, SessionId } from "@deepseek-ai/dsh-session";
import type { SubagentResult } from "@deepseek-ai/dsh-subagent";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
  bundledReferenceGuard,
  createOhStoryReferenceTool,
  OH_STORY_REFERENCE_TOOL_NAME
} from "./reference-tool.js";
import { markOhStoryRoleSession, observeOhStoryRoleDescriptor, ohStoryRoleLabel, ohStoryRoleOfSession } from "./role-identity.js";
import { OH_STORY_ROLE_NAMES, loadBundledRole, type OhStoryRoleName } from "./role-provider.js";

export const OH_STORY_ROLE_TOOL_NAME = "oh_story_role";
interface RoleStartRequest {
  readonly label: string;
  readonly prompt: ContentBlock[];
  readonly parent: Agent;
  readonly persona: string;
  readonly toolFilter: { readonly allow: readonly string[] };
  readonly maxDepth: number;
  readonly signal: AbortSignal;
}

interface RoleRun {
  readonly id: string;
  readonly localAgent?: { readonly session: Session };
  readonly result: Promise<SubagentResult>;
  dispose(): Promise<void>;
}

interface ManagedRoleSpec {
  readonly provider: string;
  readonly label: string;
  readonly childId: SessionId;
  readonly request: Pick<RoleStartRequest, "parent" | "prompt" | "maxDepth">;
  readonly signal: AbortSignal;
  readonly delivery: "caller";
}

/** Local seam types also let TypeScript consumers use the older DSH declarations. */
export type OhStoryRoleSubagents = {
  startActivation(spec: ManagedRoleSpec): Promise<{
    readonly childId: SessionId;
    readonly result: Promise<SubagentResult>;
    dispose(): Promise<void>;
  }>;
} | {
  start(provider: string, request: RoleStartRequest): Promise<RoleRun>;
};

const configuredRoleAgents = new WeakSet<Agent>();

function configureRoleAgent(agent: Agent, role: OhStoryRoleName, persona: string, allow: readonly string[]): void {
  if (configuredRoleAgents.has(agent)) return;
  const systemPrompt = agent.ctx.get("systemPrompt");
  const tools = agent.ctx.get("tools");
  if (systemPrompt === undefined || tools === undefined) throw new Error("Oh Story Role requires the DSH prompt and tool services.");
  systemPrompt.section({
    name: "deployment:persona-prefix",
    order: systemPrompt.getSectionOrder("DEPLOYMENT_PERSONA_PREFIX"),
    text: persona
  });
  tools.restrict({ allow });
  markOhStoryRoleSession(agent.session, role);
  configuredRoleAgents.add(agent);
}

async function startRole(runtime: OhStoryRoleSubagents, role: OhStoryRoleName, request: RoleStartRequest): Promise<RoleRun> {
  if (!("startActivation" in runtime)) return runtime.start("spawn", request);
  // The new seam accepts no persona/tool filter. Configure this reserved child in
  // agent/created, which DSH awaits before admitting its first model request.
  const childId = randomUUID() as SessionId;
  let configured = false;
  const unobserve = request.parent.ctx.on("agent/created", ({ agent }) => {
    if (agent.id !== childId) return;
    configureRoleAgent(agent, role, request.persona, request.toolFilter.allow);
    configured = true;
  }, { global: true });
  try {
    const activation = await runtime.startActivation({
      provider: "spawn",
      label: request.label,
      childId,
      request: { parent: request.parent, prompt: request.prompt, maxDepth: request.maxDepth },
      signal: request.signal,
      delivery: "caller"
    });
    if (!configured) {
      await activation.dispose();
      throw new Error("DSH did not initialize the Oh Story Role child before publication.");
    }
    let disposal: Promise<void> | undefined;
    const dispose = (): Promise<void> => {
      request.signal.removeEventListener("abort", cancel);
      return disposal ??= activation.dispose();
    };
    // startActivation's signal covers admission only; the caller owns later cancellation.
    const cancel = (): void => { void dispose().catch(() => {}); };
    request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) cancel();
    return { id: activation.childId, result: activation.result, dispose };
  } finally { unobserve(); }
}

const roleTools: Readonly<Record<OhStoryRoleName, readonly string[]>> = {
  // Oh Story 0.8.0 lets the extractor write its own batch input file (never
  // bash). native-hooks fences write/edit to {拆文目录}/_analysis_cache/输入-*.md.
  "chapter-extractor": ["read", "glob", "grep", "write", "edit"],
  "character-designer": [OH_STORY_REFERENCE_TOOL_NAME, "read", "glob", "grep", "write", "edit"],
  "consistency-checker": [OH_STORY_REFERENCE_TOOL_NAME, "read", "glob", "grep"],
  "narrative-writer": [OH_STORY_REFERENCE_TOOL_NAME, "read", "glob", "grep", "write", "edit", "bash"],
  "story-architect": [OH_STORY_REFERENCE_TOOL_NAME, "read", "glob", "grep", "write", "edit"],
  // Oh Story 0.8.2 moved benchmark_style_load's procedure into agent-references/benchmark-style-load.md.
  "story-explorer": [OH_STORY_REFERENCE_TOOL_NAME, "read", "glob", "grep"],
  "story-researcher": ["read", "glob", "grep", "bash", "write", "web_search", "web_fetch"]
};

export function roleToolFilter(role: OhStoryRoleName): { readonly allow: readonly string[] } {
  return { allow: roleTools[role] };
}

function resultText(output: readonly ContentBlock[]): string {
  return output.map((block) => block.type === "text" ? block.text : JSON.stringify(block)).join("\n");
}

export async function createOhStoryRoleTool(subagents?: OhStoryRoleSubagents): Promise<ToolDefinition> {
  const personas = new Map<OhStoryRoleName, string>();
  await Promise.all(OH_STORY_ROLE_NAMES.map(async (role) => {
    personas.set(role, await loadBundledRole(role, undefined, "native-tools"));
  }));
  return defineTool({
    name: OH_STORY_ROLE_TOOL_NAME,
    description: "Run one focused Oh Story specialist as a child of the current DSH Agent. The child inherits DSH model, workspace, permissions, lifecycle, and UI.",
    parameters: {
      role: {
        type: "string",
        required: true,
        enum: OH_STORY_ROLE_NAMES,
        description: "The exact Oh Story Role to run."
      },
      prompt: {
        type: "string",
        required: true,
        description: "A self-contained task. The child inherits the current DSH workspace but not the current in-flight turn."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string", required: true, enum: OH_STORY_ROLE_NAMES },
          runId: { type: "string", required: true },
          content: { type: "array", required: true, items: { type: "json" } }
        }
      },
      render: (_args, value) => [{ type: "text", text: resultText(value.content as unknown as ContentBlock[]) }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error("oh_story_role requires a calling DSH Agent.");
      const persona = personas.get(args.role);
      if (persona === undefined) throw new Error(`Oh Story Role ${args.role} is not bundled.`);
      const allowed = roleToolFilter(args.role).allow.filter((name) =>
        exec.agent?.ctx.tools.get(name, exec.agent) !== undefined);
      const runtime = subagents ?? exec.agent.ctx.get("subagents");
      if (runtime === undefined) throw new Error("oh_story_role requires the DSH subagent runtime.");
      const run = await startRole(runtime, args.role, {
        // DSH persists this label in the child's subagent/descriptor; the
        // native hooks read the Role back from it before the child's first tool call.
        label: ohStoryRoleLabel(args.role),
        prompt: [{ type: "text", text: args.prompt }],
        parent: exec.agent,
        persona,
        toolFilter: { allow: allowed },
        maxDepth: 1,
        signal: exec.signal
      });
      if (run.localAgent !== undefined) markOhStoryRoleSession(run.localAgent.session, args.role);
      try {
        const result = await run.result;
        if (result.stopReason !== "completed") {
          throw new Error(`Oh Story Role ${args.role} ended with ${result.stopReason}${result.diagnostic === undefined ? "" : `: ${result.diagnostic}`}`);
        }
        return {
          role: args.role,
          runId: run.id,
          content: result.output as unknown as JsonValue[]
        };
      } finally {
        await run.dispose();
      }
    }
  });
}

export async function registerOhStoryRoleTool(context: Context): Promise<void> {
  const [definition, referenceDefinition] = await Promise.all([
    createOhStoryRoleTool(context.subagents),
    createOhStoryReferenceTool()
  ]);
  context.tools.register(referenceDefinition);
  context.tools.guard(bundledReferenceGuard(referenceDefinition, context.tools));
  if ("startActivation" in context.subagents) {
    // Managed children remain in DSH's durable catalog. Reapply the same Role on
    // a resumed child, whose descriptor already exists instead of being appended.
    const personas = new Map(await Promise.all(OH_STORY_ROLE_NAMES.map(async (role) =>
      [role, await loadBundledRole(role, undefined, "native-tools")] as const)));
    context.on("agent/created", ({ agent }) => {
      const events = agent.session.ownEvents();
      for (const event of events) observeOhStoryRoleDescriptor(agent.session, event);
      const role = ohStoryRoleOfSession(agent.session);
      if (role === undefined) return;
      const descriptor = events.find((event) => event.type === "subagent/descriptor")?.data as {
        readonly persona?: unknown;
        readonly toolFilter?: unknown;
      } | undefined;
      // DSH already restores these fields from pre-activation Role sessions.
      if (typeof descriptor?.persona === "string" && descriptor.toolFilter !== undefined) return;
      const persona = personas.get(role);
      if (persona === undefined) return;
      const tools = agent.ctx.get("tools");
      const allow = roleToolFilter(role).allow.filter((tool) => tools?.get(tool, agent) !== undefined);
      configureRoleAgent(agent, role, persona, allow);
    });
  }
  let dispose: (() => void) | undefined;
  const mount = (): void => { dispose ??= context.tools.register(definition); };
  const unmount = (): void => { dispose?.(); dispose = undefined; };
  context.on("subagent/provider-added", (provider) => { if (provider.name === "spawn") mount(); });
  context.on("subagent/provider-removed", (name) => { if (name === "spawn") unmount(); });
  if (context.subagents.getProvider("spawn") !== undefined) mount();
}
