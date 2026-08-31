import { describe, expect, it } from "vitest";
import { assertCreativePath, mediaMimeTypeForPath, parseByteRange } from "../src/workspace-route.js";

describe("DSH workspace media boundary", () => {
  it("allows previewable media only inside creator-owned workspace roots", () => {
    expect(() => { assertCreativePath("剧集/EP001/制作成果/SHOT-001/job-001.mp4", "media"); }).not.toThrow();
    expect(() => { assertCreativePath("交付/EP001/final.mov", "media"); }).not.toThrow();
    expect(mediaMimeTypeForPath("剧集/EP001/角色板.WEBP")).toBe("image/webp");
    expect(mediaMimeTypeForPath("剧集/EP001/对白.wav")).toBe("audio/wav");
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
    expect(parseByteRange("bytes=1000-", 1_000)).toBeNull();
    expect(parseByteRange("bytes=0-1,3-4", 1_000)).toBeNull();
  });
});
