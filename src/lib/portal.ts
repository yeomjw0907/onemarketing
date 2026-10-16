import { portalPaymentHistory } from "./portal-payment-history";
import { publishableCopy } from "./copy-format";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { create, get, list, update, transaction, lock, audit } from "./db";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export async function issuePortal(participantId: string, actor: string) {
  return transaction(async () => {
    await lock("portal:" + participantId);
    const p = await get(participantId);
    if (p?.kind !== "participants") throw new Error("참여자를 선택하세요.");
    for (const old of (await list("portal_links")).filter(
      (l) =>
        l.participantId === p.id &&
        !l.revokedAt &&
        !String(l.purpose || "").startsWith("kakao-"),
    ))
      await update(old.id, { revokedAt: new Date().toISOString() });
    if (!p.referralCode)
      await update(p.id, { referralCode: randomBytes(6).toString("hex") });
    const token = randomBytes(32).toString("hex");
    await create("portal_links", {
      participantId: p.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    await audit(actor, "portal-issued", p.id);
    return { url: "/participants/portal?access=" + token };
  });
}
export async function portalParticipant(token?: string) {
  const access = token || (await cookies()).get("om_participant")?.value;
  if (!access || !/^[a-f0-9]{64}$/.test(access))
    throw new Error("접속 링크가 필요합니다.");
  const link = (await list("portal_links")).find(
    (l) =>
      l.purpose === "session" &&
      l.tokenHash === hash(access) &&
      !l.revokedAt &&
      new Date(String(l.expiresAt)).getTime() > Date.now(),
  );
  if (!link)
    throw new Error(
      "접속 링크가 만료되었습니다. 담당자에게 재발급을 요청하세요.",
    );
  const parent = await get(String(link.parentId));
  if (
    !parent ||
    parent.kind !== "portal_links" ||
    parent.participantId !== link.participantId ||
    parent.revokedAt ||
    new Date(String(parent.expiresAt)).getTime() <= Date.now()
  )
    throw new Error(
      "접속이 만료되었습니다. 카카오 로그인을 다시 진행해주세요.",
    );
  const p = await get(String(link.participantId));
  if (p?.kind !== "participants" || p.status !== "active" || p.deletedAt)
    throw new Error("현재 참여할 수 없는 계정입니다.");
  if (String(p.phone || "").replace(/\D/g, "") !== link.verifiedPhone)
    throw new Error("휴대폰 번호가 변경되었습니다. 다시 인증해주세요.");
  if (
    link.provider === "kakao" &&
    !(await list("portal_links")).some(
      (l) =>
        l.purpose === "kakao-account" &&
        l.id === link.bindingId &&
        l.participantId === p.id &&
        !l.revokedAt,
    )
  )
    throw new Error("카카오 계정 연결이 해제되었습니다. 다시 로그인해주세요.");
  return p;
}
export async function portalView(
  p: Awaited<ReturnType<typeof portalParticipant>>,
) {
  const allTasks = await list("tasks");
  const tasks = allTasks.filter((t) => t.participantId === p.id);
  const allOffers = await list("work_offers");
  const slots = await list("work_slots");
  const offers = allOffers.filter((o) => o.participantId === p.id);
  const projects = (await list("projects")).filter(
    (pr) =>
      tasks.some((t) => t.projectId === pr.id) ||
      offers.some((o) => o.projectId === pr.id),
  );
  const assets = await list("assets");
  const settlements = portalPaymentHistory(
    {
      participant_settlements: await list("participant_settlements"),
      work_slots: slots,
      posting_sets: await list("posting_sets"),
      tasks: allTasks,
      participant_history: await list("participant_history"),
    },
    p.id,
  );
  const credits = (await list("referral_credits")).filter(
    (c) => c.participantId === p.id,
  );
  const upgrades = [];
  for (const blog of slots.filter(
    (s) =>
      s.participantId === p.id &&
      s.type === "blog" &&
      s.status !== "cancelled" &&
      s.payoutStatus !== "paid",
  )) {
    const task = tasks.find((t) => t.workSlotId === blog.id);
    if (
      !task ||
      ["delivered", "submitted", "verified"].includes(String(task.status))
    )
      continue;
    const clip = slots.find(
      (s) =>
        s.projectId === blog.projectId &&
        s.type === "clip" &&
        s.status !== "cancelled" &&
        !s.participantId &&
        !allOffers.some(
          (o) =>
            o.slotId === s.id &&
            o.status === "proposed" &&
            new Date(String(o.expiresAt)).getTime() > Date.now(),
        ),
    );
    if (clip)
      upgrades.push({
        blogSlotId: blog.id,
        clipSlotId: clip.id,
        projectId: blog.projectId,
        amount: p.bundleRate,
      });
  }
  return {
    upgrades,
    participant: {
      id: p.id,
      name: p.name,
      accounts: p.accounts,
      referralCode: p.referralCode,
      availability: p.availability,
      kakaoMarketingConsent: p.kakaoMarketingConsent,
    },
    settlements: settlements.map((s) => ({
      id: s.id,
      total: s.total,
      status: s.status,
      paidAt: s.paidAt,
    })),
    offers: offers.map((o) => ({
      id: o.id,
      version: o.version,
      name: o.name,
      status: o.status,
      expiresAt: o.expiresAt,
      amount: o.amount,
      projectId: o.projectId,
      accountUrls: o.accountUrls,
      submissionDue: o.submissionDue,
      guide: o.guide,
      guideVersion: o.guideVersion,
      retentionDays: o.retentionDays,
      policy: o.policySnapshot,
      partialFinalizedAmount:
        o.status === "accepted"
          ? (slots.find(
              (s) =>
                s.id === o.slotId &&
                s.offerId === o.id &&
                s.participantId === p.id &&
                s.partialFinalized,
            )?.amount ?? null)
          : null,
      lastPostingDate: o.lastPostingDate,
    })),
    projects: projects.map((pr) => ({
      id: pr.id,
      name: pr.name,
      guide: pr.guide || pr.instructions,
      guideVersion: pr.guideVersion || 1,
      due: pr.due,
      workflowPolicy: pr.workflowPolicy,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      version: t.version,
      name: t.name,
      projectId: t.projectId,
      channel: t.channel,
      status: t.status,
      link: t.link,
      submittedAt: t.submittedAt,
      reviewEligibleAt: t.reviewEligibleAt,
      retentionUntil: t.retentionUntil,
      guideSnapshot: t.guideSnapshot,
      revisionNotes: t.revisionNotes,
      revisionDue: t.revisionDue,
      submissionDue: t.submissionDue,
      scheduledFrom: t.scheduledFrom,
      scheduledUntil: t.scheduledUntil,
      payoutStatus: t.payoutStatus,
      account: (t.participantSnapshot as { account?: unknown } | null)?.account,
      files:
        t.status &&
        ["delivered", "submitted", "verified"].includes(String(t.status))
          ? assets
              .filter(
                (a) =>
                  ((t.approvedAssets as string[]) || []).includes(a.id) &&
                  a.current === true,
              )
              .map((a) => ({
                id: a.id,
                name: a.name,
                category: a.category,
                text:
                  a.category === "copy"
                    ? publishableCopy(String(a.text || ""))
                    : undefined,
              }))
          : [],
    })),
    referral: {
      available: credits
        .filter((c) => c.status === "available")
        .reduce((n, c) => n + Number(c.amount), 0),
      paid: credits
        .filter((c) => c.status === "paid")
        .reduce((n, c) => n + Number(c.amount), 0),
      items: credits.map((c) => ({
        id: c.id,
        amount: c.amount,
        status: c.status,
        createdAt: c.createdAt,
      })),
      invited: (await list("participants"))
        .filter((x) => x.referrerId === p.id)
        .map((x) => ({
          name: x.nickname || String(x.name).slice(0, 1) + "**",
          active: allTasks.some(
            (t) => t.participantId === x.id && t.payoutStatus === "paid",
          ),
        })),
    },
  };
}
