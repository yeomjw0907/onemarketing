import { get, list, lock, transaction, update } from "./db";
import { sensConfiguration, sensRequest, refreshNotification } from "./sens";

export const retentionAdminTemplate = {
  code: "ONERETENTIONADMINV1",
  text: "[원케이션] 운영 중인 캠페인의 게시물 유지 확인 알림입니다.\n작업: #{name}\n확인 내용: #{reason}\n관리자 화면에서 게시물을 확인하고 필요한 조치를 진행해주세요.",
};
const adminPhone = () =>
  process.env.RETENTION_ADMIN_PHONE || process.env.SENS_TEST_PHONE || "";
export function retentionAdminConfiguration() {
  return {
    enabled: process.env.RETENTION_ADMIN_ALIMTALK_ENABLED === "true",
    configured:
      sensConfiguration().configured &&
      /^01\d{8,9}$/.test(adminPhone()) &&
      !!process.env.SENS_TEMPLATE_RETENTION_ADMIN,
  };
}

export async function retentionAdminAlertTick() {
  const config = retentionAdminConfiguration();
  if (!config.enabled || !config.configured) return;
  const started = Date.now();
  for (const row of (await list("notification_outbox"))
    .filter(
      (n) =>
        n.type === "retention_admin" &&
        ["queued", "accepted"].includes(String(n.status)),
    )
    .slice(0, 10)) {
    if (Date.now() - started > 30000) break;
    try {
      if (row.status === "accepted") {
        await refreshNotification(row.id);
        continue;
      }
      const code = process.env.SENS_TEMPLATE_RETENTION_ADMIN!;
      const base = process.env.APP_URL!.replace(/\/$/, "");
      const details = await sensRequest(
        "GET",
        "/alimtalk/v2/services/" +
          process.env.SENS_SERVICE_ID +
          "/templates?" +
          new URLSearchParams({
            channelId: process.env.SENS_CHANNEL_ID!,
            templateCode: code,
          }),
      );
      const template = Array.isArray(details)
        ? details.find((t) => t.templateCode === code)
        : undefined;
      if (
        !template ||
        template.channelId !== process.env.SENS_CHANNEL_ID ||
        template.templateInspectionStatus !== "COMPLETE" ||
        !["ACTIVE", "READY"].includes(template.templateStatus) ||
        template.isBlock !== false ||
        template.isDormant !== false ||
        template.content !== retentionAdminTemplate.text ||
        template.buttons?.length !== 1 ||
        template.buttons[0].name !== "관리자 화면" ||
        template.buttons[0].type !== "WL" ||
        template.buttons[0].linkMobile !== base + "/?page=workflow" ||
        template.buttons[0].linkPc !== base + "/?page=workflow"
      ) {
        await update(row.id, {
          error: "관리자 알림톡 템플릿 승인·내용·버튼 확인 필요",
        });
        continue;
      }
      const claimed = await transaction(async () => {
        await lock("notification-send:" + row.id);
        const fresh = await get(row.id);
        if (!fresh || fresh.status !== "queued") return null;
        const t = await get(String(fresh.taskId));
        if (
          !t ||
          !t.retentionMonitorAlert ||
          t.retentionMonitorEventId !== fresh.eventId ||
          ((!t.retentionUntil ||
            Date.parse(String(t.retentionUntil)) <= Date.now()) &&
            !["needs_recovery", "recovery_submitted"].includes(
              String(t.retentionStatus),
            ))
        ) {
          await update(row.id, { status: "cancelled" });
          return null;
        }
        const variables = fresh.variables as Record<string, string>;
        const content = retentionAdminTemplate.text.replace(
          /#\{(\w+)\}/g,
          (_, key) => variables[key] || "",
        );
        return update(row.id, {
          status: "sending",
          attemptedAt: new Date().toISOString(),
          attempts: Number(fresh.attempts || 0) + 1,
          to: adminPhone(),
          content,
          error: null,
        });
      });
      if (!claimed) continue;
      try {
        const response = await sensRequest(
          "POST",
          "/alimtalk/v2/services/" + process.env.SENS_SERVICE_ID + "/messages",
          {
            plusFriendId: process.env.SENS_CHANNEL_ID,
            templateCode: code,
            messages: [
              {
                to: claimed.to,
                content: claimed.content,
                buttons: [
                  {
                    type: "WL",
                    name: "관리자 화면",
                    linkMobile: base + "/?page=workflow",
                    linkPc: base + "/?page=workflow",
                  },
                ],
              },
            ],
          },
        );
        const message = response.messages?.[0];
        if (!message?.messageId)
          throw new Error("발송 결과 불명확 · SENS 콘솔 확인 필요");
        await update(row.id, {
          status: "accepted",
          requestId: response.requestId,
          messageId: message.messageId,
        });
      } catch (e) {
        // Never retry an ambiguous POST automatically: it may already have delivered.
        await update(row.id, {
          status: "uncertain",
          error: e instanceof Error ? e.message : "발송 결과 확인 필요",
        });
      }
    } catch (e) {
      await update(row.id, {
        error: e instanceof Error ? e.message : "관리자 알림 확인 실패",
      });
    }
  }
}
