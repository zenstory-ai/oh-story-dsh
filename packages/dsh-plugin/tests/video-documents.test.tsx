import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GameDocumentEditor } from "../src/client/game-documents.js";
import { VideoDocuments } from "../src/client/video-documents.js";
import type { VideoProject } from "../src/client/video-workspace-model.js";

const project: VideoProject = {
  id: "ep1",
  root: "video-recaps/ep1",
  title: "雨夜来信",
  state: "working",
  stage: "assemble",
  stageLabel: "已建时间线",
  previews: [],
  artifacts: [
    { path: "video-recaps/ep1/work/EDIT_PLAN.md", version: "1", label: "剪辑与旁白方案", kind: "script" },
    { path: "video-recaps/ep1/work/timeline.json", version: "1", label: "成片时间线", kind: "plan" },
    { path: "video-recaps/ep1/work/check.json", version: "1", label: "成片体检", kind: "quality" },
    { path: "video-recaps/ep1/work/REFERENCE_NOTES.md", version: "1", label: "参考笔记", kind: "plan" },
    { path: "video-recaps/ep1/work/reference_metrics.json", version: "1", label: "参考指标", kind: "quality" },
    { path: "video-recaps/ep1/work/out/custom.srt", version: "1", label: "SRT 字幕（custom.srt）", kind: "subtitle" }
  ]
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

describe("VideoDocuments", () => {
  it("groups v0.8.0 production records under 更多制作记录 and keeps timeline.json inspectable", () => {
    const timelinePath = "video-recaps/ep1/work/timeline.json";
    const html = renderToStaticMarkup(<VideoDocuments
      project={project}
      editor={makeEditor({
        selected: timelinePath,
        buffers: {
          [timelinePath]: {
            content: '{"schema_version":3,"video":[]}',
            saved: '{"schema_version":3,"video":[]}',
            version: "1",
            source: "disk"
          }
        }
      })}
      onChat={vi.fn()}
    />);
    expect(html).toContain("<summary>更多制作记录</summary>");
    expect(html).toContain("成片时间线");
    expect(html).toContain("成片体检");
    expect(html).toContain("参考笔记");
    expect(html).toContain("参考指标");
    expect(html).toContain("SRT 字幕（custom.srt）");
    expect(html).toContain('open=""');
    expect(html).toContain("schema_version");
  });

  it("displays fileReadError with alert role and retry button instead of infinite loading", () => {
    const path = "video-recaps/ep1/work/EDIT_PLAN.md";
    const html = renderToStaticMarkup(<VideoDocuments
      project={project}
      editor={makeEditor({ selected: path })}
      fileReadError="读取超时（504）"
      onRetryRead={vi.fn()}
      onChat={vi.fn()}
    />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("读取超时（504）");
    expect(html).toContain(">重新读取</button>");
    expect(html).not.toContain("正在读取文稿…");
  });

  it("unifies conflict buttons in disk-first order and copy matching GameDocuments", () => {
    const path = "video-recaps/ep1/work/EDIT_PLAN.md";
    const html = renderToStaticMarkup(<VideoDocuments
      project={project}
      editor={makeEditor({
        selected: path,
        buffers: {
          [path]: {
            content: "# 本地草稿",
            saved: "# 旧稿",
            version: "1",
            source: "human",
            conflict: { message: "磁盘文稿已更新", theirs: "# 磁盘新版", theirsVersion: "2" }
          }
        }
      })}
      onChat={vi.fn()}
    />);
    const loadDisk = html.indexOf("载入磁盘版本");
    const keepLocal = html.indexOf("保留本地草稿");
    expect(loadDisk).toBeGreaterThan(-1);
    expect(keepLocal).toBeGreaterThan(loadDisk);
    expect(html).not.toContain("使用磁盘版本");
    expect(html).not.toContain("保留我的草稿");
  });

  it("forwards resolveImageSrc to MarkdownPreview for markdown artifacts", () => {
    const path = "video-recaps/ep1/work/EDIT_PLAN.md";
    const html = renderToStaticMarkup(<VideoDocuments
      project={project}
      editor={makeEditor({
        selected: path,
        buffers: {
          [path]: {
            content: "# 分镜\n\n![封面](frames/cover.png)",
            saved: "# 分镜\n\n![封面](frames/cover.png)",
            version: "1",
            source: "disk"
          }
        }
      })}
      resolveImageSrc={(src) => `api/oh-story/media?path=${encodeURIComponent(src)}`}
      onChat={vi.fn()}
    />);
    expect(html).toContain('src="api/oh-story/media?path=frames%2Fcover.png"');
  });

  it("does not leak an unrelated fileReadError when editor.selected points to another project file", () => {
    const html = renderToStaticMarkup(<VideoDocuments
      project={project}
      editor={makeEditor({ selected: "video-recaps/other-project/work/BRIEF.md" })}
      fileReadError="读取其他项目失败"
      onRetryRead={vi.fn()}
      onChat={vi.fn()}
    />);
    expect(html).toContain("正在读取文稿…");
    expect(html).not.toContain("读取其他项目失败");
  });
});
