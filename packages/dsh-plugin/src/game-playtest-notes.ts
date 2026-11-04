import type { FsVersion, FsWriteIntent } from "@deepseek-ai/dsh-fs";

export const GAME_PLAYTEST_NOTES_FILE = "PLAYTEST_NOTES.md";
export const MAX_PLAYTEST_NOTE_BYTES = 32 * 1_024;

export interface GamePlaytestNote {
  readonly id: string;
  readonly text: string;
  readonly previewVersion: string;
  readonly context?: string | undefined;
  readonly createdAt: string;
}

export interface GamePlaytestNotesFile {
  readonly content: string;
  readonly exists: boolean;
  /** `null` means the next write must create the file rather than overwrite one. */
  readonly expectedVersion: string | null;
  readonly notes: readonly GamePlaytestNote[];
}

const START = "<!-- oh-story:playtest-note ";
const END = "<!-- /oh-story:playtest-note ";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function boundedText(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

export function validGamePlaytestNote(value: unknown): value is GamePlaytestNote {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const note = value as Record<string, unknown>;
  const id = boundedText(note.id, 128);
  const text = boundedText(note.text, MAX_PLAYTEST_NOTE_BYTES);
  const previewVersion = boundedText(note.previewVersion, 256);
  const context = note.context === undefined ? undefined : boundedText(note.context, 256);
  const createdAt = boundedText(note.createdAt, 64);
  return id !== undefined && ID.test(id) && !id.includes("--")
    && text !== undefined && text.trim() !== ""
    && previewVersion !== undefined && previewVersion !== ""
    && (note.context === undefined || context !== undefined)
    && createdAt !== undefined && !Number.isNaN(Date.parse(createdAt));
}

function metadata(note: GamePlaytestNote): string {
  return JSON.stringify({
    id: note.id,
    previewVersion: note.previewVersion,
    ...(note.context === undefined || note.context.trim() === "" ? {} : { context: note.context.trim() }),
    createdAt: note.createdAt
  }).replaceAll("--", "\\u002d\\u002d");
}

function heading(note: GamePlaytestNote): string {
  const context = note.context?.trim();
  return context === undefined || context === "" ? "### 试玩记录" : `### ${context.replace(/[\r\n]+/g, " ")}`;
}

/**
 * Append one machine-attributed block without rewriting any existing human Markdown.
 * The original file remains a byte-for-byte prefix, so creator-authored prose and
 * unknown sections survive even when the plugin cannot parse them.
 */
export function appendGamePlaytestNote(content: string, note: GamePlaytestNote): string {
  if (!validGamePlaytestNote(note)) throw new TypeError("试玩笔记内容无效。");
  const block = `${START}${metadata(note)} -->\n${heading(note)}\n\n${note.text.trim()}\n${END}${note.id} -->`;
  if (content === "") {
    return `# 试玩笔记\n\n> 这里记录实际试玩时看到的问题；每条记录都保留当时的预览版本。\n\n${block}\n`;
  }
  const separator = content.endsWith("\n\n") ? "---\n\n" : content.endsWith("\n") ? "\n---\n\n" : "\n\n---\n\n";
  return `${content}${separator}${block}\n`;
}

/** Parse only blocks emitted by this plugin; all other Markdown remains human-owned. */
export function parseGamePlaytestNotes(content: string): readonly GamePlaytestNote[] {
  const notes: GamePlaytestNote[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf(START, cursor);
    if (start < 0) break;
    const metadataEnd = content.indexOf(" -->", start + START.length);
    if (metadataEnd < 0) break;
    let raw: unknown;
    try { raw = JSON.parse(content.slice(start + START.length, metadataEnd)); }
    catch { cursor = metadataEnd + 4; continue; }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) { cursor = metadataEnd + 4; continue; }
    const record = raw as Record<string, unknown>;
    const id = boundedText(record.id, 128);
    if (id === undefined || !ID.test(id)) { cursor = metadataEnd + 4; continue; }
    const endMarker = `${END}${id} -->`;
    const end = content.indexOf(endMarker, metadataEnd + 4);
    if (end < 0) { cursor = metadataEnd + 4; continue; }
    const bodyStart = content.indexOf("\n\n", metadataEnd + 4);
    if (bodyStart < 0 || bodyStart >= end) { cursor = end + endMarker.length; continue; }
    const note = {
      id,
      text: content.slice(bodyStart + 2, end).trimEnd(),
      previewVersion: record.previewVersion,
      context: record.context,
      createdAt: record.createdAt
    };
    if (validGamePlaytestNote(note)) notes.push(note);
    cursor = end + endMarker.length;
  }
  return notes;
}

export function gamePlaytestNotesPath(projectRoot: string): string {
  return `${projectRoot}/${GAME_PLAYTEST_NOTES_FILE}`;
}

/** Native DSH write preconditions: create-only first, exact version thereafter. */
export function gamePlaytestNotesWriteIntent(expectedVersion: string | null): FsWriteIntent {
  return expectedVersion === null
    ? { kind: "createIfAbsent" }
    : { kind: "replaceIfVersion", version: expectedVersion as FsVersion };
}
