import type { ReactNode } from "react";

const MAX_INLINE_DEPTH = 8;

function hasAsciiControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

function isSafeWebUrl(url: string): boolean {
  if (hasAsciiControlChar(url)) return false;
  return /^https?:\/\/[^)\s]+$/iu.test(url.trim());
}

export function isSafeImageSrc(src: string): boolean {
  if (hasAsciiControlChar(src)) return false;
  const trimmed = src.trim();
  if (trimmed === "" || trimmed.startsWith("//")) return false;
  if (/^https?:\/\//iu.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) return false;
  return true;
}

/** Find a closing inline code backtick on the same line, returning its index or -1. */
function findCodeClose(source: string, openIndex: number): number {
  const close = source.indexOf("`", openIndex + 1);
  if (close <= openIndex + 1) return -1;
  const newline = source.indexOf("\n", openIndex + 1);
  if (newline >= 0 && newline < close) return -1;
  return close;
}

/** Find a closing inline delimiter while skipping over inline `code` spans. */
function findClosingDelimiter(source: string, from: number, marker: "**" | "~~" | "*" | "_"): number {
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === "`") {
      const codeClose = findCodeClose(source, index);
      if (codeClose > index) {
        index = codeClose;
        continue;
      }
    }
    if (!source.startsWith(marker, index)) continue;
    const prev = source[index - 1];
    if (prev === undefined || /\s/u.test(prev)) continue;
    if (marker === "**") {
      // Allow **foo *bar*** to close the inner * first and outer ** last.
      if (source[index + 2] === "*" && source[index + 3] !== "*") return index + 1;
      return index;
    }
    if (marker === "*") {
      if (source[index + 1] === "*" || source[index - 1] === "*") continue;
      return index;
    }
    if (marker === "_") {
      if (source[index + 1] === "_" || isWordCharacter(source[index + 1])) continue;
      return index;
    }
    return index;
  }
  return -1;
}

