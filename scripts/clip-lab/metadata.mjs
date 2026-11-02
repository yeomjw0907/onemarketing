import { youtubeUrl, atomicJson, listRuns } from "./core.mjs";
import path from "node:path";
export async function enrichMetadata({ root, manifest, fetchImpl = fetch }) {
  const results = [];
  for (const ref of manifest.references) {
    let metadata;
    try {
      const response = await fetchImpl(
        "https://www.youtube.com/oembed?url=" +
          encodeURIComponent(youtubeUrl(ref.url)) +
          "&format=json",
        { signal: AbortSignal.timeout(15000) },
      );
      const data = response.ok ? await response.json() : null;
      metadata = {
        checkedAt: new Date().toISOString(),
        status: response.status,
        title:
          typeof data?.title === "string" ? data.title.slice(0, 500) : null,
        author:
          typeof data?.author_name === "string"
            ? data.author_name.slice(0, 200)
            : null,
      };
    } catch {
      metadata = {
        checkedAt: new Date().toISOString(),
        status: "unavailable",
        title: null,
        author: null,
      };
    }
    results.push({ ...ref, metadata });
  }
  const updated = { ...manifest, references: results };
  await atomicJson(path.join(root, "manifest.json"), updated);
  for (const run of await listRuns(root)) {
    const ref = results.find((r) => youtubeUrl(r.url) === run.sourceUrl);
    if (ref) {
      run.metadata = ref.metadata;
      run.sourceCategoryVerified = false;
      await atomicJson(path.join(root, "runs", run.id + ".json"), run);
    }
  }
  return updated;
}
