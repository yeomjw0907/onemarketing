import { requireActor, sameOrigin } from "@/lib/auth";
import { get, list, transaction, lock, update, audit } from "@/lib/db";
import { saveQuote, confirmQuote } from "@/lib/quote-workflow";
import { issuePortal } from "@/lib/portal";
import {
  proposeWork,
  splitSlot,
  releaseMaterials,
  requestRevision,
  mergeSlots,
  partialPay,
  cancelUnfinished,
  cancelPartialPay,
} from "@/lib/work-offers";
import { settleReferrals, changeReferrer } from "@/lib/referrals";
import {
  sensConfiguration,
  sendNotification,
  refreshNotification,
  notificationTick,
  queueNotification,
} from "@/lib/sens";
import {
  defaultWorkflowPolicy,
  workflowPolicySchema,
} from "@/lib/workflow-policy";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireActor();
    return Response.json(
      { sens: sensConfiguration(), defaults: defaultWorkflowPolicy },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    const b = await request.json();
    let result: unknown;
    switch (b.action) {
      case "campaign-settings":
        result = await transaction(async () => {
          await lock("project-operations:" + b.id);
          const p = await get(b.id);
          if (p?.kind !== "projects" || p.settled || p.status === "cancelled")
            throw new Error("진행 중인 캠페인을 선택하세요.");
          const policy = workflowPolicySchema.parse(b.policy);
          const guide = String(b.guide || "").slice(0, 10000);
          const r = await update(
            p.id,
            {
              workflowPolicy: policy,
              guide,
              guideVersion:
                Number(p.guideVersion || 1) + (guide !== p.guide ? 1 : 0),
            },
            b.version,
          );
          await audit(actor, "campaign-settings", p.id, {
            policy,
            guideVersion: r.guideVersion,
          });
          return r;
        });
        break;
      case "offer-batch":
        if (!Array.isArray(b.items) || b.items.length > 100)
          throw new Error("제안 목록을 확인하세요.");
        result = await transaction(async () => {
          const rows = [];
          for (const item of b.items) rows.push(await proposeWork(item, actor));
          return rows;
        });
        break;
      case "quote-save":
        result = await saveQuote(b.data, actor, b.id, b.version);
        break;
      case "quote-confirm":
        if (b.reviewed !== true)
          throw new Error("견적서와 설명서를 검토해주세요.");
        result = await confirmQuote(b.id, b.version, actor);
        break;
      case "ownership-confirm":
        result = await transaction(async () => {
          await lock("save:participants");
          const p = await get(b.id);
          if (p?.kind !== "participants" || !String(b.evidence || "").trim())
            throw new Error("계정 확인 근거를 입력하세요.");
          const accounts = p.accounts as { id: string; url: string }[];
          if (!accounts.some((a) => a.id === b.accountId))
            throw new Error("계정 없음");
          await audit(actor, "account-ownership-confirmed", p.id, {
            accountId: b.accountId,
            evidence: b.evidence,
          });
          return update(p.id, {
            accounts: accounts.map((a) =>
              a.id === b.accountId
                ? {
                    ...a,
                    ownershipVerifiedAt: new Date().toISOString(),
                    ownershipEvidence: String(b.evidence),
                  }
                : a,
            ),
          });
        });
        break;
      case "portal-issue":
        result = await issuePortal(b.id, actor);
        break;
      case "offer":
        result = await proposeWork(b.data, actor);
        break;
      case "merge":
        result = await mergeSlots(b.blogSlotId, b.clipSlotId, actor);
        break;
      case "partial-pay-cancel":
        result = await cancelPartialPay(b.id, actor);
        break;
      case "partial-pay":
        result = await partialPay(b.id, b.taskId, actor);
        break;
      case "partial-recruit":
        result = await cancelUnfinished(b.id, actor);
        break;
      case "split":
        result = await splitSlot(b.id, actor);
        break;
      case "release":
        result = await releaseMaterials(b.id, actor);
        break;
      case "revision":
        result = await requestRevision(
          b.id,
          String(b.note || ""),
          b.major === true,
          actor,
        );
        break;
      case "referral-pay":
        result = await settleReferrals(b.id, actor);
        break;
      case "referrer-change":
        result = await changeReferrer(
          b.id,
          b.referrerId || null,
          String(b.reason || ""),
          actor,
        );
        break;
      case "notification-send":
        await sendNotification(b.id);
        result = { ok: true };
        break;
      case "notification-refresh":
        result = await refreshNotification(b.id);
        break;
      case "notification-tick":
        await notificationTick();
        result = { ok: true };
        break;
      case "retention-check":
        result = await transaction(async () => {
          const t = await get(b.id);
          if (t?.kind !== "tasks" || !t.retentionUntil)
            throw new Error("유지 관리 작업을 선택하세요.");
          await lock("project-operations:" + t.projectId);
          const r = await update(t.id, {
            retentionCheckedAt: new Date().toISOString(),
            retentionStatus: b.ok === true ? "public" : "needs_recovery",
            retentionNote: String(b.note || ""),
          });
          if (b.ok !== true && t.participantId)
            await queueNotification(
              String(t.participantId),
              "retention",
              t.id + ":" + r.version,
              { name: String(t.name) },
            );
          await audit(actor, "retention-check", t.id);
          return r;
        });
        break;
      default:
        throw new Error("지원하지 않는 작업입니다.");
    }
    return Response.json(result || { ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "처리 실패" },
      { status: 400 },
    );
  }
}
