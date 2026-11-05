import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameCanvas } from "../src/client/game-canvas.js";
import type { GameProject } from "../src/client/game-workspace-types.js";

describe("GameCanvas", () => {
  it("renders only actual documents and playable output with creator-facing actions", () => {
    const project: GameProject = {
      id: "jade-letter",
      root: "games/jade-letter",
      title: "青石巷来信",
      source: "workspace",
      previewReady: true,
      previewVersion: "3"
    };
    const path = "games/jade-letter/design/GAME_DESIGN.md";
    const markup = renderToStaticMarkup(<GameCanvas
      project={project}
      files={[{ path, bytes: 10, version: "1", kind: "text" }, { path: "games/jade-letter/qa/PLAYTEST_NOTES.md", bytes: 10, version: "1", kind: "text" }]}
      documents={{ [path]: "# 送信与抉择\n玩家通过选择决定信件去向。" }}
      state={{ positions: {} }}
      onChange={() => undefined}
      onOpenDocument={() => undefined}
      onContinueInChat={() => undefined}
      onPlay={() => undefined}
    />);

    expect(markup).toContain("送信与抉择");
    expect(markup).toContain("进入试玩");
    expect(markup).toContain("打开文稿");
    expect(markup).toContain(`data-document-path="${path}"`);
    expect(markup).not.toContain("PLAYTEST_NOTES");
    const visibleText = markup.replace(/<[^>]+>/gu, " ").replace(/[<>]/gu, "");
    expect(visibleText).not.toContain("games/jade-letter");
    expect(visibleText).not.toContain("QA");
  });
});
