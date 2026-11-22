import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GameDocuments, type GameDocumentEditor } from "../src/client/game-documents.js";
import type { GameProject } from "../src/client/game-workspace-types.js";

const project: GameProject = {
  id: "snow-ferry",
  root: "game-adaptations/snow-ferry",
  title: "雪夜渡",
  previewReady: false,
  previewVersion: "0"
};

function makeEditor(overrides: Partial<GameDocumentEditor> = {}): GameDocumentEditor {
  return {
    selected: undefined,
    buffers: {},
    mode: "preview",
    textareaRef: createRef<HTMLTextAreaElement>(),
    errors: {},
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onSave: vi.fn(),
    onMode: vi.fn(),
    onConflict: vi.fn(),
    onDiscard: vi.fn(),
    onRememberPosition: vi.fn(),
    onRetry: vi.fn(),
    ...overrides
  };
}

describe("GameDocuments", () => {
  it("shows fileReadError with alert role and retry button instead of infinite loading", () => {
    const path = `${project.root}/_progress.md`;
    const html = renderToStaticMarkup(<GameDocuments
      project={project}
      files={[{ path, bytes: 120, version: "1", kind: "text" }]}
      editor={makeEditor({ selected: path })}
      fileReadError="文件超出读取大小限制（413）"
      onRetryRead={vi.fn()}
      onChat={vi.fn()}
    />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("文件超出读取大小限制（413）");
    expect(html).toContain(">重新读取</button>");
    expect(html).not.toContain("正在读取创作文稿…");
  });

  it("falls back to non-core project files when core creative documents do not exist yet", () => {
    const path = `${project.root}/qa/verification.json`;
    const html = renderToStaticMarkup(<GameDocuments
      project={project}
      files={[{ path, bytes: 80, version: "1", kind: "text" }]}
      editor={makeEditor()}
      onChat={vi.fn()}
    />);
    expect(html).toContain("verification.json");
    expect(html).toContain('aria-current="page"');
  });

  it("renders conflict resolution buttons in the unified disk-first order and copy", () => {
    const path = `${project.root}/PRODUCT_BRIEF.md`;
    const html = renderToStaticMarkup(<GameDocuments
      project={project}
      files={[{ path, bytes: 40, version: "2", kind: "text" }]}
      editor={makeEditor({
        selected: path,
        buffers: {
          [path]: {
            content: "# 本地草稿",
            saved: "# 旧版本",
            version: "1",
            source: "human",
            conflict: { message: "磁盘内容已更新", theirs: "# 磁盘版本", theirsVersion: "2" }
          }
        }
      })}
      onChat={vi.fn()}
    />);
    const loadDisk = html.indexOf("载入磁盘版本");
    const keepLocal = html.indexOf("保留本地草稿");
    expect(loadDisk).toBeGreaterThan(-1);
    expect(keepLocal).toBeGreaterThan(loadDisk);
  });

  it("keeps all missing dirty drafts reachable in nav and select, shows saved pill, dirty save button and loading state", () => {
    const activePath = `${project.root}/PRODUCT_BRIEF.md`;
    const missingA = `${project.root}/design/GAME_DESIGN.md`;
    const missingB = `${project.root}/notes.md`;
    const html = renderToStaticMarkup(<GameDocuments
      project={project}
      files={[{ path: activePath, bytes: 20, version: "1", kind: "text" }]}
      editor={makeEditor({
        selected: activePath,
        buffers: {
          [activePath]: { content: "# 改稿", saved: "# 原稿", version: "1", source: "human" },
          [missingA]: { content: "# 删前草稿", saved: "# 旧", version: "1", source: "human", missing: true },
          [missingB]: { content: "随笔草稿", saved: "", version: "1", source: "human", missing: true }
        }
      })}
      onChat={vi.fn()}
    />);
    expect(html).toContain("选择与玩法（已删除草稿）");
    expect(html).toContain("notes.md（已删除草稿）");
    expect(html).toContain('data-dirty="true"');
    expect(html).toContain('title="保存（⌘S / Ctrl+S）"');

    const savedHtml = renderToStaticMarkup(<GameDocuments
      project={project}
      files={[{ path: activePath, bytes: 20, version: "1", kind: "text" }]}
      editor={makeEditor({
        selected: activePath,
        buffers: { [activePath]: { content: "# 稳稿", saved: "# 稳稿", version: "1", source: "disk" } }
      })}
      justSaved
      onChat={vi.fn()}
    />);
    expect(savedHtml).toContain("✓ 已保存");

    const loadingHtml = renderToStaticMarkup(<GameDocuments
      project={project}
      files={[{ path: activePath, bytes: 20, version: "1", kind: "text" }]}
      editor={makeEditor({ selected: activePath })}
      onChat={vi.fn()}
    />);
    expect(loadingHtml).toContain("oh-loading-state");
  });
});
