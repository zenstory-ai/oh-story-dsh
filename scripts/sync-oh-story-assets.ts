import { applyRankBridge } from "./apply-rank-bridge.js";
import { readManifest, synchronizeAssets } from "./knowledge-assets.js";

await synchronizeAssets();
await applyRankBridge();
const manifest = await readManifest();
process.stdout.write(
  `Synced ${manifest.skills.length} skills, ${manifest.roles.length} roles, ${manifest.files.length} files from ${manifest.upstream.commit.slice(0, 12)}.\n`
);
