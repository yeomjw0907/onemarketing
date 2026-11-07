import dotenv from "dotenv";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { collectReferences } from "./collect.mjs";
import { runGroupedCampaign } from "./research-group.mjs";
import { exportCatalog } from "./catalog.mjs";
dotenv.config({ path: ".env.local", quiet: true });
const root = "output/clip-loop-20261108";
await mkdir(root, { recursive: true });
const previous = JSON.parse(
  gunzipSync(await readFile("data/clip-lab/reference-catalog-1000.json.gz")),
);
if (process.argv.includes("collect")) {
  const m = await collectReferences({
    executable: process.env.YTDLP_PATH || "yt-dlp",
    root,
    excluded: previous.records.map((r) => r.sourceUrl),
    target: 1800,
    cap: 120,
    onProgress: (p) => console.log(JSON.stringify(p)),
  });
  console.log(JSON.stringify({ collected: m.collected }));
} else {
  const manifest = JSON.parse(await readFile(root + "/manifest.json", "utf8"));
  const directRoot = root + "/direct";
  await mkdir(directRoot, { recursive: true });
  await writeFile(directRoot + "/manifest.json", JSON.stringify(manifest));
  console.log(
    JSON.stringify(
      await runGroupedCampaign({
        manifest,
        key: process.env.GEMINI_API_KEY,
        root: directRoot,
        target: 1000,
        concurrency: 6,
      }),
    ),
  );
  const c = await exportCatalog(
    directRoot,
    "data/clip-lab/reference-catalog-20261108.json.gz",
    1000,
  );
  console.log(JSON.stringify({ exported: c.records.length }));
}
