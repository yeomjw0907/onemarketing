import { create, get, list, lock, transaction, update } from "./db";
import {
  notificationTemplates,
  renderNotification,
  sensConfiguration,
  sensRequest,
  refreshNotification,
} from "./sens";

export type TemplateDetail = {
  templateCode: string;
  channelId: string;
  templateInspectionStatus: string;
  templateStatus: string;
  isBlock?: boolean;
  isDormant?: boolean;
  content: string;
  buttons?: {
    type: string;
    name: string;
    linkMobile: string;
    linkPc: string;
  }[];
};
export function templateReady(
  t: TemplateDetail | undefined,
  code: string,
  content: string,
  channel: string,
  base: string,
) {
  return (
    !!t &&
    t.templateCode === code &&
    t.channelId === channel &&
    t.templateInspectionStatus === "COMPLETE" &&
    ["ACTIVE", "READY"].includes(t.templateStatus) &&
    t.isBlock === false &&
    t.isDormant === false &&
    t.content === content &&
    t.buttons?.length === 1 &&
    t.buttons[0].type === "WL" &&
    t.buttons[0].name === "참여자 화면" &&
    t.buttons[0].linkMobile === base + "/participants/portal" &&
    t.buttons[0].linkPc === base + "/participants/portal"
  );
}

// Independent of SENS_ENABLED: this monitor can send exactly one authorized setup test,
// to its configured recipient only. It never drains the participant notification queue.
export async function templateMonitorTick() {
  if (
    process.env.SENS_MONITOR_ENABLED !== "true" ||
    !sensConfiguration().configured
  )
    return;
  const phone = process.env.SENS_TEST_PHONE || "";
  if (!/^01\d{8,9}$/.test(phone))
    throw new Error("검수 테스트 수신번호 설정을 확인하세요.");
  const definitions = Object.values(notificationTemplates).map((t) => ({
    ...t,
    code: process.env[t.env],
  }));
  if (definitions.some((t) => !t.code)) return;
  const service = process.env.SENS_SERVICE_ID!,
    channel = process.env.SENS_CHANNEL_ID!,
    base = process.env.APP_URL!;
  const monitorKey =
    "sens-approval-test:" +
    service +
    ":" +
    definitions.map((t) => t.code).join(",") +
    ":" +
    phone;
  const claimed = await transaction(async () => {
    await lock(monitorKey);
    let row = (await list("notification_outbox")).find(
      (n) => n.monitorKey === monitorKey,
    );
    if (!row)
      row = await create("notification_outbox", {
        monitorKey,
        setupTest: true,
        type: "materials",
        to: phone,
        status: "waiting_approval",
        content:
          "알림톡 5종 검수 확인 중 · 모두 승인되면 본인 번호로 테스트 1건 발송",
        attempts: 0,
      });
    if (
      ["sending", "succeeded", "failed", "uncertain", "cancelled"].includes(
        String(row.status),
      )
    )
      return null;
    if (
      row.lastCheckedAt &&
      Date.parse(String(row.lastCheckedAt)) > Date.now() - 9 * 60000
    )
      return null;
    return update(row.id, {
      lastCheckedAt: new Date().toISOString(),
      error: null,
    });
  });
  if (!claimed) return;
  try {
    if (claimed.status === "accepted") {
      await refreshNotification(claimed.id);
      return;
    }
    const details: (TemplateDetail | undefined)[] = [];
    for (const t of definitions) {
      const path =
        "/alimtalk/v2/services/" +
        service +
        "/templates?" +
        new URLSearchParams({ channelId: channel, templateCode: t.code! });
      const response = await sensRequest("GET", path);
      if (!Array.isArray(response))
        throw new Error("검수 상태 응답 형식을 확인하세요.");
      details.push(
        response.find((d: TemplateDetail) => d.templateCode === t.code),
      );
    }
    const states = definitions.map((t, i) => ({
      code: t.code,
      inspection: details[i]?.templateInspectionStatus || "MISSING",
      status: details[i]?.templateStatus || "MISSING",
    }));
    const ready = definitions.every((t, i) =>
      templateReady(details[i], t.code!, t.text, channel, base),
    );
    const send = await transaction(async () => {
      await lock(monitorKey);
      const fresh = await get(claimed.id);
      if (
        !fresh ||
        !["waiting_approval", "rejected"].includes(String(fresh.status))
      )
        return false;
      await update(claimed.id, {
        templateStates: states,
        status: ready
          ? "sending"
          : states.some((t) => t.inspection === "REJECT")
            ? "rejected"
            : "waiting_approval",
        ...(ready
          ? { attemptedAt: new Date().toISOString(), attempts: 1 }
          : {}),
      });
      return ready;
    });
    if (!send) return;
    const content = renderNotification("materials", {
      name: "알림톡 연결 확인 테스트",
      deadline: new Date(Date.now() + 7 * 86400000).toLocaleDateString(
        "ko-KR",
        { timeZone: "Asia/Seoul" },
      ),
    });
    const result = await sensRequest(
      "POST",
      "/alimtalk/v2/services/" + service + "/messages",
      {
        plusFriendId: channel,
        templateCode: process.env.SENS_TEMPLATE_MATERIALS,
        messages: [
          {
            countryCode: "82",
            to: phone,
            content,
            useSmsFailover: false,
            buttons: details[0]!.buttons,
          },
        ],
      },
    );
    await update(claimed.id, {
      content,
      status:
        result.messages?.[0]?.requestStatusCode === "A000"
          ? "accepted"
          : "failed",
      requestId: result.requestId,
      messageId: result.messages?.[0]?.messageId,
      requestedAt: new Date().toISOString(),
    });
  } catch (e) {
    await transaction(async () => {
      await lock(monitorKey);
      const fresh = await get(claimed.id);
      if (fresh)
        await update(claimed.id, {
          status: fresh.status === "sending" ? "uncertain" : fresh.status,
          error: e instanceof Error ? e.message : "검수 확인 오류",
        });
    });
  }
}
