import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { validateResearch } from "../scripts/clip-lab/research.mjs";

test("second loop contains 1000 independently bound new sources and evidence points to their actual shot windows", async () => {
  const load = async (p) => JSON.parse(gunzipSync(await readFile(p)));
  const old = await load("data/clip-lab/reference-catalog-1000.json.gz");
  const fresh = await load("data/clip-lab/reference-catalog-20261108.json.gz");
  assert.equal(fresh.records.length, 1000);
  assert.equal(new Set(fresh.records.map((r) => r.sourceUrl)).size, 1000);
  const oldUrls = new Set(old.records.map((r) => r.sourceUrl));
  const records = new Map();
  for (const r of fresh.records) {
    assert.ok(!oldUrls.has(r.sourceUrl));
    assert.equal(r.status, "succeeded");
    assert.equal(r.samplingFps, 1);
    assert.deepEqual(r.rangeMs, [0, 30000]);
    validateResearch(r.analysis);
    records.set(r.id, r);
  }
  const evidence = JSON.parse(
    await readFile("data/clip-lab/editing-evidence-20261108.json", "utf8"),
  );
  assert.equal(evidence.observationCount, 1000);
  for (const family of evidence.families) {
    assert.ok(family.sources.length > 0);
    for (const s of family.sources) {
      const r = records.get(s.id);
      assert.ok(r);
      assert.equal(s.url, r.sourceUrl);
      const shot = r.analysis.shots[s.shotIndex];
      assert.deepEqual(s.rangeMs, [shot.startMs, shot.endMs]);
    }
  }
  const report = JSON.parse(
    await readFile(
      "docs/research/clip-loop-20261108/verification.json",
      "utf8",
    ),
  );
  assert.equal(report.totalReferences, 1005);
  assert.equal(report.localReferences.length, 5);
  assert.equal(report.previousCatalogOverlap, 0);
  assert.ok(
    report.localReferences.every(
      (r) =>
        r.visualAccess && r.samplingFps === 3 && r.inputRange === "full-file",
    ),
  );
  assert.ok(!JSON.stringify(report.localReferences).includes("C:/Users/"));
});
