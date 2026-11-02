import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "./core.mjs";
const safeQueueUrl = (value) => {
  const u = new URL(value);
  if (u.origin !== "https://queue.fal.run" || u.username || u.password)
    throw new Error("Invalid provider URL");
  return u.href;
};
export async function generateMedia({
  key,
  model,
  input,
  id,
  root,
  outputName,
  pollMs = 4000,
  fetchImpl = fetch,
}) {
  if (
    !key ||
    !id ||
    !/^[-a-z0-9]+$/.test(id) ||
    !/^[-a-zA-Z0-9]+(?:\/[-a-zA-Z0-9.]+)*$/.test(model) ||
    model.split("/").some((s) => s === "." || s === "..")
  )
    throw new Error("Invalid media request");
  await mkdir(root, { recursive: true });
  const receiptFile = path.join(root, id + ".receipt.json");
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  let receipt;
  try {
    receipt = JSON.parse(await readFile(receiptFile, "utf8"));
    if (receipt.payloadHash !== payloadHash || receipt.model !== model)
      throw new Error("Existing request has different input or model");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (receipt?.status === "completed") {
    try {
      if (
        (await stat(path.join(root, path.basename(receipt.outputFile)))).size >
        0
      )
        return receipt;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    receipt.status = "queued";
  }
  const headers = {
    Authorization: "Key " + key,
    "content-type": "application/json",
  };
  if (!receipt) {
    receipt = {
      id,
      model,
      payloadHash,
      status: "prepared",
      startedAt: new Date().toISOString(),
      actualUsd: null,
    };
    await writeFile(receiptFile, JSON.stringify(receipt, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    receipt.status = "sending";
    await atomicJson(receiptFile, receipt);
    let response;
    try {
      response = await fetchImpl("https://queue.fal.run/" + model, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      receipt.status = "uncertain";
      await atomicJson(receiptFile, receipt);
      throw new Error("Media submission uncertain; do not resubmit");
    }
    receipt.httpStatus = response.status;
    if (!response.ok) {
      receipt.status = "rejected";
      await atomicJson(receiptFile, receipt);
      throw new Error("Media request rejected: " + response.status);
    }
    const data = await response.json();
    if (!data.request_id || !data.status_url || !data.response_url) {
      receipt.status = "uncertain";
      await atomicJson(receiptFile, receipt);
      throw new Error("Missing request identifiers");
    }
    Object.assign(receipt, {
      requestId: data.request_id,
      statusUrl: safeQueueUrl(data.status_url),
      responseUrl: safeQueueUrl(data.response_url),
      status: "queued",
    });
    await atomicJson(receiptFile, receipt);
  }
  if (!receipt.requestId)
    throw new Error("Previous media submission needs manual reconciliation");
  const until = Date.now() + 25 * 60 * 1000;
  while (Date.now() < until) {
    const response = await fetchImpl(safeQueueUrl(receipt.statusUrl), {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error("Existing media status needs retry; no new submission");
    const data = await response.json();
    receipt.providerStatus = data.status;
    await atomicJson(receiptFile, receipt);
    if (data.status === "COMPLETED") {
      const output = await fetchImpl(safeQueueUrl(receipt.responseUrl), {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!output.ok) throw new Error("Existing media result needs collection");
      const result = await output.json();
      const url =
        result.video?.url ||
        (typeof result.audio === "string" ? result.audio : result.audio?.url);
      if (!url) throw new Error("Missing media output");
      const mediaUrl = new URL(url);
      if (mediaUrl.protocol !== "https:") throw new Error("Invalid output URL");
      const download = await fetchImpl(mediaUrl, {
        signal: AbortSignal.timeout(60000),
      });
      if (!download.ok)
        throw new Error("Could not collect existing media output");
      const file = path.join(root, path.basename(outputName));
      await writeFile(file, Buffer.from(await download.arrayBuffer()));
      Object.assign(receipt, {
        status: "completed",
        completedAt: new Date().toISOString(),
        outputFile: path.basename(file),
        durationMs: result.duration_ms ?? null,
      });
      await atomicJson(receiptFile, receipt);
      return receipt;
    }
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(data.status))
      throw new Error("Unexpected media queue status");
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Media generation remains pending; resume the saved request");
}
