import { taskDeadline, taskNeedsReminder } from "./task-deadline";
import { createHmac } from "node:crypto";
import { create, get, list, update, transaction, lock } from "./db";
export const notificationTemplates = {
  materials: {
    env: "SENS_TEMPLATE_MATERIALS",
    text: "[원케이션] #{name} 게시 자료가 준비되었습니다. 제출 기한: #{deadline}. 참여자 화면에서 자료와 가이드를 확인해주세요.",
  },
  revision: {
    env: "SENS_TEMPLATE_REVISION",
    text: "[원케이션] #{name} 게시물 수정 요청입니다. 수정 기한: #{deadline}. 수정 내용: #{note}",
  },
  payment: {
    env: "SENS_TEMPLATE_PAYMENT",
    text: "[원케이션] #{name} 원고료 지급이 완료되었습니다. 정산 내역은 참여자 화면에서 확인해주세요.",
  },
  reminder: {
    env: "SENS_TEMPLATE_REMINDER",
    text: "[원케이션] 진행 중인 게시 작업 #{count}건의 제출 기한이 임박했습니다. 참여자 화면에서 확인해주세요.",
  },
  retention: {
    env: "SENS_TEMPLATE_RETENTION",
    text: "[원케이션] #{name} 게시물 유지 확인이 필요합니다. 담당자가 요청한 내용을 참여자 화면에서 확인해주세요.",
  },
};
export type NotificationType = keyof typeof notificationTemplates;
export function sensConfiguration() {
  return {
    enabled: process.env.SENS_ENABLED === "true",
    configured: [
      "NCP_ACCESS_KEY",
      "NCP_SECRET_KEY",
      "SENS_SERVICE_ID",
      "SENS_CHANNEL_ID",
      "APP_URL",
    ].every((k) => !!process.env[k]),
    templates: Object.fromEntries(
      Object.entries(notificationTemplates).map(([k, v]) => [
        k,
        !!process.env[v.env],
      ]),
    ),
    brandEnabled: false,
  };
}
export function sensSignature(
  method: string,
  path: string,
  timestamp: string,
  key: string,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(method + " " + path + "\n" + timestamp + "\n" + key)
    .digest("base64");
}
export function renderNotification(
  type: NotificationType,
  variables: Record<string, string>,
) {
  return notificationTemplates[type].text.replace(/#\{(\w+)\}/g, (_, k) => {
    if (!variables[k]) throw new Error("알림 변수 누락: " + k);
    return variables[k];
  });
}
export async function queueNotification(
  participantId: string,
  type: NotificationType,
  eventId: string,
  variables: Record<string, string>,
) {
  await lock("notification:" + eventId + ":" + type);
  const existing = (await list("notification_outbox")).find(
    (n) => n.eventId === eventId && n.type === type,
  );
  if (existing) return existing;
  const p = await get(participantId);
  if (p?.kind !== "participants")
    throw new Error("알림 대상을 찾을 수 없습니다.");
  return create("notification_outbox", {
    participantId,
    type,
    eventId,
    variables,
    content: renderNotification(type, variables),
    to: String(p.phone || "").replace(/\D/g, ""),
    status: "queued",
    attempts: 0,
  });
}
export async function sensRequest(
  method: string,
  path: string,
  body?: unknown,
) {
  const timestamp = String(Date.now()),
    key = process.env.NCP_ACCESS_KEY!,
    secret = process.env.NCP_SECRET_KEY!;
  const r = await fetch("https://sens.apigw.ntruss.com" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": key,
      "x-ncp-apigw-signature-v2": sensSignature(
        method,
        path,
        timestamp,
        key,
        secret,
      ),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("SENS 요청 오류 " + r.status);
  return r.json();
}
export async function sendNotification(id: string) {
  if (!sensConfiguration().enabled || !sensConfiguration().configured)
    throw new Error("SENS 설정과 발송 활성화가 필요합니다.");
  const claimed = await transaction(async () => {
    await lock("notification-send:" + id);
    const n = await get(id);
    if (
      n?.kind !== "notification_outbox" ||
      !["queued", "failed"].includes(String(n.status))
    )
      throw new Error("발송 가능한 알림이 아닙니다.");
    const template = notificationTemplates[n.type as NotificationType];
    if (!template || !process.env[template.env])
      throw new Error("승인된 템플릿 코드를 설정하세요.");
    if (!/^01\d{8,9}$/.test(String(n.to)))
      throw new Error("수신 전화번호를 확인하세요.");
    const recipient = await get(String(n.participantId));
    if (!recipient || recipient.status !== "active") {
      await update(n.id, { status: "cancelled" });
      return null;
    }
    if (n.type === "payment") {
      const source = await get(String(n.eventId).split(":")[0]);
      if (!source || source.payoutStatus !== "paid") {
        await update(n.id, { status: "cancelled" });
        return null;
      }
    }
    if (n.type === "retention") {
      const [taskId, ...cycle] = String(n.eventId).split(":");
      const source = await get(taskId);
      if (
        !source ||
        source.participantId !== n.participantId ||
        source.retentionStatus !== "needs_recovery" ||
        source.retentionRequestedAt !== cycle.join(":")
      ) {
        await update(n.id, { status: "cancelled" });
        return null;
      }
    }
    if (n.type === "revision") {
      const source = await get(String(n.eventId).split(":")[0]);
      if (!source || source.status !== "delivered" || !source.revisionNotes) {
        await update(n.id, { status: "cancelled" });
        return null;
      }
    }
    // Stale reminders must never be delivered after submission.
    if (n.type === "reminder") {
      const tasks = (await list("tasks")).filter(
        (t) => t.participantId === n.participantId && taskNeedsReminder(t),
      );
      if (!tasks.length) {
        await update(n.id, { status: "cancelled" });
        return null;
      }
    }
    const variables =
      n.type === "reminder"
        ? {
            ...(n.variables as Record<string, string>),
            count: String(
              (await list("tasks")).filter(
                (t) =>
                  t.participantId === n.participantId && taskNeedsReminder(t),
              ).length,
            ),
          }
        : (n.variables as Record<string, string>);
    return update(n.id, {
      variables,
      content: renderNotification(n.type as NotificationType, variables),
      status: "sending",
      attempts: Number(n.attempts) + 1,
      attemptedAt: new Date().toISOString(),
    });
  });
  if (!claimed) return;
  try {
    const path =
      "/alimtalk/v2/services/" + process.env.SENS_SERVICE_ID + "/messages";
    const data = await sensRequest("POST", path, {
      plusFriendId: process.env.SENS_CHANNEL_ID,
      templateCode:
        process.env[
          notificationTemplates[claimed.type as NotificationType].env
        ],
      messages: [
        {
          countryCode: "82",
          to: claimed.to,
          content: claimed.content,
          useSmsFailover: false,
          buttons: [
            {
              type: "WL",
              name: "참여자 화면",
              linkMobile: process.env.APP_URL + "/participants/portal",
              linkPc: process.env.APP_URL + "/participants/portal",
            },
          ],
        },
      ],
    });
    await transaction(async () => {
      await lock("notification-send:" + id);
      await update(id, {
        status:
          data.messages?.[0]?.requestStatusCode === "A000"
            ? "accepted"
            : "failed",
        requestId: data.requestId,
        messageId: data.messages?.[0]?.messageId,
        requestedAt: new Date().toISOString(),
      });
    });
  } catch (e) {
    await transaction(async () => {
      await lock("notification-send:" + id);
      await update(id, {
        status: "uncertain",
        error: e instanceof Error ? e.message : "발송 확인 필요",
      });
    });
    throw e;
  }
}
export async function refreshNotification(id: string) {
  const n = await get(id);
  if (n?.kind !== "notification_outbox" || !n.messageId)
    throw new Error("조회할 메시지 ID가 없습니다.");
  const result = await sensRequest(
    "GET",
    "/alimtalk/v2/services/" +
      process.env.SENS_SERVICE_ID +
      "/messages/" +
      n.messageId,
  );
  return transaction(async () => {
    await lock("notification-send:" + id);
    return update(id, {
      status:
        result.messageStatus === "COMPLETED"
          ? String(result.messageStatusCode) === "0000"
            ? "succeeded"
            : "failed"
          : "accepted",
      providerResult: result,
    });
  });
}
export async function notificationTick() {
  const { templateMonitorTick } = await import("./sens-template-monitor");
  await templateMonitorTick();
  await transaction(async () => {
    for (const stale of (await list("notification_outbox")).filter(
      (n) =>
        n.status === "sending" &&
        new Date(String(n.attemptedAt)).getTime() < Date.now() - 5 * 60000,
    )) {
      await lock("notification-send:" + stale.id);
      const fresh = await get(stale.id);
      if (fresh?.status === "sending")
        await update(stale.id, {
          status: "uncertain",
          error: "발송 실행 중 중단됨. SENS 콘솔 확인 필요",
        });
    }
    const tasks = await list("tasks");
    for (const p of await list("participants")) {
      const pending = tasks.filter(
        (t) => t.participantId === p.id && taskNeedsReminder(t),
      );
      if (pending.length)
        await queueNotification(
          p.id,
          "reminder",
          p.id +
            ":" +
            pending
              .map((t) => t.id + ":" + taskDeadline(t))
              .sort()
              .join("|"),
          { count: String(pending.length) },
        );
    }
  });
  if (!sensConfiguration().enabled || !sensConfiguration().configured) return;
  for (const n of (await list("notification_outbox"))
    .filter(
      (n) =>
        n.type !== "retention_admin" &&
        ["queued", "accepted"].includes(String(n.status)),
    )
    .slice(0, 20)) {
    try {
      if (n.status === "accepted") await refreshNotification(n.id);
      else await sendNotification(n.id);
    } catch {
      /* isolated failures retained in outbox */
    }
  }
}
