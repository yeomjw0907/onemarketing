import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "./core.mjs";
const safeUrl = (value) => {
  const u = new URL(value);
  if (u.origin !== "https://queue.fal.run" || u.username || u.password)
    throw new Error("Invalid queue URL");
  return u.href;
};
export async function falJson({
  key,
  id,
  model,
  input,
  root,
  fetchImpl = fetch,
  pollMs = 3000,
}) {
  if (
    !key ||
    !/^[-a-z0-9]+$/.test(id) ||
    !/^[-a-z0-9]+(?:\/[-a-z0-9.]+)*$/.test(model)
  )
    throw new Error("Invalid request");
  await mkdir(root, { recursive: true });
  const file = path.join(root, id + ".json"),
    resultFile = path.join(root, id + ".result.json");
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  let r;
  try {
    r = JSON.parse(await readFile(file, "utf8"));
    if (r.payloadHash !== payloadHash || r.model !== model)
      throw new Error("Request input changed");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (r?.status === "completed")
    return JSON.parse(await readFile(resultFile, "utf8"));
  const headers = {
    Authorization: "Key " + key,
    "content-type": "application/json",
  };
  if (!r) {
    r = {
      id,
      model,
      payloadHash,
      status: "sending",
      startedAt: new Date().toISOString(),
    };
    await writeFile(file, JSON.stringify(r, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    let res;
    try {
      res = await fetchImpl("https://queue.fal.run/" + model, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      r.status = "uncertain";
      await atomicJson(file, r);
      throw new Error("Submission uncertain; saved request must be reconciled");
    }
    r.httpStatus = res.status;
    if (!res.ok) {
      r.status = "rejected";
      await atomicJson(file, r);
      throw Object.assign(new Error("Submission rejected: " + res.status), {
        terminal: true,
        httpStatus: res.status,
      });
    }
    const d = await res.json();
    if (!d.request_id || !d.status_url || !d.response_url) {
      r.status = "uncertain";
      await atomicJson(file, r);
      throw new Error("Missing queue identifiers");
    }
    Object.assign(r, {
      requestId: d.request_id,
      statusUrl: safeUrl(d.status_url),
      responseUrl: safeUrl(d.response_url),
      status: "queued",
    });
    await atomicJson(file, r);
  }
  if (!r.requestId)
    throw new Error("Existing submission cannot be automatically retried");
  const until = Date.now() + 20 * 60 * 1000;
  while (Date.now() < until) {
    const res = await fetchImpl(safeUrl(r.statusUrl), {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error("Resume saved queue status later");
    const d = await res.json();
    r.providerStatus = d.status;
    await atomicJson(file, r);
    if (d.status === "COMPLETED") {
      const response = await fetchImpl(safeUrl(r.responseUrl), {
        headers,
        signal: AbortSignal.timeout(60000),
      });
      r.resultHttpStatus = response.status;
      if (!response.ok) {
        r.status = "failed";
        await atomicJson(file, r);
        throw Object.assign(
          new Error("Provider result failed: " + response.status),
          { terminal: true, httpStatus: response.status },
        );
      }
      const result = await response.json();
      await atomicJson(resultFile, result);
      r.status = "completed";
      r.completedAt = new Date().toISOString();
      r.usage = result.usage || null;
      await atomicJson(file, r);
      return result;
    }
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(d.status))
      throw new Error("Unexpected queue state");
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error("Queue remains pending; resume saved identifiers");
}
