import { applyStoryCraft } from "./apply-story-craft.js";
import { refreshBundledManifest, synchronizeAssets } from "./knowledge-assets.js";

await synchronizeAssets();
await applyStoryCraft();
const manifest = await refreshBundledManifest();
process.stdout.write(
  `Synced ${manifest.skills.length} skills, ${manifest.roles.length} roles, ${manifest.files.length} files from ${manifest.upstream.commit.slice(0, 12)}.\n`
);