/** Find matching `](url)` or `](url "title")` after `[` at `openBracket`, skipping inline `code` spans. */
function parseBracketTarget(source: string, openBracket: number): {
  readonly label: string;
  readonly target: string;
  readonly title?: string | undefined;
  readonly end: number;
} | undefined {
  let depth = 0;
  let closeBracket = -1;
  for (let index = openBracket; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "`") {
      const codeClose = findCodeClose(source, index);
      if (codeClose > index) {
        index = codeClose;
        continue;
      }
    }
    if (ch === "\n") return undefined;
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        closeBracket = index;
        break;
      }
    }
  }
  if (closeBracket < 0 || source[closeBracket + 1] !== "(") return undefined;
  let index = closeBracket + 2;
  while (index < source.length && source[index] === " ") index += 1;
  const targetStart = index;
  let parenDepth = 0;
  while (index < source.length) {
    const ch = source[index];
    if (ch === "\n") return undefined;
    if (ch === "(") {
      parenDepth += 1;
      index += 1;
      continue;
    }
    if (ch === ")") {
      if (parenDepth === 0) break;
      parenDepth -= 1;
      index += 1;
      continue;
    }
    if (/\s/u.test(ch ?? "")) {
      if (parenDepth > 0) return undefined;
      break;
    }
    index += 1;
  }
  const target = source.slice(targetStart, index);
  if (target === "") return undefined;
  while (index < source.length && source[index] === " ") index += 1;
  let title: string | undefined;
  if (source[index] === '"' || source[index] === "'") {
    const quote = source[index]!;
    index += 1;
    let parsedTitle = "";
    let closedTitle = false;
    while (index < source.length) {
      const ch = source[index];
      if (ch === "\n") return undefined;
      if (ch === "\\" && (source[index + 1] === quote || source[index + 1] === "\\")) {
        parsedTitle += source[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (ch === quote) {
        closedTitle = true;
        index += 1;
        break;
      }
      parsedTitle += ch ?? "";
      index += 1;
    }
    if (!closedTitle) return undefined;
    title = parsedTitle;
    while (index < source.length && source[index] === " ") index += 1;
  }
  if (source[index] !== ")") return undefined;
  return {
    label: source.slice(openBracket + 1, closeBracket),
    target,
    ...(title === undefined ? {} : { title }),
    end: index + 1
  };
}

type ImageSrcResolver = (src: string) => string | undefined;

function inline(source: string, key: string, depth = 0, resolveImageSrc?: ImageSrcResolver): ReactNode[] {
  if (depth >= MAX_INLINE_DEPTH || source === "") return source === "" ? [] : [source];
  const nodes: ReactNode[] = [];
  let text = "";
  const flush = () => {
    if (text !== "") {
      nodes.push(text);
      text = "";
    }
  };

  for (let index = 0; index < source.length;) {
    const ch = source[index] ?? "";

    // 1. Inline code spans are protected first so nested delimiters inside backticks stay literal.
    if (ch === "`") {
      const close = findCodeClose(source, index);
      if (close > index) {
        flush();
        nodes.push(<code key={`${key}-${String(index)}`}>{source.slice(index + 1, close)}</code>);
        index = close + 1;
        continue;
      }
    }

    // 2. Images: ![alt](src) with strict URL scheme guard and optional workspace resolver.
    if (ch === "!" && source[index + 1] === "[") {
      const parsed = parseBracketTarget(source, index + 1);
      if (parsed !== undefined) {
        if (isSafeImageSrc(parsed.target)) {
          const rawSrc = parsed.target.trim();
          const resolved = resolveImageSrc?.(rawSrc);
          const safeSrc = resolved !== undefined && isSafeImageSrc(resolved) ? resolved.trim() : rawSrc;
          flush();
          nodes.push(<img key={`${key}-${String(index)}`} className="oh-story-markdown-image" src={safeSrc} alt={parsed.label} title={parsed.title} loading="lazy" />);
        } else {
          text += source.slice(index, parsed.end);
        }
        index = parsed.end;
        continue;
      }
    }

    // 3. Links: [label](https://...) with recursive label parsing.
    if (ch === "[") {
      const parsed = parseBracketTarget(source, index);
      if (parsed !== undefined && parsed.label !== "") {
        if (isSafeWebUrl(parsed.target)) {
          flush();
          nodes.push(
            <a key={`${key}-${String(index)}`} href={parsed.target.trim()} title={parsed.title} target="_blank" rel="noreferrer">
              {inline(parsed.label, `${key}-a-${String(index)}`, depth + 1, resolveImageSrc)}
            </a>
          );
        } else {
          text += source.slice(index, parsed.end);
        }
        index = parsed.end;
        continue;
      }
    }

    // 4. Strong: **...**
    if (source.startsWith("**", index) && source[index + 2] !== undefined && !/\s/u.test(source[index + 2] ?? "")) {
      const close = findClosingDelimiter(source, index + 2, "**");
      if (close > index + 2) {
        flush();
        nodes.push(<strong key={`${key}-${String(index)}`}>{inline(source.slice(index + 2, close), `${key}-b-${String(index)}`, depth + 1, resolveImageSrc)}</strong>);
        index = close + 2;
        continue;
      }
    }

    // 5. Strikethrough: ~~...~~
    if (source.startsWith("~~", index) && source[index + 2] !== undefined && !/\s/u.test(source[index + 2] ?? "")) {
      const close = findClosingDelimiter(source, index + 2, "~~");
      if (close > index + 2) {
        flush();
        nodes.push(<del key={`${key}-${String(index)}`}>{inline(source.slice(index + 2, close), `${key}-d-${String(index)}`, depth + 1, resolveImageSrc)}</del>);
        index = close + 2;
        continue;
      }
    }

    // 6. Emphasis: *...*
    if (ch === "*" && source[index + 1] !== "*" && source[index + 1] !== undefined && !/\s/u.test(source[index + 1] ?? "")) {
      const close = findClosingDelimiter(source, index + 1, "*");
      if (close > index + 1) {
        flush();
        nodes.push(<em key={`${key}-${String(index)}`}>{inline(source.slice(index + 1, close), `${key}-e-${String(index)}`, depth + 1, resolveImageSrc)}</em>);
        index = close + 1;
        continue;
      }
    }

    // 7. Emphasis: _..._ (word-bounded so snake_case identifiers stay untouched)
    if (ch === "_" && source[index + 1] !== "_" && !isWordCharacter(source[index - 1]) && source[index + 1] !== undefined && !/\s/u.test(source[index + 1] ?? "")) {
      const close = findClosingDelimiter(source, index + 1, "_");
      if (close > index + 1) {
        flush();
        nodes.push(<em key={`${key}-${String(index)}`}>{inline(source.slice(index + 1, close), `${key}-u-${String(index)}`, depth + 1, resolveImageSrc)}</em>);
        index = close + 1;
        continue;
      }
    }

    text += ch;
    index += 1;
  }

  flush();
  return nodes;
}

type Alignment = "left" | "center" | "right" | undefined;

export interface MarkdownListItem {
  readonly text: string;
  readonly checked?: boolean;
  readonly children?: readonly MarkdownListBlock[];
}

export interface MarkdownListBlock {
  readonly kind: "ul" | "ol";
  readonly items: readonly MarkdownListItem[];
  readonly start?: number;
}

export type MarkdownBlock =
  | { readonly kind: "code"; readonly lines: readonly string[]; readonly language?: string }
  | { readonly kind: "heading"; readonly text: string; readonly level: number }
  | { readonly kind: "quote"; readonly lines: readonly string[] }
  | MarkdownListBlock
  | { readonly kind: "table"; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly alignments: readonly Alignment[] }
  | { readonly kind: "rule" }
  | { readonly kind: "paragraph"; readonly lines: readonly string[] };

function splitTableRow(line: string): string[] {
  let source = line.trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|") && !source.endsWith("\\|")) source = source.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (character === "\\") {
      if (source[index + 1] === "|") {
        cell += "|";
        index += 1;
        continue;
      }
    }
    if (character === "`") {
      inCode = !inCode;
      cell += character;
    } else if (character === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function tableAlignments(line: string): Alignment[] | undefined {
  if (!line.includes("|")) return undefined;
  const cells = splitTableRow(line);
  if (cells.length === 0 || !cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) return undefined;
  return cells.map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    if (cell.startsWith(":")) return "left";
    return undefined;
  });
}

