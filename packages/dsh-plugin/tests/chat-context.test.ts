import { describe, expect, it, vi } from "vitest";
import { focusChatContext } from "../src/client/chat-context.js";

describe("native Chat context compatibility", () => {
  it("uses the host keep-draft transaction before focusing on current DSH", () => {
    const binding = { ctx: {} };
    const order: string[] = [];
    const initialize = vi.fn(() => { order.push("initialize"); return "applied" as const; });
    expect(focusChatContext({ requestDraftInitialization: initialize, for: () => ({ focus: () => { order.push("focus"); } }) }, binding, "讨论这个角色")).toBe(true);
    expect(initialize).toHaveBeenCalledWith(binding, { prompt: "讨论这个角色", whenDraftExists: "keep" });
    expect(order).toEqual(["initialize", "focus"]);
  });
  it.each(["preserved", "blocked"] as const)("keeps the new context visible when the host reports %s", (result) => {
    const focus = vi.fn();
    expect(focusChatContext({ requestDraftInitialization: () => result, for: () => ({ focus }) }, { ctx: {} }, "保留为可复制内容")).toBe(false);
    expect(focus).toHaveBeenCalledOnce();
  });
  it("retains context for a visible fallback without replacing legacy drafts, references or attachments", () => {
    const focus = vi.fn();
    const setDraft = vi.fn(() => { throw new Error("Legacy replacement would clear references"); });
    const input = { for: () => ({ focus, setDraft }) };
    const binding = { ctx: {} };
    expect(focusChatContext(input, binding, "讨论这段解说")).toBe(false);
    expect(setDraft).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
    expect(focusChatContext(input, binding)).toBe(true);
  });
});
