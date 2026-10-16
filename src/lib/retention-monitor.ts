import { randomUUID } from "node:crypto";
import { create, get, list, lock, transaction, update, audit } from "./db";
import type { RecordData } from "./types";
import { checkRetention } from "./retention";
import { probePublication, type ProbeResult } from "./publication-probe";

const hour = 3600000;
export function retentionDue(t: RecordData, now = Date.now()) {
  return (
    t.status === "verified" &&
    !!t.link &&
    !!t.participantId &&
    (Date.parse(String(t.retentionUntil)) > now ||
      ["needs_recovery", "recovery_submitted"].includes(
        String(t.retentionStatus),
      )) &&
    (!t.retentionNextProbeAt ||
      Date.parse(String(t.retentionNextProbeAt)) <= now)
  );
}

export async function applyProbe(
  t: RecordData,
  result: ProbeResult,
  now = Date.now(),
) {
  return transaction(async () => {
    await lock("project-operations:" + t.projectId);
    const current = await get(t.id);
    // Ignore results if an operator, participant, or another runner changed the task.
    if (
      !current ||
      current.version !== t.version ||
      current.link !== t.link ||
      !retentionDue({ ...current, retentionNextProbeAt: null }, now)
    )
      return null;
    const at = new Date(now).toISOString();
    const repeated = current.retentionProbeState === result.state;
    const since =
      repeated && current.retentionProbeSince
        ? String(current.retentionProbeSince)
        : at;
    const count = repeated ? Number(current.retentionProbeCount || 0) + 1 : 1;
    const sustained = count >= 2 && now - Date.parse(since) >= 6 * hour;
    const confirmedMissing =
      result.state === "missing" &&
      sustained &&
      !!current.retentionPublicObservedAt;
    const alert =
      result.state === "unsupported" ||
      (result.state !== "public" && sustained);
    const eventId = t.id + ":monitor:" + result.state + ":" + since;
    let updated = await update(t.id, {
      retentionProbedAt: at,
      retentionProbeState: result.state,
      retentionProbeReason: result.reason,
      retentionProbeSince: since,
      retentionProbeCount: count,
      retentionNextProbeAt: new Date(
        now +
          (result.state === "public" || result.state === "unsupported"
            ? 24
            : 6) *
            hour,
      ).toISOString(),
      ...(result.state === "public"
        ? { retentionPublicObservedAt: at, retentionMonitorAlert: false }
        : {}),
      ...(alert
        ? { retentionMonitorAlert: true, retentionMonitorEventId: eventId }
        : {}),
    });
    const pending = ["needs_recovery", "recovery_submitted"].includes(
      String(updated.retentionStatus),
    );
    if (
      confirmedMissing &&
      !pending &&
      Date.parse(String(updated.retentionUntil)) > now
    ) {
      updated = await checkRetention(
        t.id,
        false,
        "자동 확인에서 6시간 이상 간격으로 삭제·비공개 응답이 반복됐어요. 기존 게시물의 공개 상태를 확인하고 복구해주세요.",
        "system:retention-monitor",
        updated.version,
      );
    }
    if (alert) {
      await lock("notification:" + eventId + ":retention_admin");
      if (
        !(await list("notification_outbox")).some(
          (n) => n.type === "retention_admin" && n.eventId === eventId,
        )
      )
        await create("notification_outbox", {
          type: "retention_admin",
          taskId: t.id,
          eventId,
          status: "queued",
          attempts: 0,
          content: String(t.name) + " · " + result.reason,
          variables: {
            name: String(t.name),
            reason: confirmedMissing
              ? "삭제·비공개 반복 확인 · 복구 요청 생성"
              : result.reason + " · 관리자 확인 필요",
          },
        });
    }
    await audit("system:retention-monitor", "retention-probe", t.id, {
      ...result,
      count,
      confirmedMissing,
    });
    return updated;
  });
}

export async function retentionMonitorTick(probe = probePublication) {
  if (process.env.RETENTION_MONITOR_ENABLED !== "true")
    return { enabled: false, checked: 0 };
  const owner = randomUUID();
  const lease = await transaction(async () => {
    await lock("retention-monitor-run");
    let row = (await list("events")).find(
      (e) => e.type === "retention-monitor-health",
    );
    if (row && Date.parse(String(row.leaseUntil)) > Date.now()) return null;
    if (!row)
      row = await create("events", { type: "retention-monitor-health" });
    return update(row.id, {
      owner,
      leaseUntil: new Date(Date.now() + 4 * 60000).toISOString(),
      startedAt: new Date().toISOString(),
    });
  });
  if (!lease) return { enabled: true, checked: 0, running: true };
  let checked = 0;
  const started = Date.now();
  try {
    const tasks = (await list("tasks"))
      .filter((t) => retentionDue(t))
      .sort(
        (a, b) =>
          Date.parse(String(a.retentionNextProbeAt || a.createdAt)) -
          Date.parse(String(b.retentionNextProbeAt || b.createdAt)),
      );
    for (const task of tasks.slice(0, 20)) {
      if (Date.now() - started > 120000) break;
      await applyProbe(task, await probe(String(task.link)));
      checked++;
    }
    await update(lease.id, {
      lastCompletedAt: new Date().toISOString(),
      checked,
      error: null,
    });
    return {
      enabled: true,
      checked,
      remaining: Math.max(0, tasks.length - checked),
    };
  } catch (e) {
    await update(lease.id, {
      error: e instanceof Error ? e.message : "자동 확인 실패",
    });
    throw e;
  } finally {
    await transaction(async () => {
      await lock("retention-monitor-run");
      if ((await get(lease.id))?.owner === owner)
        await update(lease.id, { leaseUntil: null });
    });
  }
}
