import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkbenchModeTabs } from "../src/client/workbench-mode-tabs.js";

const MODES = ["story", "drama", "game", "video"] as const;
const css = (name: string) => readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8").replace(/\s+/gu, " ");

describe("WorkbenchModeTabs", () => {
  it("exposes one roving tablist that names the four workbenches", () => {
    const markup = renderToStaticMarkup(<WorkbenchModeTabs className="x" current="game" onSelect={vi.fn()} />);
    expect(markup).toContain('class="x" role="tablist" aria-label="创作工作台"');
    for (const label of ["小说", "短剧", "游戏", "视频"]) expect(markup).toContain(`>${label}</button>`);
    expect(markup.match(/aria-selected="true"/gu)).toHaveLength(1);
    expect(markup.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(markup).toContain('aria-selected="true" tabindex="0">游戏</button>');
  });

  it("selects on click and moves selection and focus with the keyboard", () => {
    const onSelect = vi.fn();
    const tablist = WorkbenchModeTabs({ className: "x", current: "story", onSelect });
    const buttons = tablist.props.children as readonly { readonly props: { readonly onClick: () => void; readonly onKeyDown: (event: unknown) => void } }[];
    buttons[3]?.props.onClick();
    expect(onSelect).toHaveBeenLastCalledWith("video");

    const focus = vi.fn();
    const preventDefault = vi.fn();
    const event = (key: string) => ({ key, preventDefault, currentTarget: { parentElement: { querySelectorAll: () => MODES.map(() => ({ focus })) } } });
    buttons[0]?.props.onKeyDown(event("ArrowRight"));
    expect(onSelect).toHaveBeenLastCalledWith("drama");
    buttons[0]?.props.onKeyDown(event("End"));
    expect(onSelect).toHaveBeenLastCalledWith("video");
    expect(focus).toHaveBeenCalledTimes(2);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });
});

describe("narrow Chat entry", () => {
  it("hides the game and video Chat buttons where 制作/对话 owns the same state", () => {
    expect(css("plugin.css")).toMatch(/\[data-oh-story-workbench="game"\]\[data-oh-story-layout="compact"\] \.oh-game-toolbar-actions \{ display: none; \}/u);
    expect(css("video-studio.css")).toMatch(/\[data-oh-story-workbench="video"\]\[data-oh-story-layout="compact"\] \.oh-video-chat-toggle \{ display:none; \}/u);
  });

  it("keeps the drama Chat button, which has no 制作/对话 switch", () => {
    expect(css("plugin.css")).not.toMatch(/\[data-oh-story-workbench="drama"\][^{]*oh-drama-workspace-actions[^{]*\{ display: none/u);
  });
});
