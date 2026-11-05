import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GameDocuments, type GameDocumentEditor } from "../src/client/game-documents.js";
import { VideoStudio, type VideoProject } from "../src/client/video-studio.js";
import { videoCanvasModel } from "../src/client/video-workspace-model.js";
import { projectVideoNarrative } from "../src/video-narrative.js";
import { gameRoot } from "../src/workspace-route.js";

const editor: GameDocumentEditor = {
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
  onRetry: vi.fn()
};

const media = (role: "source" | "final", path: string) => ({ role, label: role, path, version: "v1", bytes: 1, mimeType: "video/mp4" });
const baseProject: VideoProject = { id: "recap", root: "video-recaps/recap", title: "雨夜来信", state: "working", stage: "narration", stageLabel: "解说", previews: [], artifacts: [] };
const fullProject: VideoProject = {
  ...baseProject,
  previews: [media("source", "video-recaps/recap/sources/a.mp4"), media("final", "video-recaps/recap/outputs/final.mp4")],
  narrative: projectVideoNarrative({ editMode: "full", narration: [{ start: 0, end: 2, narration: "第一段解说" }] })
};

function renderVideo(project: VideoProject | undefined, overrides: { readonly running?: boolean; readonly tab?: "preview" | "docs" } = {}): string {
  return renderToStaticMarkup(<VideoStudio
    sessionId="session"
    projects={project === undefined ? [] : [project]}
    files={[]}
    running={overrides.running ?? false}
    projectId={project?.id}
    tab={overrides.tab ?? "preview"}
    hidden={false}
    paneId="pane"
    labelledBy="label"
    onProject={vi.fn()}
    onTab={vi.fn()}
    onWorkbench={vi.fn()}
    onCollapse={vi.fn()}
    chatOpen={false}
    onChatOpen={vi.fn()}
    onContinueInChat={vi.fn()}
    editor={editor}
    canvasByProject={{}}
    onCanvasChange={vi.fn()}
  />);
}

beforeAll(() => { vi.stubGlobal("location", { origin: "http://localhost" }); });

describe("video workbench default surface", () => {
  it("drops repeated headings, info bars and explanatory copy", () => {
    const markup = renderVideo(fullProject);
    for (const removed of ["视频解说", "<h2", "视频项目</span>", "段落概览", "在画布里看故事", "正在核对这段解说", "讨论这一段", "边看画面", "文稿用于定位和讨论", "完整文稿", "已载入", "正在读取视频", "oh-video-player-caption"]) {
      expect(markup).not.toContain(removed);
    }
  });

  it("keeps the player, project switch, navigation and working actions", () => {
    const markup = renderVideo(fullProject);
    expect(markup).toContain("<video");
    expect(markup).toContain('aria-label="视频项目"');
    expect(markup).toContain("雨夜来信");
    for (const kept of ["预览", "创作画布", "文稿", "Chat", "制作详情", "原片", "成片", "讨论当前画面", "导出视频", "全屏预览", "改稿", "第一段解说"]) {
      expect(markup).toContain(kept);
    }
    expect(markup).toMatch(/<button class="oh-video-context-action" type="button" aria-expanded="[^"]*">解说稿<\/button>/u);
  });

  it("does not repeat the documents heading in the video documents tab", () => {
    const markup = renderVideo({ ...fullProject, artifacts: [{ path: "video-recaps/recap/work/narration.json", version: "v1", label: "解说词", kind: "script" }] }, { tab: "docs" });
    expect(markup).toContain('aria-label="视频创作文稿"');
    expect(markup).not.toContain("怎么讲这个故事");
    expect(markup).not.toContain("<small>创作文稿");
  });

  it("shows the status bar only when production keeps the current video", () => {
    expect(renderVideo(fullProject, { running: true })).toContain("正在继续制作 · 当前视频保留");
  });

  it("offers one empty state, without an example prompt or an empty script shell", () => {
    for (const markup of [renderVideo(undefined), renderVideo(baseProject)]) {
      expect(markup.match(/oh-video-preview-empty/gu)).toHaveLength(1);
      expect(markup).not.toContain("可以这样开始");
      expect(markup).not.toContain("oh-video-script-panel");
    }
  });

  it("keeps canvas cards for media free of copy that repeats their action", () => {
    const { nodes } = videoCanvasModel(fullProject, fullProject.narrative);
    expect(nodes.find((node) => node.id === "source")?.excerpt).toBeUndefined();
    expect(nodes.find((node) => node.id === "preview")?.excerpt).toBeUndefined();
    expect(nodes.find((node) => node.segment !== undefined)?.excerpt).toBe("第一段解说");
  });
});

describe("existing playtest notes on disk", () => {
  const project = { id: "letter", root: "game-adaptations/letter", title: "来信", source: "workspace" } as Parameters<typeof GameDocuments>[0]["project"];
  const text = (path: string) => ({ path, bytes: 10, version: "1", kind: "text" as const });
  const render = () => renderToStaticMarkup(<GameDocuments
    project={project}
    files={[text("game-adaptations/letter/PRODUCT_BRIEF.md"), text("game-adaptations/letter/PLAYTEST_NOTES.md")]}
    editor={editor}
    onChat={vi.fn()}
  />);

  it("stay reachable as an ordinary project file with no dedicated title", () => {
    const markup = render();
    expect(markup).toContain("更多项目文件");
    expect(markup).toContain('aria-label="game-adaptations/letter/PLAYTEST_NOTES.md"');
    expect(markup).not.toContain("试玩笔记");
  });

  it("does not repeat the documents heading around the current document", () => {
    const markup = render();
    expect(markup).not.toContain("<small>创作文稿");
    expect(markup).not.toContain("<span>创作文稿");
  });
});

describe("game project roots", () => {
  it("accepts only a direct child of the game directory", () => {
    expect(gameRoot("game-adaptations/金瓶梅 · 风月总账")).toBe(true);
    expect(gameRoot("game-adaptations/project/nested")).toBe(false);
    expect(gameRoot("game-adaptations/../正文")).toBe(false);
  });
});
