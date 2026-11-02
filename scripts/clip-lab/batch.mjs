import { readFile } from "node:fs/promises";
import path from "node:path";
import { runBatch, summarize, atomicJson } from "./core.mjs";
if (process.env.GEMINI_ENV_FILE)
  process.loadEnvFile(process.env.GEMINI_ENV_FILE);
const manifest = JSON.parse(
  await readFile(
    process.argv[2] || new URL("./manifest.json", import.meta.url),
    "utf8",
  ),
);
const root = path.resolve(process.env.CLIP_LAB_DATA_DIR || "output/clip-lab");
const results = await runBatch({
  references: manifest.references,
  key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  model: process.env.GEMINI_VIDEO_ANALYSIS_MODEL || "gemini-3.1-flash-lite",
  root,
  onProgress: (p) => console.log(JSON.stringify(p)),
});
await atomicJson(path.join(root, "manifest.json"), manifest);
console.log(JSON.stringify(summarize(results), null, 2));
