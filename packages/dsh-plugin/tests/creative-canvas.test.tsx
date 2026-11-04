import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreativeCanvas } from "../src/client/creative-canvas.js";

describe("CreativeCanvas", () => {
  it("renders caller-owned nodes, relations, media and actions through the shared canvas shell", () => {
    const nodes = [
      { id: "intent", kind: "intent", title: "观众想知道什么", eyebrow: "表达方向", excerpt: "先留下一个疑问。", initial: { x: 40, y: 60 }, width: 280, height: 190 },
      { id: "segment", kind: "segment", title: "迟到的信", eyebrow: "输出 00:00–00:06", path: "video/narration.json", initial: { x: 440, y: 60 }, width: 280, height: 220 }
    ];
    const markup = renderToStaticMarkup(<CreativeCanvas
      nodes={nodes}
      edges={[{ from: "intent", to: "segment", label: "留下疑问" }]}
      state={{ positions: {}, selectedId: "segment" }}
      onChange={() => undefined}
      onOpen={() => undefined}
      onContinueInChat={() => undefined}
      ariaLabel="视频创作无限画布"
      title="创作画布"
      description="把画面、原声和解说放在一起想。"
      helpText="拖动空白处平移"
      empty={{ title: "还没有内容", description: "先聊聊。", actionLabel: "开始讨论", onAction: () => undefined }}
      renderNodeMedia={(node) => node.id === "segment" ? <img src="/media/segment.jpg" alt="" /> : undefined}
      renderNodeActions={(node) => <button type="button">播放{node.title}</button>}
      renderContextActions={(node) => <button type="button">打开{node.title}</button>}
    />);

    expect(markup).toContain('aria-label="视频创作无限画布"');
    expect(markup).toContain("把画面、原声和解说放在一起想。");
    expect(markup).toContain("观众想知道什么");
    expect(markup).toContain("输出 00:00–00:06");
    expect(markup).toContain("留下疑问");
    expect(markup).toContain('/media/segment.jpg');
    expect(markup).toContain("播放迟到的信");
    expect(markup).toContain("打开迟到的信");
    expect(markup).toContain('data-selected="true"');
  });
});
