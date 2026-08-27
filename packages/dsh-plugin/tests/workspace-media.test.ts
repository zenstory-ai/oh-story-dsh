import { describe, expect, it } from "vitest";
import { assertCreativePath, mediaMimeTypeForPath } from "../src/workspace-route.js";

describe("DSH workspace media boundary", () => {
  it("allows previewable media only inside creator-owned workspace roots", () => {
    expect(() => { assertCreativePath("剧集/EP001/制作成果/SHOT-001/job-001.mp4", "media"); }).not.toThrow();
    expect(() => { assertCreativePath("交付/EP001/final.mov", "media"); }).not.toThrow();
    expect(mediaMimeTypeForPath("剧集/EP001/角色板.WEBP")).toBe("image/webp");
    expect(mediaMimeTypeForPath("剧集/EP001/对白.wav")).toBe("audio/wav");
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
});
