import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GamePlaytestNotes } from "../src/client/game-playtest-notes.js";
import {
  appendGamePlaytestNote,
  gamePlaytestNotesPath,
  gamePlaytestNotesWriteIntent,
  parseGamePlaytestNotes,
  validGamePlaytestNote,
  type GamePlaytestNote
} from "../src/game-playtest-notes.js";
import { gameRoot } from "../src/workspace-route.js";

const note: GamePlaytestNote = {
  id: "note-01",
  text: "结算后没有说明下一步要做什么。",
  previewVersion: "preview-sha-123",
  context: "第一轮结算",
  createdAt: "2026-11-04T12:30:00.000Z"
};

describe("game playtest notes contract", () => {
  it("stores notes only in a validated game project root", () => {
    const root = "game-adaptations/金瓶梅 · 风月总账";
    expect(gameRoot(root)).toBe(true);
    expect(gamePlaytestNotesPath(root)).toBe(`${root}/PLAYTEST_NOTES.md`);
    expect(gameRoot("game-adaptations/project/nested")).toBe(false);
    expect(gameRoot("game-adaptations/../正文")).toBe(false);
  });

  it("preserves creator Markdown byte-for-byte and records actual preview provenance", () => {
    const human = "# 我的试玩日志\n\n这里是作者自己写的内容。\n";
    const content = appendGamePlaytestNote(human, note);
    expect(content.startsWith(human)).toBe(true);
    expect(content).toContain("这里是作者自己写的内容。");
    expect(parseGamePlaytestNotes(content)).toEqual([note]);
    expect(parseGamePlaytestNotes(content)[0]?.previewVersion).toBe("preview-sha-123");
  });

  it("ignores unknown or malformed Markdown rather than claiming ownership", () => {
    const content = [
      "# 手写笔记",
      "",
      "<!-- oh-story:playtest-note not-json -->",
      "### 作者保留的标题",
      "不要改写。",
      "<!-- /oh-story:playtest-note pretend -->"
    ].join("\n");
    expect(parseGamePlaytestNotes(content)).toEqual([]);
    expect(appendGamePlaytestNote(content, note).startsWith(content)).toBe(true);
  });

  it("keeps manual context from terminating the metadata comment", () => {
    const contextual = { ...note, context: "按钮 --> 结算页" };
    const content = appendGamePlaytestNote("", contextual);
    expect(content).not.toContain('"context":"按钮 --> 结算页"');
    expect(parseGamePlaytestNotes(content)).toEqual([contextual]);
  });

  it("rejects missing provenance and unsafe record identifiers", () => {
    expect(validGamePlaytestNote({ ...note, previewVersion: "" })).toBe(false);
    expect(validGamePlaytestNote({ ...note, id: "bad id" })).toBe(false);
    expect(validGamePlaytestNote({ ...note, createdAt: "not-a-date" })).toBe(false);
  });
});

describe("game playtest notes concurrency", () => {
  it("uses create-only for an absent file and exact CAS for later saves", () => {
    expect(gamePlaytestNotesWriteIntent(null)).toEqual({ kind: "createIfAbsent" });
    expect(gamePlaytestNotesWriteIntent("fs-v17")).toEqual({ kind: "replaceIfVersion", version: "fs-v17" });
  });

  it("can retry a retained draft on refreshed content without losing the winning write", () => {
    const stale = "# 试玩笔记\n";
    const winningContent = `${stale}\n作者在另一个窗口补充的内容。\n`;
    const staleAttempt = appendGamePlaytestNote(stale, note);
    const retry = appendGamePlaytestNote(winningContent, note);

    expect(staleAttempt).not.toContain("另一个窗口");
    expect(retry.startsWith(winningContent)).toBe(true);
    expect(retry).toContain("另一个窗口补充的内容");
    expect(parseGamePlaytestNotes(retry)).toEqual([note]);
  });
});

describe("GamePlaytestNotes", () => {
  it("labels context as manual and keeps the bundled example read-only", () => {
    const html = renderToStaticMarkup(createElement(GamePlaytestNotes, {
      sessionId: "session-1",
      project: {
        id: "jin-ping-mei",
        root: "game-adaptations/jin-ping-mei",
        title: "示例游戏",
        source: "example",
        previewReady: true,
        previewVersion: "example-v1"
      },
      previewVersion: "displayed-preview-v7",
      open: false,
      onClose: () => undefined,
      onContinueInChat: () => undefined
    }));

    expect(html).toContain("试玩笔记");
    expect(html).toContain("手动填写，可留空");
    expect(html).toContain("aria-label=\"填写试玩笔记\"");
    expect(html).toContain("关联当前试玩版本");
    expect(html).toContain("版本详情");
    expect(html).toContain("displayed-preview-v7");
    expect(html).toContain("不能写入工作区");
    expect(html).toContain("带到 Chat");
    expect(html).not.toContain("保存笔记");
  });
});
