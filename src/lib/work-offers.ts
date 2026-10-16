import { z } from "zod";
import { create, get, list, update, lock, transaction, audit } from "./db";
import { requireRecord } from "./domain";
import { assignWorkSlot } from "./work-slots";
import { defaultWorkflowPolicy, addDays } from "./workflow-policy";
import { rewardDefaults } from "./sales-cart";
import { queueNotification } from "./sens";
import { accountAssignable } from "./participant-account-policy";
import type { RecordData } from "./types";
export async function expireOffers(projectId: string) {
  for (const o of (await list("work_offers")).filter(
    (o) =>
      o.projectId === projectId &&
      o.status === "proposed" &&
      new Date(String(o.expiresAt)).getTime() <= Date.now(),
  ))
    await update(o.id, { status: "expired" });
}
export async function proposeWork(input: unknown, actor: string) {
  const b = z
    .object({
      slotId: z.string().uuid(),
      participantId: z.string().uuid(),
      blogAccountId: z.string().uuid().optional(),
      clipAccountId: z.string().uuid().optional(),
    })
    .parse(input);
  return transaction(async () => {
    let slot = await requireRecord(b.slotId, "work_slots");
    await lock("project-operations:" + slot.projectId);
    slot = await requireRecord(slot.id, "work_slots");
    const project = await requireRecord(String(slot.projectId), "projects");
    if (
      project.hold ||
      project.settled ||
      ["completed", "cancelled"].includes(String(project.status))
    )
      throw new Error("모집 가능한 프로젝트가 아닙니다.");
    await expireOffers(project.id);
    if (
      slot.status === "cancelled" ||
      !((slot.taskIds as string[]) || []).length ||
      slot.participantId ||
      (await list("work_offers")).some(
        (o) =>
          o.slotId === slot.id &&
          ["proposed", "accepted"].includes(String(o.status)),
      )
    )
      throw new Error("이미 배정 또는 제안 중인 작업입니다.");
    const p = await requireRecord(b.participantId, "participants");
    if (p.status !== "active")
      throw new Error("활동 중인 참여자를 선택하세요.");
    const accounts = p.accounts as {
      id: string;
      url: string;
      channel: string;
      ownershipVerifiedAt?: string;
      approvalStatus?: "approved" | "pending" | "rejected";
    }[];
    const selected = [];
    for (const channel of slot.type === "bundle"
      ? ["blog", "clip"]
      : [String(slot.type)]) {
      const account = accounts.find(
        (a) =>
          a.id === (channel === "blog" ? b.blogAccountId : b.clipAccountId),
      );
      if (!account || !accountAssignable(account, channel))
        throw new Error("채널별 승인 계정을 선택하세요.");
      if (
        (await list("tasks")).some(
          (t) =>
            t.projectId === project.id &&
            t.channel === channel &&
            t.participantId === p.id &&
            t.participantAccountId === account.id &&
            t.status !== "cancelled",
        )
      )
        throw new Error("이 캠페인에서 계정에 이미 배정된 작업이 있습니다.");
      if (
        (await list("work_offers")).some(
          (o) =>
            o.projectId === project.id &&
            o.participantId === p.id &&
            o.status === "proposed" &&
            ((o.accountKeys as string[]) || []).includes(
              channel + ":" + account.id,
            ),
        )
      )
        throw new Error("이 계정에 같은 채널 제안이 진행 중입니다.");
      if (project.workflowPolicy && !account.ownershipVerifiedAt)
        throw new Error("계정 소유·관리 권한 확인 후 제안하세요.");
      selected.push({ ...account, channel });
    }
    const policy = {
      ...defaultWorkflowPolicy,
      ...(project.workflowPolicy as object),
    };
    const expiresAt = new Date(
      Math.min(
        Date.now() + policy.offerHours * 3600000,
        new Date(String(project.due) + "T23:59:59+09:00").getTime(),
      ),
    ).toISOString();
    if (new Date(expiresAt).getTime() <= Date.now())
      throw new Error("게시 마감이 지난 캠페인입니다.");
    const field =
      slot.type === "bundle"
        ? "bundleRate"
        : slot.type === "blog"
          ? "blogRate"
          : "clipRate";
    const offer = await create("work_offers", {
      ...b,
      projectId: project.id,
      name: project.name + " · " + slot.name,
      status: "proposed",
      expiresAt,
      policySnapshot: policy,
      individualRates: { blog: p.blogRate, clip: p.clipRate },
      lastPostingDate: project.due,
      referrerSnapshot: p.referrerId || null,
      amount:
        p[field] ?? rewardDefaults[slot.type as keyof typeof rewardDefaults],
      accountUrls: selected.map((a) => a.url),
      accountKeys: selected.map((a) => a.channel + ":" + a.id),
      guideVersion: project.guideVersion || 1,
      guide: project.guide || project.instructions,
      retentionDays: 90,
      referralRate: slot.type === "bundle" ? 1200 : 500,
    });
    // Recruitment is deliberately not sent as informational AlimTalk.
    await audit(actor, "work-proposed", offer.id);
    return offer;
  });
}
export async function respondOffer(
  id: string,
  participantId: string,
  accept: boolean,
) {
  return transaction(async () => {
    const o = await requireRecord(id, "work_offers");
    await lock("project-operations:" + o.projectId);
    const current = await requireRecord(id, "work_offers");
    if (current.participantId !== participantId)
      throw new Error("본인의 제안만 처리할 수 있습니다.");
    if (current.status !== "proposed")
      throw new Error("이미 처리한 제안입니다.");
    if (new Date(String(current.expiresAt)).getTime() <= Date.now())
      throw new Error("제안이 만료되었습니다.");
    const project = await requireRecord(String(current.projectId), "projects");
    if (
      project.hold ||
      project.settled ||
      ["completed", "cancelled"].includes(String(project.status))
    )
      throw new Error("진행 가능한 캠페인이 아닙니다.");
    if (accept) {
      const slot = await requireRecord(String(current.slotId), "work_slots");
      if (slot.participantId) throw new Error("이미 배정된 작업입니다.");
      await assignWorkSlot(
        slot,
        {
          participantId,
          blogAccountId: current.blogAccountId,
          clipAccountId: current.clipAccountId,
          version: slot.version,
        },
        "participant:" + participantId,
      );
      // Accepted price is the proposal price even if profile rates changed in between.
      const assigned = await requireRecord(slot.id, "work_slots");
      if (Number(assigned.amount) !== Number(current.amount))
        throw new Error(
          "원고료가 변경되었습니다. 담당자에게 새 제안을 요청하세요.",
        );
      await update(slot.id, {
        offerId: current.id,
        referrerSnapshot: current.referrerSnapshot,
        referralRate: current.referralRate,
        acceptedPolicy: current.policySnapshot,
        individualRates: current.individualRates,
        acceptedGuide: { version: current.guideVersion, text: current.guide },
        acceptedAt: new Date().toISOString(),
      });
    }
    const result = await update(current.id, {
      status: accept ? "accepted" : "declined",
      respondedAt: new Date().toISOString(),
    });
    await audit(
      "participant:" + participantId,
      accept ? "offer-accepted" : "offer-declined",
      id,
    );
    return result;
  });
}
export async function splitSlot(slotId: string, actor: string) {
  return transaction(async () => {
    let slot = await requireRecord(slotId, "work_slots");
    await lock("project-operations:" + slot.projectId);
    slot = await requireRecord(slot.id, "work_slots");
    await expireOffers(String(slot.projectId));
    if (
      slot.type !== "bundle" ||
      slot.participantId ||
      slot.status === "cancelled" ||
      (await list("work_offers")).some(
        (o) => o.slotId === slot.id && o.status === "proposed",
      )
    )
      throw new Error("미배정·미제안 묶음만 분리할 수 있습니다.");
    const tasks = [];
    for (const id of slot.taskIds as string[])
      tasks.push(await requireRecord(id, "tasks"));
    if (
      tasks.some(
        (t) =>
          t.participantId ||
          t.payoutStatus === "paid" ||
          ["delivered", "submitted", "verified", "cancelled"].includes(
            String(t.status),
          ),
      )
    )
      throw new Error("진행 중인 묶음은 분리할 수 없습니다.");
    for (const t of tasks) {
      const type = String(t.channel) as "blog" | "clip";
      const next = await create("work_slots", {
        projectId: slot.projectId,
        customerId: slot.customerId,
        type,
        name: type === "blog" ? "블로그 단독" : "클립 단독",
        amount: rewardDefaults[type],
        participantId: null,
        status: "unassigned",
        taskIds: [t.id],
        splitFrom: slot.id,
      });
      await update(t.id, {
        workSlotId: next.id,
        postingSetId: null,
        payout: rewardDefaults[type],
      });
    }
    await update(slot.id, {
      status: "cancelled",
      taskIds: [],
      splitAt: new Date().toISOString(),
    });
    await audit(actor, "slot-split", slot.id);
    return { id: slot.id };
  });
}
export async function releaseMaterials(slotId: string, actor: string) {
  return transaction(async () => {
    let slot = await requireRecord(slotId, "work_slots");
    await lock("project-operations:" + slot.projectId);
    slot = await requireRecord(slot.id, "work_slots");
    const p = await requireRecord(String(slot.projectId), "projects");
    if (!slot.participantId || p.hold || p.settled)
      throw new Error("배정과 프로젝트 상태를 확인하세요.");
    const tasks = [];
    for (const id of slot.taskIds as string[])
      tasks.push(await requireRecord(id, "tasks"));
    const assets = await list("assets");
    if (
      tasks.some(
        (t) =>
          !((t.approvedAssets as string[]) || []).length ||
          (t.approvedAssets as string[]).some(
            (id) =>
              !assets.some(
                (a) => a.id === id && a.taskId === t.id && a.current === true,
              ),
          ),
      )
    )
      throw new Error("승인본 파일이 없거나 변경되었습니다. 다시 승인하세요.");
    if (tasks.some((t) => t.status !== "approved"))
      throw new Error("모든 콘텐츠를 내부 승인한 뒤 전달하세요.");
    const policy = {
      ...defaultWorkflowPolicy,
      ...(p.workflowPolicy as object),
      ...(slot.acceptedPolicy as object),
    };
    const due = new Date(
      Math.min(
        Math.max(
          Date.now(),
          ...tasks.map((t) =>
            t.scheduledFrom
              ? new Date(String(t.scheduledFrom) + "T00:00:00+09:00").getTime()
              : Date.now(),
          ),
        ) +
          policy.submissionDays * 86400000,
        ...tasks.map((t) =>
          new Date(
            String(t.scheduledUntil || p.due) + "T23:59:59+09:00",
          ).getTime(),
        ),
      ),
    ).toISOString();
    if (new Date(due).getTime() <= Date.now())
      throw new Error("제출 가능 기간이 지났습니다.");
    const now = new Date().toISOString();
    for (const t of tasks)
      await update(t.id, {
        status: "delivered",
        requestedAt: now,
        firstRequestedAt: t.firstRequestedAt || now,
        submissionDue: due,
        postingDeadlineAt: due,
        guideSnapshot: slot.acceptedGuide || {
          version: p.guideVersion || 1,
          text: p.guide || p.instructions,
        },
        workflowPolicy: policy,
        referralRate: 500,
      });
    await create("deliveries", {
      projectId: p.id,
      workSlotId: slot.id,
      participantId: slot.participantId,
      taskIds: tasks.map((t) => t.id),
      deliveredAt: now,
      actor,
      method: "portal",
    });
    await queueNotification(String(slot.participantId), "materials", slot.id, {
      name: String(p.name),
      deadline: due,
    });
    return { due };
  });
}
export async function submitPublication(
  taskId: string,
  participantId: string,
  link: string,
) {
  const { command } = await import("./domain");
  const t = await requireRecord(taskId, "tasks");
  if (t.participantId !== participantId)
    throw new Error("본인 작업만 제출할 수 있습니다.");
  const result = await command(
    "publication",
    { id: t.id, version: t.version, link, verified: false },
    "participant:" + participantId,
    crypto.randomUUID(),
  );
  return transaction(async () => {
    const current = await requireRecord(t.id, "tasks");
    return update(t.id, {
      reviewEligibleAt: addDays(String(current.submittedAt), 3),
    });
  });
}
export async function requestRevision(
  taskId: string,
  note: string,
  major: boolean,
  actor: string,
) {
  return transaction(async () => {
    let t = await requireRecord(taskId, "tasks");
    await lock("project-operations:" + t.projectId);
    t = await requireRecord(t.id, "tasks");
    const p = await requireRecord(String(t.projectId), "projects");
    if (
      t.payoutStatus === "paid" ||
      !["submitted", "verified"].includes(String(t.status)) ||
      !note.trim()
    )
      throw new Error("미지급 제출 작업에 수정 내용을 입력하세요.");
    const policy = {
      ...defaultWorkflowPolicy,
      ...(p.workflowPolicy as object),
      ...(t.workflowPolicy as object),
    };
    if (p.hold || p.settled || p.status === "cancelled")
      throw new Error("보류·마감 캠페인입니다.");
    const due = addDays(new Date().toISOString(), policy.revisionDays);
    const result = await update(t.id, {
      status: "delivered",
      revisionNotes: note,
      revisionDue: due,
      ...(major
        ? {
            submittedAt: null,
            reviewEligibleAt: null,
            verifiedAt: null,
            retentionUntil: null,
          }
        : {}),
      revisionCount: Number(t.revisionCount || 0) + 1,
    });
    await queueNotification(
      String(t.participantId),
      "revision",
      t.id + ":" + result.version,
      { name: String(p.name), deadline: due, note: note.slice(0, 300) },
    );
    await audit(actor, "revision-requested", t.id, { note, major });
    return result;
  });
}
export async function availability(participantId: string, input: unknown) {
  const b = z
    .array(
      z.object({
        accountId: z.string().uuid(),
        quantity: z.number().int().min(0).max(100),
        until: z.string().datetime(),
      }),
    )
    .max(100)
    .parse(input);
  return transaction(async () => {
    await lock("save:participants");
    const p = await requireRecord(participantId, "participants");
    if (
      b.some(
        (v) =>
          !(p.accounts as { id: string }[]).some((a) => a.id === v.accountId) ||
          new Date(v.until).getTime() <= Date.now(),
      )
    )
      throw new Error("계정과 가용 기간을 확인하세요.");
    return update(p.id, { availability: b });
  });
}

