import { create, get, list, lock, transaction, update, audit } from "./db";
import { sensRequest } from "./sens";
import type { RecordData } from "./types";

export function recruitmentConfiguration() {
  return {
    enabled: process.env.SENS_BRAND_ENABLED === "true",
    configured: [
      "NCP_ACCESS_KEY",
      "NCP_SECRET_KEY",
      "SENS_SERVICE_ID",
      "SENS_CHANNEL_ID",
      "APP_URL",
    ].every((k) => !!process.env[k]),
    targeting: "I",
    audience: "모집 알림 수신 동의자 중 원케이션 채널 친구",
  };
}

export function recruitmentSendTime(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 8 * 60 && minutes < 20 * 60 + 50;
}

export function recruitmentContent(offer: Record<string, unknown>) {
  const deadline = new Date(String(offer.expiresAt)).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
  });
  return `(광고) 원케이션\n새로운 캠페인 참여 제안이 도착했어요.\n${String(offer.name).slice(0, 300)}\n원고료: ${Number(offer.amount || 0).toLocaleString("ko-KR")}원\n수락 기한: ${deadline}\n나의 작업에서 조건을 확인하고 참여 여부를 선택해주세요.\n수신거부: 원케이션 채널 차단 또는 참여자 화면에서 모집 알림 해제`;
}

// Called in the same transaction as proposal creation. No historical offers are backfilled.
export async function queueRecruitment(offer: RecordData) {
  await lock("recruitment:" + offer.id);
  const old = (await list("notification_outbox")).find(
    (n) => n.type === "recruitment" && n.eventId === offer.id,
  );
  if (old) return old;
  const p = await get(String(offer.participantId));
  if (
    !p ||
    p.deletedAt ||
    p.status !== "active" ||
    p.kakaoMarketingConsent !== true
  )
    return;
  return create("notification_outbox", {
    participantId: p.id,
    type: "recruitment",
    eventId: offer.id,
    channel: "brandmessage",
    targeting: "I",
    to: String(p.phone || "").replace(/\D/g, ""),
    content: recruitmentContent(offer),
    consentAt: p.kakaoMarketingConsentAt || null,
    status: "queued",
    attempts: 0,
  });
}

export async function sendRecruitment(id: string) {
  const config = recruitmentConfiguration();
  if (!config.enabled || !config.configured)
    throw new Error("브랜드 메시지 설정과 활성화가 필요합니다.");
  const claimed = await transaction(async () => {
    await lock("notification-send:" + id);
    await lock("save:participants");
    const n = await get(id);
    if (
      n?.kind !== "notification_outbox" ||
      n.type !== "recruitment" ||
      !["queued", "failed"].includes(String(n.status))
    )
      throw new Error("발송 가능한 모집 알림이 아닙니다.");
    let content = String(n.content),
      phone = String(n.to);
    if (n.brandTest) {
      if (
        !process.env.SENS_TEST_PHONE ||
        phone !== process.env.SENS_TEST_PHONE.replace(/\D/g, "")
      )
        throw new Error("등록된 본인 테스트 번호만 발송할 수 있습니다.");
    } else {
      const p = await get(String(n.participantId));
      const offer = await get(String(n.eventId));
      const project = offer ? await get(String(offer.projectId)) : undefined;
      if (
        !p ||
        p.deletedAt ||
        p.status !== "active" ||
        p.kakaoMarketingConsent !== true ||
        !offer ||
        offer.kind !== "work_offers" ||
        offer.participantId !== p.id ||
        offer.status !== "proposed" ||
        !(Date.parse(String(offer.expiresAt)) > Date.now()) ||
        !project ||
        project.deletedAt ||
        project.hold ||
        project.settled ||
        ["completed", "cancelled"].includes(String(project.status))
      ) {
        await update(id, {
          status: "cancelled",
          error: "동의 철회·참여 중지·제안 종료로 발송 취소",
        });
        return null;
      }
      phone = String(p.phone || "").replace(/\D/g, "");
      content = recruitmentContent(offer);
    }
    if (!recruitmentSendTime())
      throw new Error(
        "모집 알림은 한국 시간 08:00~20:50에 발송합니다. 대기 알림은 다음 발송 시간에 처리됩니다.",
      );
    if (!/^01\d{8,9}$/.test(phone))
      throw new Error("수신 전화번호를 확인하세요.");
    return update(id, {
      to: phone,
      content,
      status: "sending",
      attempts: Number(n.attempts) + 1,
      attemptedAt: new Date().toISOString(),
      error: null,
    });
  });
  if (!claimed) return;
  try {
    const url = new URL("/participants/portal", process.env.APP_URL!).href;
    const result = await sensRequest(
      "POST",
      "/brandmessage/v2/services/" + process.env.SENS_SERVICE_ID + "/messages",
      {
        plusFriendId: process.env.SENS_CHANNEL_ID,
        messageType: "TEXT",
        targeting: "I",
        isAdult: false,
        messages: [
          {
            countryCode: "82",
            to: claimed.to,
            content: claimed.content,
            useSmsFailover: false,
            buttons: [
              {
                type: "WL",
                name: "나의 작업 확인",
                linkMobile: url,
                linkPc: url,
              },
            ],
          },
        ],
      },
    );
    const message = result.messages?.[0];
    await update(id, {
      status: message?.requestStatusCode === "A000" ? "accepted" : "failed",
      requestId: result.requestId,
      messageId: message?.messageId,
      error:
        message?.requestStatusCode === "A000"
          ? null
          : String(message?.requestStatusDesc || "발송 거절"),
      requestedAt: new Date().toISOString(),
    });
  } catch (e) {
    await update(id, {
      status: "uncertain",
      error: e instanceof Error ? e.message : "발송 확인 필요",
    });
    throw e;
  }
}

