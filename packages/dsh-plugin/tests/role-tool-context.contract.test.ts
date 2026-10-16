import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionEvent, SessionId } from "@deepseek-ai/dsh-session";
import type { SubagentActivationSpec, SubagentResult, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { ToolDefinition, ToolRunContext, ToolRuntime } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";
import { createOhStoryRoleTool, OH_STORY_ROLE_TOOL_NAME, registerOhStoryRoleTool } from "../src/role-tool.js";

type RoleStart = ReturnType<typeof vi.fn>;

interface RoleContextTopology {
  readonly root: Context;
  readonly agent: Agent;
  readonly guard: ReturnType<typeof vi.fn>;
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

async function createRoleContextTopology(start?: RoleStart, managed = false): Promise<RoleContextTopology> {
  const root = new Context();
  const guard = vi.fn(() => () => {});
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
        get: vi.fn(() => ({})),
        guard
      } as unknown as ToolRuntime);
    }
  });
  if (start !== undefined) {
    await root.plugin({
      name: "subagents-provider",
      apply(context) {
        context.provide("subagents", {
          getProvider: vi.fn((name: string) => name === "spawn" ? { name } : undefined),
          ...managed ? { startActivation: start } : { start }
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
    guard,
    registeredDefinition: () => definition
  };
}

function managedChild(id: SessionId, label = "oh-story:story-architect", historicalOverrides = false) {
  const section = vi.fn();
  const restrict = vi.fn();
  const systemPrompt = { section, getSectionOrder: vi.fn(() => 10) };
  const tools = { restrict, get: vi.fn(() => ({})) };
  const agent = {
    id,
    session: {
      ownEvents: () => [{ type: "subagent/descriptor", data: {
        label, ...historicalOverrides ? { persona: "Historical persona", toolFilter: { allow: ["read"] } } : {}
      } } as SessionEvent]
    },
    ctx: { get: (name: string) => name === "systemPrompt" ? systemPrompt : name === "tools" ? tools : undefined }
  } as unknown as Agent;
  return { agent, section, restrict };
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
  it("initializes a managed child once before execution and returns its result to the caller", async () => {
    let child: ReturnType<typeof managedChild> | undefined;
    const dispose = vi.fn(async () => {});
    const start = vi.fn(async (spec: SubagentActivationSpec) => {
      child = managedChild(spec.childId!);
      await topology.root.serial("agent/created", { agent: child.agent, source: "startup" });
      expect(child.section).toHaveBeenCalledOnce();
      expect(child.restrict).toHaveBeenCalledWith({ allow: ["oh_story_bundled_reference", "read", "glob", "grep", "write", "edit"] });
      return { childId: spec.childId, result: Promise.resolve({ output: [{ type: "text", text: "受限角色结果" }], stopReason: "completed" }), dispose };
    });
    const topology = await createRoleContextTopology(start, true);
    try {
      await topology.root.plugin({ name: "oh-story-managed-test", inject: ["tools", "subagents"], apply: registerOhStoryRoleTool });
      const definition = topology.registeredDefinition()!;
      await expect(executeStoryArchitect(definition, topology.agent, "call-managed"))
        .resolves.toMatchObject({ role: "story-architect", runId: expect.any(String), content: [{ type: "text", text: "受限角色结果" }] });
      expect(start).toHaveBeenCalledWith(expect.objectContaining({
        provider: "spawn", label: "oh-story:story-architect", delivery: "caller",
        request: { parent: topology.agent, prompt: [{ type: "text", text: "检查故事架构" }], maxDepth: 1 }
      }));
      expect(child!.section).toHaveBeenCalledWith(expect.objectContaining({
        name: "deployment:persona-prefix", text: expect.stringContaining("OH_STORY_DSH_ROLE:story-architect")
      }));
      expect(dispose).toHaveBeenCalledOnce();
    } finally { await topology.root.fiber.dispose(); }
  });

  it("cancels an admitted managed child when its calling tool is canceled", async () => {
    let settle!: (value: SubagentResult) => void;
    const result = new Promise<SubagentResult>((accept) => { settle = accept; });
    const dispose = vi.fn(async () => { settle({ output: [], stopReason: "aborted" }); });
    const start = vi.fn(async (spec: SubagentActivationSpec) => {
      const child = managedChild(spec.childId!);
      await topology.root.serial("agent/created", { agent: child.agent, source: "startup" });
      return { childId: spec.childId, result, dispose };
    });
    const topology = await createRoleContextTopology(start, true);
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    try {
      const definition = await createOhStoryRoleTool(topology.agent.ctx.get("subagents"));
      const execution = definition.execute({ role: "story-architect", prompt: "检查故事架构" }, {
        ...runContext(topology.agent, "call-cancel"), signal: controller.signal
      });
      const rejection = expect(execution).rejects.toThrow(/ended with aborted/u);
      await vi.waitFor(() => { expect(addListener).toHaveBeenCalledWith("abort", expect.any(Function), { once: true }); });
      controller.abort();
      await rejection;
      expect(dispose).toHaveBeenCalledOnce();
    } finally { await topology.root.fiber.dispose(); }
  });

  it("rejects a managed backend that never initializes the reserved Role child", async () => {
    const dispose = vi.fn(async () => {});
    const start = vi.fn(async (spec: SubagentActivationSpec) => ({
      childId: spec.childId, result: Promise.resolve({ output: [], stopReason: "completed" }), dispose
    }));
    const topology = await createRoleContextTopology(start, true);
    try {
      const definition = await createOhStoryRoleTool(topology.agent.ctx.get("subagents"));
      await expect(executeStoryArchitect(definition, topology.agent, "call-uninitialized"))
        .rejects.toThrow("DSH did not initialize the Oh Story Role child before publication.");
      expect(dispose).toHaveBeenCalledOnce();
    } finally { await topology.root.fiber.dispose(); }
  });

  it("restores the persona and tool restriction when DSH resumes a cataloged Role child", async () => {
    const topology = await createRoleContextTopology(vi.fn(), true);
    try {
      await topology.root.plugin({ name: "oh-story-resume-test", inject: ["tools", "subagents"], apply: registerOhStoryRoleTool });
      const child = managedChild("resumed-role" as SessionId);
      const other = managedChild("unrelated-child" as SessionId, "ordinary task");
      const historical = managedChild("historical-role" as SessionId, "oh-story:story-architect", true);
      await topology.root.serial("agent/created", { agent: child.agent, source: "resume" });
      await topology.root.serial("agent/created", { agent: other.agent, source: "resume" });
      await topology.root.serial("agent/created", { agent: historical.agent, source: "resume" });
      expect(child.section).toHaveBeenCalledOnce();
      expect(child.restrict).toHaveBeenCalledWith({ allow: ["oh_story_bundled_reference", "read", "glob", "grep", "write", "edit"] });
      expect(other.section).not.toHaveBeenCalled();
      expect(other.restrict).not.toHaveBeenCalled();
      expect(historical.section).not.toHaveBeenCalled();
      expect(historical.restrict).not.toHaveBeenCalled();
    } finally { await topology.root.fiber.dispose(); }
  });

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
      expect(topology.guard).toHaveBeenCalledOnce();

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
