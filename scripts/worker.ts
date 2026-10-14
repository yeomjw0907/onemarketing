import { config } from "dotenv";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", quiet: true });
const { claimJob, renewLease, releaseLease, jobResult } =
  await import("../src/lib/jobs");
const { executeProviderJob, ProviderError } =
  await import("../src/lib/providers");
const { slideshow } = await import("../src/lib/video");
const { create, db, list, get } = await import("../src/lib/db");
const owner = randomUUID();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log("One Marketing worker started.");
while (!stopping) {
  const job = claimJob(owner);
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    continue;
  }
  const heartbeat = setInterval(() => renewLease(owner), 10000);
  try {
    if (job.type === "slideshow") await slideshow(job);
    else await executeProviderJob(job);
    db.transaction(() => {
      if (
        job.type !== "slideshow" &&
        !list("costs").some((c) => c.jobId === job.id)
      )
        create("costs", {
          projectId: job.projectId,
          jobId: job.id,
          category: "ai",
          amount: job.estimate,
          description: `${job.type} 제작비 · 청구 확인 필요`,
          confirmed: false,
          usage: get(job.id)?.calls,
          currency: "KRW",
          estimate: true,
        });
      jobResult(job.id, {
        status: "succeeded",
        completedAt: new Date().toISOString(),
        error: null,
      });
    })();
  } catch (e) {
    const uncertain = e instanceof ProviderError && e.uncertain;
    db.transaction(() => {
      const latest = get(job.id)!;
      if (
        (uncertain || (Array.isArray(latest.calls) && latest.calls.length)) &&
        !list("costs").some((c) => c.jobId === job.id)
      )
        create("costs", {
          projectId: job.projectId,
          jobId: job.id,
          category: "ai",
          amount: job.estimate,
          description: `${job.type} 중단 · 청구 확인 필요`,
          confirmed: false,
          estimate: true,
        });
      jobResult(job.id, {
        status: uncertain ? "uncertain" : "failed",
        error: e instanceof Error ? e.message : "작업 실패",
      });
    })();
    console.log(`Job ${job.id}: ${uncertain ? "uncertain" : "failed"}`);
  } finally {
    clearInterval(heartbeat);
  }
}
releaseLease(owner);
db.close();
console.log("Worker stopped.");
