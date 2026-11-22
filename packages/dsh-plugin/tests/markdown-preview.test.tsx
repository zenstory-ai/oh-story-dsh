import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownPreview, parseMarkdownBlocks } from "../src/client/markdown-preview.js";

describe("MarkdownPreview", () => {
  it("renders tables, task lists, fenced code, and inline formatting", () => {
    const content = [
      "# 场景计划",
      "",
      "| 场次 | 状态 |",
      "| :--- | ---: |",
      "| SC001 | **完成** |",
      "",
      "- [x] 人物确认",
      "- [ ] 分镜待审",
      "",
      "~~~json",
      '{"scene":"SC001"}',
      "~~~",
      "",
      "保留 ~~旧稿~~ `版本 A`。"
    ].join("\n");

    const html = renderToStaticMarkup(<MarkdownPreview content={content} label="计划.md" />);
    expect(html).toContain("<table>");
    expect(html).toContain('text-align:left');
    expect(html).toContain('text-align:right');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked=\"\"");
    expect(html).toContain('data-language="json"');
    expect(html).toContain("<del>旧稿</del>");
    expect(parseMarkdownBlocks(content).map((block) => block.kind)).toEqual([
      "heading", "table", "ul", "code", "paragraph"
    ]);
  });

  it("hides paired HTML comments outside code while preserving unclosed streaming comments", () => {
    // Oh Story 0.10.0 outlines anchor each plot segment with a heading comment and carry template comments.
    const content = [
      "# 第一卷",
      "",
      "<!-- 脚本按名读取的字段，改名会读不到 -->",
      "",
      "### 第一段剧情：主角入局 <!-- L1-01 -->",
      "",
      "开场<!-- 待补 -->一段。",
      "<!-- 跨行",
      "注释 -->",
      "收尾 `<!-- 保留 -->`。",
      "",
      "```markdown",
      "### 示例 <!-- L1-02 -->",
      "```"
    ].join("\n");
    const html = renderToStaticMarkup(<MarkdownPreview content={content} label="卷纲.md" />);
    expect(html).toContain("<h3>第一段剧情：主角入局</h3>");
    expect(html).not.toContain("L1-01");
    expect(html).not.toContain("脚本按名读取");
    expect(html).not.toContain("待补");
    expect(html).not.toContain("跨行");
    expect(html).toContain("开场一段。");
    expect(html).toContain("<code>&lt;!-- 保留 --&gt;</code>");
    expect(html).toContain("### 示例 &lt;!-- L1-02 --&gt;");
    expect(parseMarkdownBlocks(content).map((block) => block.kind)).toEqual(["heading", "heading", "paragraph", "paragraph", "code"]);

    const streaming = "# 正在流式输出\n\n第一段正文。\n\n<!-- 未闭合注释\n\n后续正文不能被吞掉。";
    const streamingHtml = renderToStaticMarkup(<MarkdownPreview content={streaming} label="流式.md" />);
    expect(streamingHtml).toContain("第一段正文。");
    expect(streamingHtml).toContain("后续正文不能被吞掉。");
  });

  it("renders nested bullet and ordered lists by indentation level", () => {
    const content = [
      "- 一级条目 A",
      "  - 二级子项 A1",
      "    1. 三级有序 1",
      "    2. 三级有序 2",
      "  - 二级子项 A2",
      "- 一级条目 B"
    ].join("\n");
    const blocks = parseMarkdownBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("ul");
    if (blocks[0]?.kind === "ul") {
      expect(blocks[0].items).toHaveLength(2);
      expect(blocks[0].items[0]?.children?.[0]?.kind).toBe("ul");
      expect(blocks[0].items[0]?.children?.[0]?.items[0]?.children?.[0]?.kind).toBe("ol");
    }
    const html = renderToStaticMarkup(<MarkdownPreview content={content} label="大纲.md" />);
    expect(html).toContain("<ul><li>一级条目 A<ul><li>二级子项 A1<ol start=\"1\"><li>三级有序 1</li><li>三级有序 2</li></ol></li><li>二级子项 A2</li></ul></li><li>一级条目 B</li></ul>");
  });

  it("protects inline code spans and supports nested emphasis, links, and safe images", () => {
    const content = [
      "**文件名 `细纲_第*章.md` 格式** 与 **外层 *斜体* 内层** 和 ~~**旧设定**~~。",
      "",
      "[**加粗链接**](https://example.com) ![封面](https://example.com/cover.png) ![相对](./cover.webp)",
      "",
      "![恶意脚本](javascript:alert(1)) ![恶意数据](data:text/html,<script>alert(1)</script>)"
    ].join("\n");
    const html = renderToStaticMarkup(<MarkdownPreview content={content} label="格式.md" />);
    expect(html).toContain("<strong>文件名 <code>细纲_第*章.md</code> 格式</strong>");
    expect(html).toContain("<strong>外层 <em>斜体</em> 内层</strong>");
    expect(html).toContain("<del><strong>旧设定</strong></del>");
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer"><strong>加粗链接</strong></a>');
    expect(html).toContain('<img class="oh-story-markdown-image" src="https://example.com/cover.png" alt="封面" loading="lazy"/>');
    expect(html).toContain('<img class="oh-story-markdown-image" src="./cover.webp" alt="相对" loading="lazy"/>');
    expect(html).not.toContain('src="javascript:');
    expect(html).not.toContain('src="data:text/html');
  });

  it("does not split table columns on pipes inside inline code spans", () => {
    const content = [
      "| 写法 | 说明 |",
      "| --- | --- |",
      "| `auto|ffmpeg|off` | 模式选项 |"
    ].join("\n");
    const blocks = parseMarkdownBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("table");
    if (blocks[0]?.kind === "table") {
      expect(blocks[0].rows).toEqual([["`auto|ffmpeg|off`", "模式选项"]]);
    }
    const html = renderToStaticMarkup(<MarkdownPreview content={content} label="表格.md" />);
    expect(html).toContain("<td><code>auto|ffmpeg|off</code></td><td>模式选项</td>");
  });

  it("keeps raw HTML inert and only activates safe web links", () => {
    const content = '<script>alert(1)</script> [官网](https://example.com) [脚本](javascript:alert(1))';
    const html = renderToStaticMarkup(<MarkdownPreview content={content} label="安全.md" />);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('href="javascript:');
  });
});
