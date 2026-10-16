import { config } from "dotenv";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", quiet: true });
// 별도 worker 프로세스(로컬·전용 서버용). Vercel 배포에서는 /api/jobs/run 서버리스 실행이 같은 로직을 수행한다.
// 두 방식이 동시에 돌아도 작업별 lease로 같은 작업을 중복 처리하지 않는다.
const { claimJob } = await import("../src/lib/jobs");
const { processJob } = await import("../src/lib/worker");
const { closeDb } = await import("../src/lib/db");
const owner = "worker-" + randomUUID();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
const { notificationTick } = await import("../src/lib/sens");
const { retentionMonitorTick } = await import("../src/lib/retention-monitor");
const { retentionAdminAlertTick } =
  await import("../src/lib/retention-admin-alert");
let lastNotificationTick = 0;
console.log("One Marketing worker started.");
while (!stopping) {
  if (Date.now() - lastNotificationTick > 60000) {
    lastNotificationTick = Date.now();
    try {
      await retentionMonitorTick();
    } catch (e) {
      console.error(
        "retention monitor failed",
        e instanceof Error ? e.message : e,
      );
    }
    try {
      await retentionAdminAlertTick();
    } catch (e) {
      console.error(
        "retention alert failed",
        e instanceof Error ? e.message : e,
      );
    }
    try {
      await notificationTick();
    } catch (e) {
      console.error(
        "notification tick failed",
        e instanceof Error ? e.message : e,
      );
    }
  }
  const job = await claimJob(owner);
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    continue;
  }
  const result = await processJob(job, owner);
  console.log(`Job ${job.id} (${job.type}): ${result}`);
}
await closeDb();
console.log("Worker stopped.");