function parseTableHeader(headerLine: string, delimiterLine: string | undefined): { readonly headers: string[]; readonly alignments: Alignment[] } | undefined {
  if (!headerLine.includes("|") || delimiterLine === undefined) return undefined;
  const alignments = tableAlignments(delimiterLine);
  if (alignments === undefined) return undefined;
  const headers = splitTableRow(headerLine);
  if (headers.length === 0 || alignments.length !== headers.length) return undefined;
  return { headers, alignments };
}

interface ParsedListLine {
  readonly indent: number;
  readonly kind: "ul" | "ol";
  readonly start?: number;
  readonly text: string;
}

function indentWidth(prefix: string): number {
  let width = 0;
  for (const ch of prefix) width += ch === "\t" ? 2 : 1;
  return width;
}

function matchListLine(line: string): ParsedListLine | undefined {
  const unordered = /^([ \t]*)[-*+]\s+(.+)$/u.exec(line);
  if (unordered !== null) {
    return { indent: indentWidth(unordered[1] ?? ""), kind: "ul", text: unordered[2] ?? "" };
  }
  const ordered = /^([ \t]*)(\d+)[.)]\s+(.+)$/u.exec(line);
  if (ordered !== null) {
    return { indent: indentWidth(ordered[1] ?? ""), kind: "ol", start: Number(ordered[2]), text: ordered[3] ?? "" };
  }
  return undefined;
}

function parseListBlock(lines: readonly string[], startIndex: number): { readonly block: MarkdownListBlock; readonly nextIndex: number } {
  const first = matchListLine(lines[startIndex] ?? "");
  if (first === undefined) return { block: { kind: "ul", items: [] }, nextIndex: startIndex };
  const baseIndent = first.indent;
  const kind = first.kind;
  const start = first.start;
  const items: Array<{ readonly text: string; readonly checked?: boolean; children?: MarkdownListBlock[] }> = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      // Allow a single blank line only when followed by a nested child list item.
      let probe = index + 1;
      while (probe < lines.length && (lines[probe] ?? "").trim() === "") probe += 1;
      const nextList = matchListLine(lines[probe] ?? "");
      if (nextList !== undefined && nextList.indent > baseIndent && items.length > 0) {
        index = probe;
        continue;
      }
      break;
    }
    const parsed = matchListLine(line);
    if (parsed === undefined) break;
    if (parsed.indent < baseIndent) break;
    if (parsed.indent > baseIndent) {
      if (items.length === 0) break;
      const nested = parseListBlock(lines, index);
      const parent = items[items.length - 1]!;
      parent.children = [...(parent.children ?? []), nested.block];
      index = nested.nextIndex;
      continue;
    }
    if (parsed.kind !== kind) break;
    const task = /^\[([ xX])\]\s+(.+)$/u.exec(parsed.text);
    items.push(task === null ? { text: parsed.text } : { text: task[2] ?? "", checked: task[1]?.toLocaleLowerCase() === "x" });
    index += 1;
  }

  return {
    block: { kind, items, ...(start === undefined ? {} : { start }) },
    nextIndex: index
  };
}

const FENCE = /^(`{3,}|~{3,})\s*([^\s`~]*)(?:\s+[^\n]*)?$/u;

function beginsBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  return FENCE.test(line)
    || /^#{1,6}\s+/u.test(line)
    || /^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)
    || /^>\s?/u.test(line)
    || matchListLine(line) !== undefined
    || parseTableHeader(line, lines[index + 1]) !== undefined;
}

/** Check whether an opening `<!--` has a matching `-->` in the current remainder or any later line. */
function hasClosingHtmlComment(lines: readonly string[], lineIndex: number, afterOpen: string): boolean {
  if (afterOpen.includes("-->")) return true;
  for (let probe = lineIndex + 1; probe < lines.length; probe += 1) {
    if ((lines[probe] ?? "").includes("-->")) return true;
  }
  return false;
}

/**
 * Hide paired HTML comments the way rendered Markdown does, outside fenced code and inline code.
 * Unclosed streaming `<!--` fragments are kept intact so partial Agent output never wipes the rest
 * of the document.
 */
