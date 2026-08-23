import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { ToolDefinition, ToolRunContext, ToolRuntime } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";
import { createOhStoryRoleTool, OH_STORY_ROLE_TOOL_NAME, registerOhStoryRoleTool } from "../src/role-tool.js";

type RoleStart = ReturnType<typeof vi.fn>;

interface RoleContextTopology {
  readonly root: Context;
  readonly agent: Agent;
  readonly registeredDefinition: () => ToolDefinition | undefined;
}

function completedRoleStart(runId: string): RoleStart {
  return vi.fn(async () => ({
    id: runId,
    result: Promise.resolve({
      output: [{ type: "text", text: "架构结果" }],
      stopReason: "completed" as const
    }),
    dispose: vi.fn(async () => {})
  }));
}

async function createRoleContextTopology(start?: RoleStart): Promise<RoleContextTopology> {
  const root = new Context();
  let definition: ToolDefinition | undefined;
  let agentContext: Context | undefined;

  await root.plugin({
    name: "tools-provider",
    apply(context) {
      context.provide("tools", {
        register(value: ToolDefinition) {
          definition = value;
          return () => { definition = undefined; };
        },
        get: vi.fn(() => ({}))
      } as unknown as ToolRuntime);
    }
  });
  if (start !== undefined) {
    await root.plugin({
      name: "subagents-provider",
      apply(context) {
        context.provide("subagents", {
          getProvider: vi.fn((name: string) => name === "spawn" ? { name } : undefined),
          start
        } as unknown as SubagentRuntime);
      }
    });
  }
  await root.plugin({
    name: "agent-scope",
    inject: ["tools"],
    apply(context) {
      agentContext = context;
    }
  });
  if (agentContext === undefined) throw new Error("agent Context did not initialize");

  return {
    root,
    agent: { ctx: agentContext } as unknown as Agent,
    registeredDefinition: () => definition
  };
}

function runContext(agent: Agent, id: string): ToolRunContext {
  const callId = id as ToolRunContext["callId"];
  return {
    agent,
    signal: new AbortController().signal,
    callId,
    rootCallId: callId,
    name: OH_STORY_ROLE_TOOL_NAME,
    arguments: {},
    token: Symbol("tool") as ToolRunContext["token"],
    deferContext: vi.fn(),
    concludeTurn: vi.fn()
  };
}

async function executeStoryArchitect(definition: ToolDefinition, agent: Agent, callId: string): Promise<unknown> {
  const execute = definition.execute as (
    args: { readonly role: "story-architect"; readonly prompt: string },
    exec: ToolRunContext
  ) => Promise<unknown>;
  return execute({ role: "story-architect", prompt: "检查故事架构" }, runContext(agent, callId));
}

describe("oh_story_role Cordis Context contract", () => {
  it("uses the plugin runtime when the Agent Fiber intentionally does not inject subagents", async () => {
    const start = completedRoleStart("role-run-plugin");
    const topology = await createRoleContextTopology(start);
    try {
      expect(() => topology.agent.ctx.subagents).toThrow('cannot get property "subagents" without inject');
      await topology.root.plugin({
        name: "oh-story-test",
        inject: ["tools", "subagents"],
        apply: registerOhStoryRoleTool
      });
      const definition = topology.registeredDefinition();
      if (definition === undefined) throw new Error("role tool did not register");

      await expect(executeStoryArchitect(definition, topology.agent, "call-plugin"))
        .resolves.toMatchObject({ role: "story-architect", runId: "role-run-plugin" });
      expect(start).toHaveBeenCalledOnce();
    } finally {
      await topology.root.fiber.dispose();
    }
  });

  it("resolves the runtime with Context.get when a standalone tool has no captured runtime", async () => {
    const start = completedRoleStart("role-run-fallback");
    const topology = await createRoleContextTopology(start);
    try {
      const definition = await createOhStoryRoleTool();

      await expect(executeStoryArchitect(definition, topology.agent, "call-fallback"))
        .resolves.toMatchObject({ role: "story-architect", runId: "role-run-fallback" });
      expect(start).toHaveBeenCalledOnce();
    } finally {
      await topology.root.fiber.dispose();
    }
  });

  it("fails with the plugin contract error when no subagent runtime exists", async () => {
    const topology = await createRoleContextTopology();
    try {
      const definition = await createOhStoryRoleTool();

      await expect(executeStoryArchitect(definition, topology.agent, "call-missing"))
        .rejects.toThrow("oh_story_role requires the DSH subagent runtime.");
    } finally {
      await topology.root.fiber.dispose();
    }
  });
});