export async function refreshRecruitment(id: string) {
  const n = await get(id);
  if (n?.type !== "recruitment" || !n.messageId)
    throw new Error("조회할 모집 메시지가 없습니다.");
  const result = await sensRequest(
    "GET",
    "/brandmessage/v2/services/" +
      process.env.SENS_SERVICE_ID +
      "/messages/" +
      n.messageId,
  );
  return transaction(async () => {
    await lock("notification-send:" + id);
    return update(id, {
      status:
        result.messageStatusName === "success"
          ? "succeeded"
          : result.messageStatusName === "fail"
            ? "failed"
            : "accepted",
      providerResult: result,
      error:
        result.messageStatusName === "fail"
          ? String(result.messageStatusDesc || "수신 실패")
          : null,
    });
  });
}

export async function recruitmentTick() {
  const config = recruitmentConfiguration();
  if (!config.enabled || !config.configured) return;
  for (const n of (await list("notification_outbox"))
    .filter(
      (n) =>
        n.type === "recruitment" &&
        ["queued", "accepted"].includes(String(n.status)),
    )
    .slice(0, 20)) {
    try {
      if (n.status === "accepted") await refreshRecruitment(n.id);
      else await sendRecruitment(n.id);
    } catch {
      /* A failure is isolated; uncertain sends are never automatically retried. */
    }
  }
}

export async function testRecruitment(actor: string) {
  const phone = String(process.env.SENS_TEST_PHONE || "").replace(/\D/g, "");
  if (!/^01\d{8,9}$/.test(phone))
    throw new Error("본인 테스트 번호 SENS_TEST_PHONE 설정이 필요합니다.");
  const n = await transaction(async () => {
    await lock("recruitment-test:" + phone);
    const previous = (await list("notification_outbox")).find(
      (n) =>
        n.type === "recruitment" &&
        n.brandTest &&
        Date.parse(n.createdAt) > Date.now() - 3600000,
    );
    if (previous)
      throw new Error(
        "최근 1시간 내 테스트 이력이 있어요. 알림 이력에서 결과를 확인해주세요.",
      );
    const row = await create("notification_outbox", {
      type: "recruitment",
      channel: "brandmessage",
      targeting: "I",
      brandTest: true,
      to: phone,
      content:
        "(광고) 원케이션\n모집 알림 연결 테스트입니다. 실제 캠페인 제안이 아닙니다.\n수신거부: 원케이션 채널 차단 또는 참여자 화면에서 모집 알림 해제",
      status: "queued",
      attempts: 0,
    });
    await audit(actor, "recruitment-test-requested", row.id, { consent: true });
    return row;
  });
  await sendRecruitment(n.id);
  return get(n.id);
}