export async function mergeSlots(
  blogSlotId: string,
  clipSlotId: string,
  actor: string,
) {
  return transaction(async () => {
    let blog = await requireRecord(blogSlotId, "work_slots"),
      clip = await requireRecord(clipSlotId, "work_slots");
    if (
      blog.projectId !== clip.projectId ||
      blog.type !== "blog" ||
      clip.type !== "clip"
    )
      throw new Error("같은 캠페인의 블로그·클립 단독 작업을 선택하세요.");
    await lock("project-operations:" + blog.projectId);
    blog = await requireRecord(blog.id, "work_slots");
    clip = await requireRecord(clip.id, "work_slots");
    if (
      blog.projectId !== clip.projectId ||
      blog.type !== "blog" ||
      clip.type !== "clip" ||
      blog.status === "cancelled" ||
      clip.status === "cancelled"
    )
      throw new Error("작업 상태가 변경되었습니다.");
    await expireOffers(String(blog.projectId));
    if (blog.participantId !== clip.participantId)
      throw new Error(
        "같은 참여자의 작업 또는 미배정 작업끼리 합칠 수 있습니다.",
      );
    const offers = await list("work_offers");
    if (
      [blog, clip].some(
        (s) =>
          s.status === "cancelled" ||
          s.payoutStatus === "paid" ||
          offers.some(
            (o) =>
              o.slotId === s.id &&
              ["proposed", "accepted"].includes(String(o.status)),
          ),
      )
    )
      throw new Error(
        "수락·제안·지급 작업은 자동 합칠 수 없습니다. 참여자에게 새 묶음 조건을 제안하세요.",
      );
    const tasks = [];
    for (const id of [
      ...(blog.taskIds as string[]),
      ...(clip.taskIds as string[]),
    ])
      tasks.push(await requireRecord(id, "tasks"));
    if (
      tasks.some(
        (t) =>
          ["delivered", "submitted", "verified", "cancelled"].includes(
            String(t.status),
          ) || t.payoutStatus === "paid",
      )
    )
      throw new Error("전달 전 작업만 합칠 수 있습니다.");
    // Release prior assignments, then propose new bundle so the participant explicitly consents.
    const slot = await create("work_slots", {
      projectId: blog.projectId,
      customerId: blog.customerId,
      type: "bundle",
      name: "블로그 + 클립 묶음",
      amount: rewardDefaults.bundle,
      participantId: null,
      status: "unassigned",
      taskIds: tasks.map((t) => t.id),
      mergedFrom: [blog.id, clip.id],
    });
    for (const t of tasks)
      await update(t.id, {
        workSlotId: slot.id,
        participantId: null,
        participantAccountId: null,
        participantSnapshot: null,
        assignee: "",
        payout: t.channel === "blog" ? rewardDefaults.bundle : 0,
      });
    for (const s of [blog, clip])
      await update(s.id, {
        status: "cancelled",
        taskIds: [],
        mergedInto: slot.id,
      });
    await audit(actor, "slots-merged", slot.id);
    return slot;
  });
}
export async function cancelUnfinished(slotId: string, actor: string) {
  return transaction(async () => {
    let slot = await requireRecord(slotId, "work_slots");
    await lock("project-operations:" + slot.projectId);
    slot = await requireRecord(slot.id, "work_slots");
    const tasks = [];
    for (const id of slot.taskIds as string[])
      tasks.push(await requireRecord(id, "tasks"));
    const done = tasks.filter((t) => t.payoutStatus === "paid"),
      remaining = tasks.filter((t) => t.payoutStatus !== "paid");
    if (
      slot.type !== "bundle" ||
      done.length !== 1 ||
      remaining.length !== 1 ||
      remaining[0].status === "verified"
    )
      throw new Error("부분 지급 후 미완료 작업만 재모집할 수 있습니다.");
    const t = remaining[0];
    if (t.link)
      throw new Error("제출된 게시물은 검수 또는 철회 확인 후 재모집하세요.");
    const next = await create("work_slots", {
      projectId: slot.projectId,
      customerId: slot.customerId,
      type: t.channel,
      name: t.channel === "blog" ? "블로그 재모집" : "클립 재모집",
      amount: rewardDefaults[t.channel as "blog" | "clip"],
      participantId: null,
      status: "unassigned",
      taskIds: [t.id],
      reassignedFrom: slot.id,
    });
    await update(t.id, {
      workSlotId: next.id,
      postingSetId: null,
      participantId: null,
      participantAccountId: null,
      participantSnapshot: null,
      assignee: "",
      payout: next.amount,
      status: ((t.approvedAssets as string[]) || []).length
        ? "approved"
        : "planned",
      submissionDue: null,
      postingDeadlineAt: null,
      requestedAt: null,
      firstRequestedAt: null,
      submittedAt: null,
      firstSubmittedAt: null,
      reviewEligibleAt: null,
      verifiedAt: null,
      firstVerifiedAt: null,
      verifiedBy: null,
      retentionUntil: null,
      revisionNotes: null,
      revisionDue: null,
      revisionCount: 0,
      postingRevisionCount: 0,
      qualityScore: null,
      qualityNotes: "",
      guideSnapshot: null,
      offerId: null,
    });
    await update(done[0].id, {
      payout: slot.partialPaidAmount,
      postingSetId: null,
    });
    if (slot.postingSetId)
      await update(String(slot.postingSetId), { status: "cancelled" });
    await update(slot.id, {
      postingSetId: null,
      type: done[0].channel,
      taskIds: [done[0].id],
      amount: slot.partialPaidAmount,
      payoutStatus: "paid",
      status: "completed",
      partialFinalized: true,
    });
    await audit(actor, "partial-recruit", slot.id, {
      taskId: t.id,
      newSlotId: next.id,
    });
    return next;
  });
}
export async function partialPay(
  slotId: string,
  taskId: string,
  actor: string,
) {
  return transaction(async () => {
    let slot = await requireRecord(slotId, "work_slots");
    await lock("project-operations:" + slot.projectId);
    slot = await requireRecord(slot.id, "work_slots");
    const t = await requireRecord(taskId, "tasks");
    if (
      slot.type !== "bundle" ||
      !(slot.taskIds as string[]).includes(t.id) ||
      t.status !== "verified" ||
      t.payoutStatus === "paid" ||
      ((slot.partialPaidTaskIds as string[]) || []).length > 0 ||
      slot.settlementId
    )
      throw new Error(
        "묶음에서 첫 번째 검수 완료 작업만 부분 지급할 수 있습니다.",
      );
    const p = await requireRecord(String(t.participantId), "participants");
    const rate =
      (slot.individualRates as { blog: number; clip: number } | undefined)?.[
        t.channel as "blog" | "clip"
      ] ?? (t.channel === "blog" ? p.blogRate : p.clipRate);
    if (typeof rate !== "number")
      throw new Error("개별 지급 단가를 먼저 확정하세요.");
    const amount = rate;
    if (amount > Number(slot.amount))
      throw new Error("개별 단가가 묶음 금액보다 큽니다. 약정액을 확인하세요.");
    const now = new Date().toISOString();
    await update(t.id, {
      payoutStatus: "paid",
      paidAt: now,
      partialPaidAmount: amount,
      partialPaidAt: now,
    });
    await update(slot.id, {
      partialPaidAmount: amount,
      partialPaidTaskIds: [t.id],
      partialReferralAmount: 500,
    });
    const { syncReferral } = await import("./referrals");
    await syncReferral(
      { ...t, type: t.channel, referrerSnapshot: slot.referrerSnapshot },
      true,
      actor,
    );
    await audit(actor, "bundle-partial-payment", slot.id, {
      taskId: t.id,
      amount,
    });
    return { amount };
  });
}