function withoutHtmlComments(lines: readonly string[]): string[] {
  const output: string[] = [];
  let fence: string | undefined;
  let inComment = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
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
      const afterOpen = rest.slice(start + 4);
      if (!hasClosingHtmlComment(lines, lineIndex, afterOpen)) {
        // Leave an unclosed comment intact rather than swallowing the rest of the document.
        kept += rest;
        break;
      }
      kept += rest.slice(0, start);
      rest = afterOpen;
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

    const fence = FENCE.exec(line);
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

    const tableHeader = parseTableHeader(line, lines[index + 1]);
    if (tableHeader !== undefined) {
      const { headers, alignments } = tableHeader;
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

    if (matchListLine(line) !== undefined) {
      const parsed = parseListBlock(lines, index);
      result.push(parsed.block);
      index = parsed.nextIndex;
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

function Heading({ block, blockKey, resolveImageSrc }: {
  readonly block: Extract<MarkdownBlock, { readonly kind: "heading" }>;
  readonly blockKey: string;
  readonly resolveImageSrc?: ImageSrcResolver | undefined;
}) {
  const children = inline(block.text, blockKey, 0, resolveImageSrc);
  switch (block.level) {
    case 1: return <h1>{children}</h1>;
    case 2: return <h2>{children}</h2>;
    case 3: return <h3>{children}</h3>;
    case 4: return <h4>{children}</h4>;
    case 5: return <h5>{children}</h5>;
    default: return <h6>{children}</h6>;
  }
}

function renderList(block: MarkdownListBlock, key: string, resolveImageSrc?: ImageSrcResolver): ReactNode {
  const items = block.items.map((item, itemIndex) => (
    <li key={`${key}-${String(itemIndex)}`} className={item.checked === undefined ? undefined : "oh-story-task-item"}>
      {item.checked === undefined ? null : <input type="checkbox" checked={item.checked} readOnly disabled aria-label={item.checked ? "已完成" : "未完成"} />}
      {inline(item.text, `${key}-${String(itemIndex)}`, 0, resolveImageSrc)}
      {item.children?.map((child, childIndex) => renderList(child, `${key}-${String(itemIndex)}-sub-${String(childIndex)}`, resolveImageSrc))}
    </li>
  ));
  return block.kind === "ul" ? <ul key={key}>{items}</ul> : <ol key={key} start={block.start}>{items}</ol>;
}

export function MarkdownPreview({ content, label, resolveImageSrc }: {
  readonly content: string;
  readonly label: string;
  readonly resolveImageSrc?: ImageSrcResolver | undefined;
}) {
  const parsed = parseMarkdownBlocks(content);
  if (parsed.length === 0) return <div className="oh-story-markdown-empty">这个 Markdown 文件还是空的。</div>;
  return <article className="oh-story-markdown" aria-label={`${label} 渲染预览`}>
    {parsed.map((block, index) => {
      const key = `block-${String(index)}`;
      if (block.kind === "code") return <pre key={key}><code data-language={block.language}>{block.lines.join("\n")}</code></pre>;
      if (block.kind === "rule") return <hr key={key} />;
      if (block.kind === "quote") return <blockquote key={key}>{block.lines.map((line, lineIndex) => <p key={`${key}-${String(lineIndex)}`}>{inline(line, `${key}-${String(lineIndex)}`, 0, resolveImageSrc)}</p>)}</blockquote>;
      if (block.kind === "ul" || block.kind === "ol") return renderList(block, key, resolveImageSrc);
      if (block.kind === "table") return <div className="oh-story-markdown-table" key={key}>
        <table>
          <thead><tr>{block.headers.map((cell, cellIndex) => <th key={`${key}-h-${String(cellIndex)}`} style={{ textAlign: block.alignments[cellIndex] }}>{inline(cell, `${key}-h-${String(cellIndex)}`, 0, resolveImageSrc)}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${String(rowIndex)}`}>{block.headers.map((_, cellIndex) => <td key={`${key}-r-${String(rowIndex)}-${String(cellIndex)}`} style={{ textAlign: block.alignments[cellIndex] }}>{inline(row[cellIndex] ?? "", `${key}-r-${String(rowIndex)}-${String(cellIndex)}`, 0, resolveImageSrc)}</td>)}</tr>)}</tbody>
        </table>
      </div>;
      if (block.kind === "heading") return <Heading key={key} block={block} blockKey={key} resolveImageSrc={resolveImageSrc} />;
      if (block.kind === "paragraph") return <p key={key}>{block.lines.map((line, lineIndex) => <span key={`${key}-${String(lineIndex)}`}>{lineIndex === 0 ? null : <br />}{inline(line, `${key}-${String(lineIndex)}`, 0, resolveImageSrc)}</span>)}</p>;
      return null;
    })}
  </article>;
}
