import { synchronizeVideoRecapAssets } from "./video-recap-assets.js";

const manifest = await synchronizeVideoRecapAssets();
process.stdout.write(
  `Synced video-recap-skills ${manifest.upstream.releaseVersion} at ${manifest.upstream.commit.slice(0, 12)} (${String(manifest.skills.length)} Skills).\n`
);
