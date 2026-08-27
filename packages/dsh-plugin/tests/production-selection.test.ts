import { describe, expect, it } from "vitest";
import {
  reconcileSequence,
  selectedVersionForTarget,
  selectionKey,
  type ProductionMediaVersion
} from "../src/client/production-runtime.js";

const SHOT = "SHOT-EP001-001";
const versions: readonly ProductionMediaVersion[] = [
  { id: "img-v1", targetId: SHOT, kind: "image", url: "/m/img1", path: "剧集/EP001/制作成果/img1.png" },
  { id: "img-v2", targetId: SHOT, kind: "image", url: "/m/img2", path: "剧集/EP001/制作成果/img2.png" },
  { id: "vid-v1", targetId: SHOT, kind: "video", url: "/m/vid1", path: "剧集/EP001/制作成果/vid1.mp4" },
  { id: "vid-v2", targetId: SHOT, kind: "video", url: "/m/vid2", path: "剧集/EP001/制作成果/vid2.mp4" }
];

describe("per-kind production version selection", () => {
  it("keeps an image pick and a video pick for the same shot at once", () => {
    // Both picks are deliberately the non-default (not last) version, so a
    // shared slot would be visible as one of them falling back.
    const selections = {
      [selectionKey(SHOT, "image")]: "img-v1",
      [selectionKey(SHOT, "video")]: "vid-v1"
    };
    expect(selectedVersionForTarget(SHOT, versions, selections, "image")?.id).toBe("img-v1");
    expect(selectedVersionForTarget(SHOT, versions, selections, "video")?.id).toBe("vid-v1");
  });

  it("does not let choosing a keyframe change which video the final cut uses", () => {
    const before = { [selectionKey(SHOT, "video")]: "vid-v1" };
    const after = { ...before, [selectionKey(SHOT, "image")]: "img-v1" };
    expect(selectedVersionForTarget(SHOT, versions, after, "video")?.id).toBe("vid-v1");
    expect(reconcileSequence([SHOT], [], versions, after)).toEqual([{ shotId: SHOT, versionId: "vid-v1" }]);
  });

  it("falls back to the newest version of each kind when nothing is picked", () => {
    expect(selectedVersionForTarget(SHOT, versions, {}, "image")?.id).toBe("img-v2");
    expect(selectedVersionForTarget(SHOT, versions, {}, "video")?.id).toBe("vid-v2");
  });

  it("scopes selection keys per target so two shots never share a slot", () => {
    expect(selectionKey(SHOT, "image")).not.toBe(selectionKey(SHOT, "video"));
    expect(selectionKey("SHOT-A", "image")).not.toBe(selectionKey("SHOT-B", "image"));
  });
});
