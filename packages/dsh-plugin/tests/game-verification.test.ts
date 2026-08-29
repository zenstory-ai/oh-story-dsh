import { describe, expect, it } from "vitest";
import { WorkspaceVerificationTracker } from "../src/game-verification.js";

describe("workspace game QA freshness", () => {
  it("does not pretend an imported QA record is bound to the current preview", () => {
    const tracker = new WorkspaceVerificationTracker();
    expect(tracker.observe("session:game", "qa-v1", "build-v1")).toEqual({ binding: "UNBOUND" });
    expect(tracker.observe("session:game", "qa-v1", "build-v2")).toEqual({ binding: "UNBOUND" });
  });

  it("binds a QA rewrite and marks later preview changes stale", () => {
    const tracker = new WorkspaceVerificationTracker();
    expect(tracker.observe("session:game", undefined, "build-v1")).toEqual({ binding: "UNBOUND" });
    expect(tracker.observe("session:game", "qa-v1", "build-v1")).toEqual({
      binding: "CURRENT",
      verifiedPreviewVersion: "build-v1"
    });
    expect(tracker.observe("session:game", "qa-v1", "build-v2")).toEqual({
      binding: "STALE",
      verifiedPreviewVersion: "build-v1"
    });
    expect(tracker.observe("session:game", "qa-v2", "build-v2")).toEqual({
      binding: "CURRENT",
      verifiedPreviewVersion: "build-v2"
    });
  });
});
