import assert from "node:assert/strict";
import test from "node:test";

import { declaredDshVersions, dshUpdates, planIssueActions, skillSets, skillUpdate } from "./upstream-updates.mjs";

const videoRecap = skillSets.find((set) => set.key === "video-recap");
const manifest = { upstream: { repository: "https://github.com/zenstory-ai/video-recap-skills.git", commit: "a".repeat(40), releaseVersion: "0.6.1" } };
const release = (tag) => ({ tag_name: tag, html_url: `https://github.com/zenstory-ai/video-recap-skills/releases/tag/${tag}`, published_at: "2026-10-04T00:00:00Z" });
const issue = (number, state, update) => ({ number, state, body: update.body });

test("a skill set is reported only when the latest release has commits the pin lacks", () => {
  assert.equal(skillUpdate(videoRecap, manifest, release("v0.6.1"), "identical"), undefined);
  assert.equal(skillUpdate(videoRecap, manifest, release("v0.6.1"), "behind"), undefined);
  assert.equal(skillUpdate(videoRecap, manifest, release("v0.6.2"), "ahead")?.version, "0.6.2");
  assert.equal(skillUpdate(videoRecap, manifest, release("v0.6.2"), "diverged")?.version, "0.6.2");
});

test("DSH dist-tags on declared versions or range bounds are not updates", () => {
  const declared = declaredDshVersions({
    peerDependencies: { "@deepseek-ai/dsh-agent": ">=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-alpha.1 <0.2.2-0" },
    devDependencies: { "@deepseek-ai/dsh-agent": "0.2.1-alpha.1" },
  });
  assert.deepEqual([...declared].sort(), ["0.2.0-rc.2", "0.2.1-alpha.1"]);
  const updates = dshUpdates({ latest: "0.2.0", next: "0.2.0", alpha: "0.2.1-alpha.1", canary: "0.2.1-0" }, declared);
  assert.deepEqual(updates.map((update) => update.version), ["0.2.0", "0.2.1-0"]);
});

test("each dependency version opens one issue ever, and a newer skill release supersedes the open one", () => {
  const v062 = skillUpdate(videoRecap, manifest, release("v0.6.2"), "ahead");
  const v063 = skillUpdate(videoRecap, manifest, release("v0.6.3"), "ahead");
  const [rc3] = dshUpdates({ latest: "0.2.0-rc.3" }, new Set());
  const [alpha2] = dshUpdates({ alpha: "0.2.1-alpha.2" }, new Set());

  assert.deepEqual(planIssueActions([v062], [issue(7, "open", v062)]), { create: [], supersede: [] });
  assert.deepEqual(planIssueActions([v062], [issue(7, "closed", v062)]), { create: [], supersede: [] });

  const plan = planIssueActions([v063, rc3], [issue(7, "open", v062), issue(8, "open", alpha2), issue(9, "closed", { body: "" })]);
  assert.deepEqual(plan.create, [v063, rc3]);
  // DSH dist-tags are parallel lines, so a new rc does not close the open alpha issue.
  assert.deepEqual(plan.supersede, [{ number: 7, by: v063 }]);
});
