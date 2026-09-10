import { describe, expect, it } from "vitest";
import {
  activeProductionJobId,
  compositionInFlight,
  createPendingJob,
  mediaTargetFromPath,
  mediaVersionMatchesJob,
  queuedItemForJob,
  reconcileProductionJobs,
  reconcileSequence,
  reorderSequence,
  sequenceIssues,
  type ProductionJob,
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

  it("completes an assembly job on the newly rendered cut rather than a stale one", () => {
    const cutPath = "剧集/EP001/制作成果/成片/成片.mp4";
    const stale: ProductionMediaVersion = { id: `workspace:${cutPath}:3`, targetId: "剧集/EP001", kind: "video", url: "/media/old", path: cutPath };
    const job = createPendingJob({
      id: "compose-1",
      targetId: "剧集/EP001",
      kind: "composition",
      prompt: "按成片顺序合成",
      outputPath: cutPath,
      supersededOutputIds: [stale.id]
    });

    // short-drama-edit names the cut, not the workbench, so the job id never reaches the filename.
    expect(mediaVersionMatchesJob(stale, job.id)).toBe(false);
    const beforeRender = reconcileProductionJobs([{ ...job, status: "running" }], [], true, [stale]);
    expect(beforeRender[0]).toMatchObject({ status: "running", completedOutputs: 0 });

    const rendered: ProductionMediaVersion = { ...stale, id: `workspace:${cutPath}:4`, url: "/media/new" };
    const afterRender = reconcileProductionJobs([{ ...job, status: "running" }], [], true, [rendered]);
    expect(afterRender[0]).toMatchObject({ status: "succeeded", progress: 100, completedOutputs: 1 });
    expect(afterRender[0]?.output?.id).toBe(rendered.id);
  });

  it("never lets a later cut revive an assembly job the creator canceled or that failed", () => {
    const cutPath = "剧集/EP001/制作成果/成片/成片.mp4";
    const assembly = (id: string) => createPendingJob({
      id, targetId: "剧集/EP001", kind: "composition", prompt: "按成片顺序合成", outputPath: cutPath, supersededOutputIds: []
    });
    // Every composition renders to this one upstream path, so the cut carries no job identity.
    const cut: ProductionMediaVersion = { id: `workspace:${cutPath}:1`, targetId: "剧集/EP001", kind: "video", url: "/media/new", path: cutPath };

    const canceled = reconcileProductionJobs([{ ...assembly("compose-canceled"), status: "canceled" }], [], true, [cut]);
    expect(canceled[0]).toMatchObject({ status: "canceled", progress: 0 });

    const failed = reconcileProductionJobs(
      [{ ...assembly("compose-failed"), status: "failed", error: "CUT-EP001-002 的素材不存在" }], [], true, [cut]
    );
    expect(failed[0]).toMatchObject({ status: "failed", error: "CUT-EP001-002 的素材不存在" });

    // A job keyed on its own id keeps the old behaviour: that output really is its own.
    const legacy = createPendingJob({ id: "compose-legacy", targetId: "剧集/EP001", kind: "composition", prompt: "合成" });
    const legacyCut: ProductionMediaVersion = {
      id: "workspace:legacy:1", targetId: "剧集/EP001", kind: "video", url: "/media", path: "剧集/EP001/制作成果/成片-compose-legacy.mp4"
    };
    expect(reconcileProductionJobs([{ ...legacy, status: "failed" }], [], true, [legacyCut])[0]).toMatchObject({ status: "succeeded" });
  });

  it("keeps a succeeded assembly job pinned to the cut it produced", () => {
    const cutPath = "剧集/EP001/制作成果/成片/成片.mp4";
    const first: ProductionMediaVersion = { id: `workspace:${cutPath}:1`, targetId: "剧集/EP001", kind: "video", url: "/media/1", path: cutPath };
    const job = {
      ...createPendingJob({ id: "compose-1", targetId: "剧集/EP001", kind: "composition", prompt: "合成", outputPath: cutPath, supersededOutputIds: [] }),
      status: "succeeded" as const, output: first, completedOutputs: 1, progress: 100
    };
    const second: ProductionMediaVersion = { ...first, id: `workspace:${cutPath}:2`, url: "/media/2" };
    expect(reconcileProductionJobs([job], [], true, [second])[0]?.output?.id).toBe(first.id);
  });

  it("reports an unsettled composition so a second one cannot claim the same cut", () => {
    const assembly = (id: string, status: ProductionJob["status"]) => ({
      ...createPendingJob({ id, targetId: "剧集/EP001", kind: "composition", prompt: "合成" }), status
    });
    expect(compositionInFlight([])).toBe(false);
    expect(compositionInFlight([assembly("a", "running")])).toBe(true);
    expect(compositionInFlight([assembly("a", "pending")])).toBe(true);
    expect(compositionInFlight([assembly("a", "awaiting_confirmation")])).toBe(true);
    // Settled either way, so re-composing is the creator's call again.
    expect(compositionInFlight([assembly("a", "succeeded"), assembly("b", "canceled"), assembly("c", "failed")])).toBe(false);
    // Per-shot work never blocks assembly.
    expect(compositionInFlight([{ ...assembly("a", "running"), kind: "video" }])).toBe(false);
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
    expect(reorderSequence(sequence, 1, 0).map((item) => item.shotId)).toEqual(["SHOT-EP001-002", "SHOT-EP001-001"]);
    expect(reorderSequence(sequence, 0, 9).map((item) => item.shotId)).toEqual(["SHOT-EP001-001", "SHOT-EP001-002"]);
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

describe("paid-job reconciliation regressions", () => {
  it("does not mark a job queued because another job's prompt quotes its id", () => {
    const queue = [{ id: "q1", preview: "合成成片 任务 ID：compose-9 顺序：剧集/EP001/制作成果/paid-1-001.mp4" }];
    expect(queuedItemForJob("paid-1", queue)).toBeUndefined();
    expect(queuedItemForJob("compose-9", queue)?.id).toBe("q1");
  });

  it("clears the end-of-turn billing warning once outputs start landing", () => {
    const stale = {
      ...createPendingJob({ id: "paid-2", targetId: "SHOT-001", kind: "video", prompt: "p", expectedOutputs: 2 }),
      status: "dispatched_unknown" as const,
      error: "DSH Turn 已结束，尚未发现关联成果。"
    };
    const versions: ProductionMediaVersion[] = [{
      id: "v1", targetId: "SHOT-001", kind: "video", url: "/oh-story/media", path: "剧集/EP001/制作成果/paid-2-001.mp4"
    }];
    const next = reconcileProductionJobs([stale], [], true, versions)[0]!;
    expect(next.status).toBe("running");
    expect(next.completedOutputs).toBe(1);
    expect(next.error).toBeUndefined();
  });
});

