import { synchronizeNovelToGameAssets } from "./novel-to-game-assets.js";

const manifest = await synchronizeNovelToGameAssets();
process.stdout.write(
  `Synced ${String(manifest.skills.length)} NovelToGame Skills and ${String(manifest.examples.length)} example from ${manifest.upstream.commit.slice(0, 12)}.\n`
);
