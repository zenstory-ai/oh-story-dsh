import type { ReactNode } from "react";

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*)/gu;

function inline(source: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of source.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index;
    if (index > cursor) nodes.push(source.slice(cursor, index));
    if (token.startsWith("`")) nodes.push(<code key={`${key}-${String(index)}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={`${key}-${String(index)}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<del key={`${key}-${String(index)}`}>{token.slice(2, -2)}</del>);
    else if (token.startsWith("*")) nodes.push(<em key={`${key}-${String(index)}`}>{token.slice(1, -1)}</em>);
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/u.exec(token);
      nodes.push(link === null ? token : <a key={`${key}-${String(index)}`} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
    }
    cursor = index + token.length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

type Alignment = "left" | "center" | "right" | undefined;
interface ListItem { readonly text: string; readonly checked?: boolean }

export type MarkdownBlock =
  | { readonly kind: "code"; readonly lines: readonly string[]; readonly language?: string }
  | { readonly kind: "heading"; readonly text: string; readonly level: number }
  | { readonly kind: "quote"; readonly lines: readonly string[] }
  | { readonly kind: "ul" | "ol"; readonly items: readonly ListItem[]; readonly start?: number }
  | { readonly kind: "table"; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly alignments: readonly Alignment[] }
  | { readonly kind: "rule" }
  | { readonly kind: "paragraph"; readonly lines: readonly string[] };

function splitTableRow(line: string): string[] {
  let source = line.trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|")) source = source.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (character === "\\" && source[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function tableAlignments(line: string): Alignment[] | undefined {
  const cells = splitTableRow(line);
  if (cells.length === 0 || !cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) return undefined;
  return cells.map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    if (cell.startsWith(":")) return "left";
    return undefined;
  });
}

function beginsBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  return /^(`{3,}|~{3,})\s*[\w-]*\s*$/u.test(line)
    || /^#{1,6}\s+/u.test(line)
    || /^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)
    || /^>\s?/u.test(line)
    || /^[-*+]\s+/u.test(line)
    || /^\d+[.)]\s+/u.test(line)
    || (line.includes("|") && tableAlignments(lines[index + 1] ?? "") !== undefined);
}

const FENCE = /^(`{3,}|~{3,})\s*[\w-]*\s*$/u;

/**
 * Hide HTML comments the way rendered Markdown does, outside fenced code and inline code. Oh Story
 * 0.10.0 outlines carry script anchors such as `### 第一段剧情：… <!-- L1-01 -->`; other raw HTML
 * stays inert text.
 */
function withoutHtmlComments(lines: readonly string[]): string[] {
  const output: string[] = [];
  let fence: string | undefined;
  let inComment = false;
  for (const line of lines) {
    if (fence !== undefined) {
      output.push(line);
      if (new RegExp(`^${fence[0] ?? "`"}{${String(fence.length)},}\\s*$`, "u").test(line)) fence = undefined;
      continue;
    }
    if (!inComment && FENCE.test(line)) {
      fence = /^(`{3,}|~{3,})/u.exec(line)?.[1];
      output.push(line);
      continue;
    }
    let kept = "";
    let rest = line;
    while (rest !== "") {
      if (inComment) {
        const end = rest.indexOf("-->");
        if (end < 0) break;
        rest = rest.slice(end + 3);
        inComment = false;
        continue;
      }
      const code = /`[^`\n]+`/u.exec(rest);
      const start = rest.indexOf("<!--");
      if (start < 0) { kept += rest; break; }
      if (code !== null && code.index < start) {
        kept += rest.slice(0, code.index + code[0].length);
        rest = rest.slice(code.index + code[0].length);
        continue;
      }
      kept += rest.slice(0, start);
      rest = rest.slice(start + 4);
      inComment = true;
    }
    output.push(kept === line ? line : kept.trimEnd());
  }
  return output;
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = withoutHtmlComments(markdown.replaceAll("\r\n", "\n").split("\n"));
  const result: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (line.trim() === "") { index += 1; continue; }

    const fence = /^(`{3,}|~{3,})\s*([\w-]*)\s*$/u.exec(line);
    if (fence !== null) {
      const marker = fence[1] ?? "```";
      const markerCharacter = marker[0] ?? "`";
      const closing = new RegExp(`^${markerCharacter}{${String(marker.length)},}\\s*$`, "u");
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !closing.test(lines[index] ?? "")) { code.push(lines[index] ?? ""); index += 1; }
      if (index < lines.length) index += 1;
      result.push({ kind: "code", lines: code, ...(fence[2] === undefined || fence[2] === "" ? {} : { language: fence[2] }) });
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading !== null) {
      result.push({ kind: "heading", text: heading[2] ?? "", level: heading[1]?.length ?? 1 });
      index += 1;
      continue;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) { result.push({ kind: "rule" }); index += 1; continue; }

    const alignments = line.includes("|") ? tableAlignments(lines[index + 1] ?? "") : undefined;
    if (alignments !== undefined) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      result.push({ kind: "table", headers, rows, alignments });
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/u, ""));
        index += 1;
      }
      result.push({ kind: "quote", lines: quote });
      continue;
    }

    const unordered = /^[-*+]\s+(.+)$/u.exec(line);
    const ordered = /^(\d+)[.)]\s+(.+)$/u.exec(line);
    if (unordered !== null || ordered !== null) {
      const kind = unordered !== null ? "ul" : "ol";
      const items: ListItem[] = [];
      const pattern = kind === "ul" ? /^[-*+]\s+(.+)$/u : /^\d+[.)]\s+(.+)$/u;
      const start = ordered === null ? undefined : Number(ordered[1]);
      while (index < lines.length) {
        const item = pattern.exec(lines[index] ?? "");
        if (item === null) break;
        const source = item[1] ?? "";
        const task = /^\[([ xX])\]\s+(.+)$/u.exec(source);
        items.push(task === null ? { text: source } : { text: task[2] ?? "", checked: task[1]?.toLocaleLowerCase() === "x" });
        index += 1;
      }
      result.push({ kind, items, ...(start === undefined ? {} : { start }) });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "" || beginsBlock(lines, index)) break;
      paragraph.push(next);
      index += 1;
    }
    result.push({ kind: "paragraph", lines: paragraph });
  }
  return result;
}

