import { describe, expect, it } from "vitest";
import { assertCreativePath, mediaMimeTypeForPath, parseByteRange } from "../src/workspace-route.js";

describe("DSH workspace media boundary", () => {
  it("lets the novel workbench edit a short story's three root files, publish docs, v0.11 dirs, and multi-book layouts", () => {
    for (const name of [
      "正文.md",
      "设定.md",
      "小节大纲.md",
      "发布资料.md",
      "发布资料-番茄.md",
      "拆文库/样本书/拆文报告.md",
      "扫榜/20261122/选题决策.md",
      "封面/cover.prompt.txt",
      "雪夜渡/正文/第001章.md",
      "雪夜渡/发布资料.md",
      "雪夜渡/发布资料-起点.md",
      "短篇集/正文.md",
      "系列/第一部/正文/第001章.md",
      "a/b/c/d/正文/第001章.md"
    ]) {
      expect(() => { assertCreativePath(name, "text"); }, name).not.toThrow();
    }
    expect(() => { assertCreativePath("a/b/c/d/e/正文/第001章.md", "text"); }).toThrow();
    expect(() => { assertCreativePath("封面/cover.png", "media"); }).not.toThrow();
    expect(() => { assertCreativePath("雪夜渡/封面/cover.png", "media"); }).not.toThrow();
    expect(() => { assertCreativePath("笔记.md", "text"); }).toThrow();
    expect(() => { assertCreativePath("README.md", "text"); }).toThrow();
  });

  it("rejects dot-prefixed segments across all creative roots", () => {
    for (const hidden of [
      "正文/.hidden.md",
      ".env.json",
      "game-adaptations/demo/.env.json",
      "game-adaptations/demo/build/app/.secret",
      "雪夜渡/.story/work/init.json"
    ]) {
      expect(() => { assertCreativePath(hidden, "text"); }, hidden).toThrow();
    }
  });

  it("allows previewable media only inside creator-owned workspace roots", () => {
    expect(() => { assertCreativePath("剧集/EP001/制作成果/SHOT-001/job-001.mp4", "media"); }).not.toThrow();
    expect(() => { assertCreativePath("交付/EP001/final.mov", "media"); }).not.toThrow();
    expect(mediaMimeTypeForPath("剧集/EP001/角色板.WEBP")).toBe("image/webp");
    expect(mediaMimeTypeForPath("剧集/EP001/对白.wav")).toBe("audio/wav");
    for (const [extension, mime] of [["aac", "audio/aac"], ["flac", "audio/flac"]]) {
      const path = `剧集/EP001/制作成果/声音参考/林舟.${extension}`;
      expect(() => { assertCreativePath(path, "media"); }).not.toThrow();
      expect(mediaMimeTypeForPath(path)).toBe(mime);
      expect(() => { assertCreativePath(path, "text"); }).toThrow();
      expect(() => { assertCreativePath(`private/林舟.${extension}`, "media"); }).toThrow();
    }
    expect(() => { assertCreativePath("video-recaps/demo/sources/input.mkv", "media"); }).not.toThrow();
    expect(mediaMimeTypeForPath("video-recaps/demo/sources/input.mkv")).toBe("video/x-matroska");
  });

  it("rejects traversal, external roots and executable or text masquerading as media", () => {
    for (const path of [
      "剧集/EP001/../secret.mp4",
      "/剧集/EP001/output.mp4",
      "private/output.mp4",
      "剧集/EP001/run.sh",
      "剧集/EP001/分镜.md"
    ]) {
      expect(() => { assertCreativePath(path, "media"); }).toThrow();
    }
    expect(mediaMimeTypeForPath("剧集/EP001/run.sh")).toBeUndefined();
  });

  it("parses browser byte ranges without buffering assumptions", () => {
    expect(parseByteRange(undefined, 1_000)).toBeUndefined();
    expect(parseByteRange("bytes=100-199", 1_000)).toEqual({ start: 100, end: 199 });
    expect(parseByteRange("bytes=900-", 1_000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1_000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-4000", 1_000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=100-4000", 1_000)).toEqual({ start: 100, end: 999 });
  });

  it("distinguishes an unsatisfiable range from one this server does not support", () => {
    expect(parseByteRange("bytes=1000-", 1_000)).toBeNull();
    expect(parseByteRange("bytes=-0", 1_000)).toBeNull();
    expect(parseByteRange("bytes=0-", 0)).toBeNull();
    // RFC 9110 14.2: unparseable or unsupported Range headers are ignored, never answered with 416.
    expect(parseByteRange("bytes=0-1,3-4", 1_000)).toBeUndefined();
    expect(parseByteRange("items=0-1", 1_000)).toBeUndefined();
    expect(parseByteRange("bytes=9-4", 1_000)).toBeUndefined();
  });
});
