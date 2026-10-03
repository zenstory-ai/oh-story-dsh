import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  classifyHttpStatus,
  createReleaseManifest,
  npmPublicationDecision,
  selectCiProof,
  validateReleaseMetadata,
  verifyFinalCiSnapshot,
  verifyIndependentFileDigests,
  verifyPublisherSourceIdentity,
  verifyPromotionProof,
  verifyReleaseManifest,
} from "./release.mjs";

const requiredJobs = [
  "Quality gate",
  "Portability (macos-latest)",
  "Portability (windows-latest)",
  "Packaged DSH Web integration",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("release metadata requires a stable tag, matching versions, and a dated changelog heading", () => {
  assert.deepEqual(
    validateReleaseMetadata({
      tag: "v1.2.3",
      rootVersion: "1.2.3",
      packageVersion: "1.2.3",
      changelog: "## [Unreleased]\n\n## [1.2.3] - 2026-10-03\n",
    }),
    { version: "1.2.3", tag: "v1.2.3" },
  );

  for (const tag of ["1.2.3", "v1.2", "v1.2.3-rc.1", "v01.2.3", "v1.2.3+build"]) {
    assert.throws(
      () =>
        validateReleaseMetadata({
          tag,
          rootVersion: "1.2.3",
          packageVersion: "1.2.3",
          changelog: "## [1.2.3] - 2026-10-03\n",
        }),
      /stable release tag/,
    );
  }

  assert.throws(
    () =>
      validateReleaseMetadata({
        tag: "v1.2.3",
        rootVersion: "1.2.3",
        packageVersion: "1.2.4",
        changelog: "## [1.2.3] - 2026-10-03\n",
      }),
    /version mismatch/,
  );
  assert.throws(
    () =>
      validateReleaseMetadata({
        tag: "v1.2.3",
        rootVersion: "1.2.3",
        packageVersion: "1.2.3",
        changelog: "## [Unreleased]\n",
      }),
    /dated changelog heading/,
  );
});

test("changelog headings use literal versions, not a generated regex", () => {
  for (const heading of ["## [1x2x3] - 2026-10-03", "## [11.2.3] - 2026-10-03", "### [1.2.3] - 2026-10-03"]) {
    assert.throws(
      () => validateReleaseMetadata({ tag: "v1.2.3", rootVersion: "1.2.3", packageVersion: "1.2.3", changelog: heading }),
      /dated changelog/,
    );
  }
  assert.throws(
    () =>
      validateReleaseMetadata({
        tag: "v1.2.3\n",
        rootVersion: "1.2.3\n",
        packageVersion: "1.2.3\n",
        changelog: "## [1.2.3\n] - 2026-10-03",
      }),
    /stable release tag/,
  );
});

test("CI proof selects the newest exact-SHA main push attempt and rejects stale success", () => {
  const input = {
    sourceSha: "a".repeat(40),
    workflowId: 123,
    workflowPath: ".github/workflows/ci.yml",
    runs: [
      {
        id: 90,
        run_attempt: 1,
        head_sha: "a".repeat(40),
        head_branch: "main",
        event: "push",
        status: "completed",
        conclusion: "success",
        workflow_id: 123,
        path: ".github/workflows/ci.yml",
        check_suite_id: 44,
      },
      {
        id: 91,
        run_attempt: 2,
        head_sha: "a".repeat(40),
        head_branch: "main",
        event: "push",
        status: "completed",
        conclusion: "failure",
        workflow_id: 123,
        path: ".github/workflows/ci.yml",
        check_suite_id: 45,
      },
    ],
    jobs: requiredJobs.map((name) => ({ name, status: "completed", conclusion: "success" })),
    checkSuite: { id: 44, head_sha: "a".repeat(40), status: "completed", conclusion: "success", app: { id: 15368 } },
    requiredJobs,
  };
  assert.throws(() => selectCiProof(input), /newest exact-SHA CI run did not succeed/);
  const proof = selectCiProof({ ...input, runs: input.runs.slice(0, 1) });
  assert.equal(proof.runId, 90);
});

test("CI proof requires every configured job and the GitHub Actions app", () => {
  const base = {
    sourceSha: "b".repeat(40),
    workflowId: 123,
    workflowPath: ".github/workflows/ci.yml",
    runs: [
      {
        id: 100,
        run_attempt: 3,
        head_sha: "b".repeat(40),
        head_branch: "main",
        event: "push",
        status: "completed",
        conclusion: "success",
        workflow_id: 123,
        path: ".github/workflows/ci.yml",
        check_suite_id: 55,
      },
    ],
    jobs: requiredJobs.map((name) => ({ name, status: "completed", conclusion: "success" })),
    checkSuite: { id: 55, head_sha: "b".repeat(40), status: "completed", conclusion: "success", app: { id: 15368 } },
    requiredJobs,
  };
  assert.equal(selectCiProof(base).runAttempt, 3);
  assert.throws(
    () => selectCiProof({ ...base, jobs: base.jobs.slice(1) }),
    /missing required CI job/,
  );
  assert.throws(
    () => selectCiProof({ ...base, checkSuite: { ...base.checkSuite, app: { id: 1 } } }),
    /unexpected check-suite app/,
  );
});

test("CI proof binds the suite and rejects an attempt N+1 race", () => {
  const sourceSha = "9".repeat(40);
  const run = {
    id: 120,
    run_attempt: 1,
    head_sha: sourceSha,
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    workflow_id: 123,
    path: ".github/workflows/ci.yml",
    check_suite_id: 77,
  };
  const suite = { id: 77, head_sha: sourceSha, status: "completed", conclusion: "success", app: { id: 15368 } };
  assert.throws(
    () =>
      selectCiProof({
        sourceSha,
        workflowId: 123,
        workflowPath: ".github/workflows/ci.yml",
        runs: [run],
        jobs: requiredJobs.map((name) => ({ name, status: "completed", conclusion: "success" })),
        checkSuite: { ...suite, head_sha: "8".repeat(40) },
        requiredJobs,
      }),
    /check-suite source SHA/,
  );
  assert.throws(
    () =>
      verifyFinalCiSnapshot({
        selectedRun: run,
        refetchedRun: { ...run, run_attempt: 2, status: "in_progress", conclusion: null },
        sourceSha,
        workflowId: 123,
        workflowPath: ".github/workflows/ci.yml",
      }),
    /run attempt changed/,
  );
});

test("npm writer source gate rejects a moved tag and noncanonical repository", () => {
  const sourceSha = "7".repeat(40);
  const valid = {
    repository: "zenstory-ai/oh-story-dsh",
    repositoryMetadata: { full_name: "zenstory-ai/oh-story-dsh", private: false, default_branch: "main" },
    mainBranch: { name: "main", protected: true },
    sourceSha,
    remoteTagSha: sourceSha,
  };
  assert.doesNotThrow(() => verifyPublisherSourceIdentity(valid));
  assert.throws(
    () => verifyPublisherSourceIdentity({ ...valid, remoteTagSha: "6".repeat(40) }),
    /remote tag moved/,
  );
  assert.throws(
    () => verifyPublisherSourceIdentity({ ...valid, repositoryMetadata: { ...valid.repositoryMetadata, private: true } }),
    /public repository/,
  );
});

test("consumer rejects coordinated manifest and proof substitution using producer digests", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsh-release-digests-"));
  const files = {
    manifest: path.join(directory, "RELEASE-MANIFEST.json"),
    promotionProof: path.join(directory, "PROMOTION-PROOF.json"),
    ciProof: path.join(directory, "ci-proof.json"),
  };
  await writeFile(files.manifest, '{"source":"original"}\n');
  await writeFile(files.promotionProof, '{"manifest":"original"}\n');
  await writeFile(files.ciProof, '{"run":1}\n');
  const expected = {
    manifest: sha256('{"source":"original"}\n'),
    promotionProof: sha256('{"manifest":"original"}\n'),
    ciProof: sha256('{"run":1}\n'),
  };
  await verifyIndependentFileDigests({ files, expected });
  await writeFile(files.manifest, '{"source":"substituted"}\n');
  await writeFile(files.promotionProof, '{"manifest":"substituted"}\n');
  await assert.rejects(verifyIndependentFileDigests({ files, expected }), /producer digest mismatch/);
});

