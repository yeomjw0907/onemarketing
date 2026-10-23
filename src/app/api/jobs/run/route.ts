import { commerceDeadlineTick } from "@/lib/commerce";
import { retentionMonitorTick } from "@/lib/retention-monitor";
import { retentionAdminAlertTick } from "@/lib/retention-admin-alert";
import { notificationTick } from "@/lib/sens";
import { timingSafeEqual } from "node:crypto";
import { actor } from "@/lib/auth";
import { hasRunnableJobs } from "@/lib/jobs";
import { runTick, scheduleTick } from "@/lib/trigger";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
// 작업 실행 엔드포인트. Vercel Cron(Authorization: Bearer CRON_SECRET), 연쇄 호출, 관리자 세션에서 호출한다.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7)),
    expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
async function handle(request: Request, background: boolean) {
  if (!authorized(request) && !(await actor()))
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 401 },
    );
  const started = Date.now();
  if (background) {
    scheduleTick(true);
    return Response.json({ scheduled: true }, { status: 202 });
  }
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
    console.error("retention alert failed", e instanceof Error ? e.message : e);
  }
  await commerceDeadlineTick();
  await notificationTick();
  const runnable = await hasRunnableJobs();
  if (!runnable) return Response.json({ runnable: false, results: [] });
  const result = await runTick(Math.max(0, 240000 - (Date.now() - started)));
  return Response.json({ runnable: true, ...result });
}
// Cron은 GET으로 호출한다. 응답을 기다리는 동안 작업을 처리한다.
export function GET(request: Request) {
  return handle(request, false);
}
// 연쇄 호출·수동 실행은 POST. 즉시 202를 돌려주고 after()로 처리한다.
export function POST(request: Request) {
  return handle(request, true);
}
