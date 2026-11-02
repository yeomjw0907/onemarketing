import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { listResearch, buildKnowledge } from "./knowledge.mjs";
import { atomicJson, youtubeUrl } from "./core.mjs";
import { validateResearch } from "./research.mjs";

export async function exportCatalog(root, target, count = 1000) {
  const all = await listResearch(root);
  const rows = all
    .filter((r) => r.status === "succeeded")
    .sort((a, b) => (a.completedAt||a.startedAt||'').localeCompare(b.completedAt||b.startedAt||''))
    .slice(0, count);
  if (rows.length !== count)
    throw new Error(
      `Need ${count} completed observations; found ${rows.length}`,
    );
  const manifest = JSON.parse(
    await readFile(path.join(root, "manifest.json"), "utf8"),
  );
  const urls = new Set(rows.map((r) => r.sourceUrl));
  const references = manifest.references.filter((r) =>
    urls.has(youtubeUrl(r.url)),
  );
  if (urls.size !== count || references.length !== count)
    throw new Error(
      "Catalog must contain unique sources with matching metadata",
    );
  const records = rows.map((r) => ({
    id: r.id,
    sourceUrl: r.sourceUrl,
    title: r.title,
    channel: r.channel,
    category: r.category,
    version: r.version,
    model: r.model,
    startedAt: r.startedAt,
    completedAt: r.completedAt||r.attempts?.at(-1)?.completedAt||null,
    rangeMs: r.rangeMs,
    samplingFps: r.samplingFps,
    provider: r.provider || "google-direct",
    inputClipping:
      r.inputClipping ||
      (r.samplingFps === 1
        ? "explicit videoMetadata 0..30s at 1fps"
        : "provider-default"),
    status: "succeeded",
    reviewStatus: r.reviewStatus,
    analysis: validateResearch(r.analysis),
  }));
  const catalog = {
    version: "clip-catalog-v1",
    createdAt: new Date().toISOString(),
    scope:
      "첫 30초의 대표 구간 AI 관찰 요청. 입력 설정은 기록별로 구분. 모델 학습 및 효과 검증 아님.",
    manifest: {
      ...manifest,
      references,
      collected: references.length,
      target: count,
    },
    records,
    knowledge: buildKnowledge(rows),
  };
  await mkdir(path.dirname(target), { recursive: true });
  if (target.endsWith(".gz"))
    await writeFile(target, gzipSync(JSON.stringify(catalog), { level: 9 }));
  else await atomicJson(target, catalog);
  return catalog;
}
export async function importCatalog(file, root) {
  const bytes = await readFile(file);
  const c = JSON.parse(
    (file.endsWith(".gz")
      ? gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 })
      : bytes
    ).toString("utf8"),
  );
  if (
    c.version !== "clip-catalog-v1" ||
    !Array.isArray(c.records) ||
    c.records.length > 1000
  )
    throw new Error("Invalid catalog");
  const seen = new Set();
  const sourceUrls = new Set();
  for (const r of c.records) {
    const expected = createHash("sha256")
      .update(youtubeUrl(r.sourceUrl) + r.version + r.model)
      .digest("hex");
    if (
      r.id !== expected ||
      seen.has(r.id) ||
      sourceUrls.has(youtubeUrl(r.sourceUrl))
    )
      throw new Error("Invalid record identity");
    seen.add(r.id);
    sourceUrls.add(youtubeUrl(r.sourceUrl));
    validateResearch(r.analysis);
  }
  await mkdir(path.join(root, "research"), { recursive: true });
  for (const r of c.records) {
    try {
      await writeFile(
        path.join(root, "research", r.id + ".json"),
        JSON.stringify(
          {
            ...r,
            attempts: [],
            estimatedCost: null,
            actualUsd: null,
            importedFromCatalog: true,
          },
          null,
          2,
        ),
        { flag: "wx", mode: 0o600 },
      );
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  let existing;
  try {
    existing = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8"),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const refs = new Map(
    (existing?.references || []).map((r) => [youtubeUrl(r.url), r]),
  );
  for (const r of c.manifest.references)
    if (!refs.has(youtubeUrl(r.url))) refs.set(youtubeUrl(r.url), r);
  await atomicJson(path.join(root, "manifest.json"), {
    ...c.manifest,
    references: [...refs.values()],
  });
  return { imported: c.records.length };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [mode, source, target] = process.argv.slice(2);
  if (!target)
    throw new Error(
      "Usage: catalog.mjs export data-dir catalog.json | import catalog.json data-dir",
    );
  console.log(
    JSON.stringify(
      mode === "export"
        ? {
            count: (
              await exportCatalog(path.resolve(source), path.resolve(target))
            ).records.length,
          }
        : await importCatalog(path.resolve(source), path.resolve(target)),
    ),
  );
}