test("manifest binds bytes, source, run attempt, and expected package entries", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsh-release-test-"));
  const tarball = path.join(directory, "oh-story-dsh-1.2.3.tgz");
  await writeFile(tarball, "immutable tarball bytes");
  const manifest = await createReleaseManifest({
    tarball,
    sourceSha: "c".repeat(40),
    version: "1.2.3",
  });
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.files[0].integrity, /^sha512-/);
  await verifyReleaseManifest({ manifest, directory, expectedSourceSha: "c".repeat(40) });
  await writeFile(tarball, "different bytes");
  await assert.rejects(
    verifyReleaseManifest({ manifest, directory, expectedSourceSha: "c".repeat(40) }),
    /SHA-256 mismatch/,
  );
  await assert.rejects(
    verifyReleaseManifest({ manifest, directory, expectedSourceSha: "d".repeat(40) }),
    /source SHA mismatch/,
  );
});

test("promotion proof carries run identity outside deterministic public bytes", () => {
  const proof = {
    schemaVersion: 1,
    sourceSha: "e".repeat(40),
    manifestSha256: "f".repeat(64),
    runId: 42,
    runAttempt: 2,
    artifactName: "oh-story-dsh-v1.2.3-42-2",
  };
  assert.doesNotThrow(() =>
    verifyPromotionProof({
      proof,
      manifestSha256: "f".repeat(64),
      sourceSha: "e".repeat(40),
      runId: "42",
      runAttempt: "2",
      artifactName: "oh-story-dsh-v1.2.3-42-2",
    }),
  );
  assert.throws(
    () =>
      verifyPromotionProof({
        proof,
        manifestSha256: "0".repeat(64),
        sourceSha: "e".repeat(40),
        runId: "42",
        runAttempt: "2",
        artifactName: "oh-story-dsh-v1.2.3-42-2",
      }),
    /manifest digest mismatch/,
  );
});