function Heading({ block, blockKey }: { readonly block: Extract<MarkdownBlock, { readonly kind: "heading" }>; readonly blockKey: string }) {
  const children = inline(block.text, blockKey);
  switch (block.level) {
    case 1: return <h1>{children}</h1>;
    case 2: return <h2>{children}</h2>;
    case 3: return <h3>{children}</h3>;
    case 4: return <h4>{children}</h4>;
    case 5: return <h5>{children}</h5>;
    default: return <h6>{children}</h6>;
  }
}

export function MarkdownPreview({ content, label }: { readonly content: string; readonly label: string }) {
  const parsed = parseMarkdownBlocks(content);
  if (parsed.length === 0) return <div className="oh-story-markdown-empty">这个 Markdown 文件还是空的。</div>;
  return <article className="oh-story-markdown" aria-label={`${label} 渲染预览`}>
    {parsed.map((block, index) => {
      const key = `block-${String(index)}`;
      if (block.kind === "code") return <pre key={key}><code data-language={block.language}>{block.lines.join("\n")}</code></pre>;
      if (block.kind === "rule") return <hr key={key} />;
      if (block.kind === "quote") return <blockquote key={key}>{block.lines.map((line, lineIndex) => <p key={`${key}-${String(lineIndex)}`}>{inline(line, `${key}-${String(lineIndex)}`)}</p>)}</blockquote>;
      if (block.kind === "ul" || block.kind === "ol") {
        const items = block.items.map((item, itemIndex) => <li key={`${key}-${String(itemIndex)}`} className={item.checked === undefined ? undefined : "oh-story-task-item"}>
          {item.checked === undefined ? null : <input type="checkbox" checked={item.checked} readOnly disabled aria-label={item.checked ? "已完成" : "未完成"} />}
          {inline(item.text, `${key}-${String(itemIndex)}`)}
        </li>);
        return block.kind === "ul" ? <ul key={key}>{items}</ul> : <ol key={key} start={block.start}>{items}</ol>;
      }
      if (block.kind === "table") return <div className="oh-story-markdown-table" key={key}>
        <table>
          <thead><tr>{block.headers.map((cell, cellIndex) => <th key={`${key}-h-${String(cellIndex)}`} style={{ textAlign: block.alignments[cellIndex] }}>{inline(cell, `${key}-h-${String(cellIndex)}`)}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${String(rowIndex)}`}>{block.headers.map((_, cellIndex) => <td key={`${key}-r-${String(rowIndex)}-${String(cellIndex)}`} style={{ textAlign: block.alignments[cellIndex] }}>{inline(row[cellIndex] ?? "", `${key}-r-${String(rowIndex)}-${String(cellIndex)}`)}</td>)}</tr>)}</tbody>
        </table>
      </div>;
      if (block.kind === "heading") return <Heading key={key} block={block} blockKey={key} />;
      if (block.kind === "paragraph") return <p key={key}>{block.lines.map((line, lineIndex) => <span key={`${key}-${String(lineIndex)}`}>{lineIndex === 0 ? null : <br />}{inline(line, `${key}-${String(lineIndex)}`)}</span>)}</p>;
      return null;
    })}
  </article>;
}
