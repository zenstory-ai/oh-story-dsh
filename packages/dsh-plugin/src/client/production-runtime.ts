export type ProductionJobKind = "image" | "video" | "composition";
export type ProductionJobStatus = "awaiting_confirmation" | "pending" | "running" | "dispatched_unknown" | "succeeded" | "failed" | "canceled";

export interface ProductionMediaVersion {
  readonly id: string;
  readonly targetId: string;
  readonly kind: "image" | "video";
  readonly url: string;
  /** Workspace-relative path when the result is owned by the DSH FileSystem. */
  readonly path?: string | undefined;
}

export interface ProductionJob {
  readonly id: string;
  readonly targetId: string;
  readonly kind: ProductionJobKind;
  readonly status: ProductionJobStatus;
  readonly progress: number;
  readonly prompt: string;
  readonly error?: string | undefined;
  readonly output?: ProductionMediaVersion | undefined;
  readonly expectedOutputs: number;
  readonly completedOutputs: number;
}

export interface ProductionSequenceItem {
  readonly shotId: string;
  readonly versionId?: string | undefined;
}

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProductionQueueEntry {
  readonly id: string;
  readonly preview: string;
}

export function createPendingJob(input: {
  readonly id: string;
  readonly targetId: string;
  readonly kind: ProductionJobKind;
  readonly prompt: string;
  readonly expectedOutputs?: number | undefined;
}): ProductionJob {
  return {
    id: input.id,
    targetId: input.targetId,
    kind: input.kind,
    status: "pending",
    progress: 0,
    prompt: input.prompt,
    expectedOutputs: Math.max(1, Math.floor(input.expectedOutputs ?? 1)),
    completedOutputs: 0
  };
}

export function selectedVersionForTarget(
  targetId: string,
  versions: readonly ProductionMediaVersion[],
  selections: Readonly<Record<string, string>>,
  kind?: ProductionMediaVersion["kind"]
): ProductionMediaVersion | undefined {
  const candidates = versions.filter((version) => version.targetId === targetId && (kind === undefined || version.kind === kind));
  return candidates.find((version) => version.id === selections[targetId]) ?? candidates.at(-1);
}

export function mediaTargetFromPath(path: string, knownTargets: readonly string[]): string | undefined {
  const upper = path.toLocaleUpperCase();
  const segments = upper.split("/");
  const filename = segments.at(-1) ?? "";
  return [...knownTargets].sort((left, right) => right.length - left.length).find((target) => {
    const canonical = target.toLocaleUpperCase();
    return segments.includes(canonical)
      || filename === canonical
      || filename.startsWith(`${canonical}.`)
      || filename.startsWith(`${canonical}-`);
  });
}

export function mediaVersionMatchesJob(version: ProductionMediaVersion, jobId: string): boolean {
  if (version.path === undefined || jobId.trim() === "") return false;
  const escaped = jobId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const basename = version.path.split("/").at(-1) ?? "";
  return new RegExp(`(?:^|[-_.])${escaped}(?:[-_.]|$)`, "u").test(basename);
}

export function referencesForTarget(
  targetId: string,
  production: { readonly shots: readonly { readonly id: string; readonly references: readonly string[] }[] },
  versions: readonly ProductionMediaVersion[],
  selections: Readonly<Record<string, string>>,
  libraryVersions: readonly ProductionMediaVersion[] = versions,
  manualReferences: Readonly<Record<string, readonly string[]>> = {}
): ProductionMediaVersion[] {
  const shot = production.shots.find((item) => item.id === targetId);
  if (shot === undefined) return [];
  const declared = shot.references.flatMap((id) => {
    const version = selectedVersionForTarget(id, versions, selections, "image");
    return version === undefined ? [] : [version];
  });
  const manual = (manualReferences[targetId] ?? []).flatMap((id) => {
    const version = libraryVersions.find((item) => item.id === id && item.kind === "image");
    return version === undefined ? [] : [version];
  });
  return [...new Map([...declared, ...manual].map((version) => [version.id, version])).values()];
}

export function queuedItemForJob(jobId: string, queue: readonly ProductionQueueEntry[]): ProductionQueueEntry | undefined {
  if (jobId.trim() === "") return undefined;
  const escaped = jobId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  // The prompts label the id as 「任务 ID：<id>」 / 「批次任务 ID：<id>」. Anchor on that label so an
  // id merely quoted inside another job's output paths cannot mark this job as queued.
  const labelled = new RegExp(`任务\\s*ID\\s*[：:]\\s*${escaped}(?:[\\s.,;、。]|$)`, "u");
  return queue.find((item) => labelled.test(item.preview));
}

