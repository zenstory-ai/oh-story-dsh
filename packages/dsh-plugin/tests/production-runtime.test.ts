import { describe, expect, it } from "vitest";
import {
  activeProductionJobId,
  createPendingJob,
  mediaTargetFromPath,
  mediaVersionMatchesJob,
  queuedItemForJob,
  reconcileProductionJobs,
  reconcileSequence,
  reorderSequence,
  sequenceIssues,
  type ProductionMediaVersion
} from "../src/client/production-runtime.js";

describe("production runtime", () => {
  it("creates a DSH-session production job without owning a second runtime", () => {
    const pending = createPendingJob({ id: "local-1", targetId: "SHOT-EP001-001", kind: "video", prompt: "动作" });
    expect(pending).toMatchObject({ id: "local-1", targetId: "SHOT-EP001-001", kind: "video", status: "pending", progress: 0, expectedOutputs: 1, completedOutputs: 0 });
    expect(pending).not.toHaveProperty("remoteTaskId");
  });

  it("distinguishes an exact DSH queue item from the current running turn", () => {
    const running = createPendingJob({ id: "job-running", targetId: "SHOT-001", kind: "image", prompt: "a" });
    const queued = createPendingJob({ id: "job-queued", targetId: "SHOT-002", kind: "video", prompt: "b" });
    const queue = [{ id: "message-1", preview: "/short-drama-produce 任务 ID：job-queued" }];

    expect(queuedItemForJob(queued.id, queue)?.id).toBe("message-1");
    expect(activeProductionJobId([running, queued], queue, true)).toBe("job-running");
    expect(activeProductionJobId([running, queued], queue, false)).toBeUndefined();
  });

  it("associates media through exact path tokens instead of substring guesses", () => {
    expect(mediaTargetFromPath("剧集/EP001/制作成果/SHOT-EP001-010/result.mp4", ["SHOT-EP001-001", "SHOT-EP001-010"])).toBe("SHOT-EP001-010");
    expect(mediaTargetFromPath("剧集/EP001/制作成果/misc/SHOT-EP001-0100-result.mp4", ["SHOT-EP001-010"])).toBeUndefined();
    const version = { id: "opaque", targetId: "SHOT-001", kind: "video" as const, url: "/media", path: "剧集/EP001/SHOT-001-job-10.mp4" };
    expect(mediaVersionMatchesJob(version, "job-10")).toBe(true);
    expect(mediaVersionMatchesJob(version, "job-1")).toBe(false);
  });

  it("reconciles and reorders the delivery sequence while reporting missing shots", () => {
    const versions: ProductionMediaVersion[] = [{
      id: "image-v1", targetId: "SHOT-EP001-001", kind: "image", url: "/oh-story/media", path: "剧集/EP001/制作成果/1.png"
    }, {
      id: "video-v1", targetId: "SHOT-EP001-001", kind: "video", url: "/oh-story/media", path: "剧集/EP001/制作成果/1.mp4"
    }];
    const sequence = reconcileSequence(["SHOT-EP001-001", "SHOT-EP001-002"], [], versions, { "SHOT-EP001-001": "image-v1" });
    expect(sequence[0]?.versionId).toBe("video-v1");
    expect(sequence.map((item) => item.shotId)).toEqual(["SHOT-EP001-001", "SHOT-EP001-002"]);
    expect(sequenceIssues(sequence, versions)).toEqual(["SHOT-EP001-002 缺少已选视频版本"]);
    expect(reorderSequence(sequence, "SHOT-EP001-002", "SHOT-EP001-001").map((item) => item.shotId)).toEqual(["SHOT-EP001-002", "SHOT-EP001-001"]);
  });

  it("does not turn an ended paid dispatch into an automatically retryable failure", () => {
    const running = { ...createPendingJob({ id: "paid-1", targetId: "SHOT-001", kind: "video", prompt: "p", expectedOutputs: 2 }), status: "running" as const };
    const unknown = reconcileProductionJobs([running], [], false, [])[0]!;
    expect(unknown).toMatchObject({
      status: "dispatched_unknown",
      error: expect.stringContaining("避免重复计费")
    });
    const partial = { id: "workspace:paid-1.mp4", targetId: "SHOT-001", kind: "video" as const, url: "/media", path: "paid-1.mp4" };
    expect(reconcileProductionJobs([unknown], [], false, [partial])[0]).toMatchObject({
      status: "dispatched_unknown",
      completedOutputs: 1,
      error: expect.stringContaining("已发现 1/2")
    });
  });

  it("keeps a prepared job awaiting explicit confirmation until the Agent tracks its dispatch", () => {
    const prepared = {
      ...createPendingJob({ id: "prepare-1", targetId: "SHOT-001", kind: "image", prompt: "p" }),
      status: "awaiting_confirmation" as const
    };
    expect(reconcileProductionJobs([prepared], [], false, [])[0]).toEqual(prepared);
    expect(activeProductionJobId([prepared], [], true)).toBe("prepare-1");
  });
});