test("HTTP lookup distinguishes absence from authorization, throttling, server, and network errors", () => {
  assert.equal(classifyHttpStatus(404), "missing");
  assert.equal(classifyHttpStatus(200), "ok");
  for (const status of [401, 403, 429, 500, 503]) {
    assert.equal(classifyHttpStatus(status), "error");
  }
});

test("npm idempotency only accepts the exact local integrity", () => {
  assert.equal(npmPublicationDecision({ status: 404, remoteIntegrity: null, localIntegrity: "sha512-a" }), "publish");
  assert.equal(
    npmPublicationDecision({ status: 200, remoteIntegrity: "sha512-a", localIntegrity: "sha512-a" }),
    "skip-exact",
  );
  assert.throws(
    () => npmPublicationDecision({ status: 200, remoteIntegrity: "sha512-b", localIntegrity: "sha512-a" }),
    /different bytes/,
  );
  assert.throws(
    () => npmPublicationDecision({ status: 401, remoteIntegrity: null, localIntegrity: "sha512-a" }),
    /registry lookup failed/,
  );
});

test("all local actions are immutable and the release workflow has isolated publishers", async () => {
  for (const workflow of ["ci.yml", "real-provider.yml", "release.yml"]) {
    const source = await readFile(path.join(".github", "workflows", workflow), "utf8");
    for (const match of source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) {
      assert.match(match[1], /@[a-f0-9]{40}$/i, `${workflow}: ${match[1]} is not full-SHA pinned`);
    }
  }
  const release = await readFile(path.join(".github", "workflows", "release.yml"), "utf8");
  assert.doesNotMatch(release, /--clobber/);
  assert.match(release, /github-release:[\s\S]*contents: write/);
  assert.match(release, /npm:[\s\S]*id-token: write/);
  assert.match(release, /artifact-ids: \$\{\{ needs\.verify\.outputs\.artifact-id \}\}/);
  assert.match(release, /manifest-sha256: \$\{\{ steps\.digests\.outputs\.manifest-sha256 \}\}/);
  assert.match(release, /npm-publish[^\n]+--repository "\$GITHUB_REPOSITORY" --tag "\$GITHUB_REF_NAME"/);
  assert.match(release, /persist-credentials: false/);
  assert.match(release, /EVENT_NAME.*workflow_dispatch[\s\S]*refs\/heads\/main/);
});
