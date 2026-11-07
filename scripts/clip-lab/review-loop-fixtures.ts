import { readFileSync, writeFileSync } from "node:fs";
import { reviewClipMotion } from "../../src/lib/clip-quality";
import { runFFmpeg } from "../../src/lib/video";

const root = "output/clip-loop-20261108/local";
const reports = [];
for (let i = 1; i <= 5; i++) {
  const source = JSON.parse(readFileSync(`${root}/${i}.json`, "utf8"));
  const quality = await reviewClipMotion(
    readFileSync(source.sourceFile),
    runFFmpeg,
    true,
  );
  reports.push({
    sourceName: source.sourceFile.split(/[\\/]/).pop(),
    sha256: source.sha256,
    quality,
  });
}
writeFileSync(
  "output/clip-loop-20261108/fixture-quality.json",
  JSON.stringify(reports, null, 2),
);
console.log(
  JSON.stringify(
    reports.map((r) => ({
      source: r.sourceName,
      warnings: r.quality.warnings,
    })),
  ),
);
