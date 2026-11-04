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

  it("hides HTML comments outside code, as rendered Markdown does", () => {
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
  });

  it("keeps raw HTML inert and only activates safe web links", () => {
    const content = '<script>alert(1)</script> [官网](https://example.com) [脚本](javascript:alert(1))';
    const html = renderToStaticMarkup(<MarkdownPreview content={content} label="安全.md" />);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('href="javascript:');
  });
});