export async function upgradeBundle(
  blogSlotId: string,
  clipSlotId: string,
  participantId: string,
  clipAccountId: string,
) {
  return transaction(async () => {
    let blog = await requireRecord(blogSlotId, "work_slots"),
      clip = await requireRecord(clipSlotId, "work_slots");
    if (
      blog.type !== "blog" ||
      clip.type !== "clip" ||
      blog.projectId !== clip.projectId ||
      blog.participantId !== participantId ||
      clip.participantId
    )
      throw new Error("묶음 전환 가능한 블로그·클립을 선택하세요.");
    await lock("project-operations:" + blog.projectId);
    blog = await requireRecord(blog.id, "work_slots");
    clip = await requireRecord(clip.id, "work_slots");
    if (
      blog.projectId !== clip.projectId ||
      blog.type !== "blog" ||
      clip.type !== "clip" ||
      blog.status === "cancelled" ||
      clip.status === "cancelled"
    )
      throw new Error("작업 상태가 변경되었습니다.");
    await expireOffers(String(blog.projectId));
    if (blog.participantId !== participantId || clip.participantId)
      throw new Error("배정 상태가 변경되었습니다.");
    if (
      (await list("work_offers")).some(
        (o) => o.slotId === clip.id && o.status === "proposed",
      )
    )
      throw new Error("클립 작업이 다른 사람에게 제안 중입니다.");
    const tasks = [];
    for (const id of [
      ...(blog.taskIds as string[]),
      ...(clip.taskIds as string[]),
    ])
      tasks.push(await requireRecord(id, "tasks"));
    if (
      tasks.some(
        (t) =>
          t.payoutStatus === "paid" ||
          ["delivered", "submitted", "verified", "cancelled"].includes(
            String(t.status),
          ),
      )
    )
      throw new Error("자료 전달 전 작업만 묶음으로 전환할 수 있습니다.");
    const originalBlog = tasks.find((t) => t.channel === "blog")!;
    const blogAccountId = String(originalBlog.participantAccountId);
    for (const o of (await list("work_offers")).filter(
      (o) => o.slotId === blog.id && o.status === "accepted",
    ))
      await update(o.id, { status: "upgraded" });
    const slot = await create("work_slots", {
      projectId: blog.projectId,
      customerId: blog.customerId,
      type: "bundle",
      name: "블로그 + 클립 묶음",
      amount: rewardDefaults.bundle,
      participantId: null,
      status: "unassigned",
      taskIds: tasks.map((t) => t.id),
      mergedFrom: [blog.id, clip.id],
    });
    for (const t of tasks)
      await update(t.id, {
        workSlotId: slot.id,
        participantId: null,
        participantAccountId: null,
        participantSnapshot: null,
        assignee: "",
        payout: t.channel === "blog" ? rewardDefaults.bundle : 0,
      });
    for (const old of [blog, clip])
      await update(old.id, {
        status: "cancelled",
        taskIds: [],
        mergedInto: slot.id,
      });
    const offer = await proposeWork(
      { slotId: slot.id, participantId, blogAccountId, clipAccountId },
      "participant:" + participantId,
    );
    await respondOffer(offer.id, participantId, true);
    return { slotId: slot.id };
  });
}

export async function cancelPartialPay(slotId: string, actor: string) {
  return transaction(async () => {
    let slot = await requireRecord(slotId, "work_slots");
    await lock("project-operations:" + slot.projectId);
    slot = await requireRecord(slot.id, "work_slots");
    if (
      !((slot.partialPaidTaskIds as string[]) || []).length ||
      slot.payoutStatus === "paid" ||
      slot.settlementId
    )
      throw new Error("최종 지급 전 부분 지급만 취소할 수 있습니다.");
    const { syncReferral } = await import("./referrals");
    for (const id of slot.partialPaidTaskIds as string[]) {
      const t = await requireRecord(id, "tasks");
      await syncReferral(t, false, actor);
      await update(t.id, {
        payoutStatus: "pending",
        paidAt: null,
        partialPaidAmount: null,
        partialPaidAt: null,
      });
    }
    await update(slot.id, {
      partialPaidAmount: null,
      partialPaidTaskIds: [],
      partialReferralAmount: null,
    });
    await audit(actor, "bundle-partial-payment-cancel", slot.id);
    return { id: slot.id };
  });
}