export function activeProductionJobId(
  jobs: readonly ProductionJob[],
  queue: readonly ProductionQueueEntry[],
  sessionRunning: boolean
): string | undefined {
  if (!sessionRunning) return undefined;
  return [...jobs].reverse().find((job) => (
    (job.status === "awaiting_confirmation" || job.status === "pending" || job.status === "running")
    && queuedItemForJob(job.id, queue) === undefined
  ))?.id;
}

/** Reconcile the lightweight Session projection against DSH Queue/Turn state and real workspace outputs. */
export function reconcileProductionJobs(
  jobs: readonly ProductionJob[],
  queue: readonly ProductionQueueEntry[],
  sessionRunning: boolean,
  versions: readonly ProductionMediaVersion[]
): ProductionJob[] {
  const latestPending = [...jobs].reverse().find((job) => (
    job.status === "pending" && queuedItemForJob(job.id, queue) === undefined
  ));

  return jobs.map((job) => {
    const queued = queuedItemForJob(job.id, queue) !== undefined;
    const outputs = versions.filter((version) => mediaVersionMatchesJob(version, job.id));

    if (outputs.length >= job.expectedOutputs) {
      return {
        ...job,
        status: "succeeded",
        progress: 100,
        completedOutputs: outputs.length,
        output: outputs[0],
        error: undefined
      };
    }
    if (job.status === "canceled" || job.status === "succeeded" || (job.status === "awaiting_confirmation" && outputs.length === 0)) return job;
    if (job.status === "running" && queued) return { ...job, status: "pending", progress: 0 };
    if (job.status === "pending" && sessionRunning && !queued && job === latestPending) {
      return { ...job, status: "running", progress: Math.max(10, job.progress), error: undefined };
    }
    if (!sessionRunning && !queued && (job.status === "running" || job.status === "dispatched_unknown")) {
      return {
        ...job,
        status: "dispatched_unknown",
        progress: Math.round(outputs.length / job.expectedOutputs * 100),
        completedOutputs: outputs.length,
        error: outputs.length === 0
          ? "DSH Turn 已结束，尚未发现关联成果。任务可能已派发，请先刷新成果，避免重复计费。"
          : `DSH Turn 已结束，已发现 ${String(outputs.length)}/${String(job.expectedOutputs)} 项成果；请刷新核对剩余输出。`
      };
    }
    if (outputs.length > 0) {
      return {
        ...job,
        status: job.status === "failed" ? "failed" : "running",
        progress: Math.max(10, Math.round(outputs.length / job.expectedOutputs * 100)),
        completedOutputs: outputs.length,
        error: job.status === "failed" ? job.error : undefined
      };
    }
    return job;
  });
}

export function reconcileSequence(
  shotIds: readonly string[],
  current: readonly ProductionSequenceItem[],
  versions: readonly ProductionMediaVersion[],
  selections: Readonly<Record<string, string>>
): ProductionSequenceItem[] {
  const shotSet = new Set(shotIds);
  const preserved = current.filter((item) => shotSet.has(item.shotId));
  const present = new Set(preserved.map((item) => item.shotId));
  const appended = shotIds.filter((shotId) => !present.has(shotId)).map((shotId) => ({ shotId }));
  return [...preserved, ...appended].map((item) => ({
    shotId: item.shotId,
    versionId: selectedVersionForTarget(item.shotId, versions, selections, "video")?.id
  }));
}

export function sequenceIssues(sequence: readonly ProductionSequenceItem[], versions: readonly ProductionMediaVersion[]): string[] {
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const issues: string[] = [];
  for (const item of sequence) {
    const version = item.versionId === undefined ? undefined : versionById.get(item.versionId);
    if (version === undefined || version.kind !== "video") issues.push(`${item.shotId} 缺少已选视频版本`);
    else if (version.path === undefined) issues.push(`${item.shotId} 的视频没有可供 DSH 读取的工作区路径`);
  }
  return issues;
}

export function reorderSequence(sequence: readonly ProductionSequenceItem[], source: number, target: number): ProductionSequenceItem[] {
  if (!Number.isInteger(source) || !Number.isInteger(target)) return [...sequence];
  if (source < 0 || target < 0 || source >= sequence.length || target >= sequence.length || source === target) return [...sequence];
  const next = [...sequence];
  const [item] = next.splice(source, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}
