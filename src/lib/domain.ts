import { z } from "zod";
import { materialItems } from "./material-checklist";
import {
  createPostingSet,
  payPostingSet,
  dissolvePostingSet,
} from "./posting-sets";
import {
  audit,
  create,
  get,
  list,
  update,
  transaction,
  lock,
  once,
} from "./db";
import type { RecordData, Kind } from "./types";
import {
  participantSchema,
  participantHistorySchema,
  validateParticipant,
  participantAssignment,
} from "./participants";
const text = z.string().trim().max(10000);
const name = z.string().trim().min(1).max(200);
const amount = z.number().int().min(0).max(1e12);
const optionalAmount = amount.nullable();
const customer = z.object({
  name,
  businessNumber: z
    .string()
    .trim()
    .default("")
    .transform((v) => v.replaceAll("-", "").replaceAll(" ", ""))
    .refine(
      (v) => v === "" || /^\d{10}$/.test(v),
      "사업자번호는 숫자 10자리로 입력하세요.",
    ),
  contact: text.default(""),
  brand: text.default(""),
  tone: text.default(""),
  target: text.default(""),
  forbidden: text.default(""),
  notes: text.default(""),
});
const product = z.object({
  name,
  customerId: name,
  facts: text.default(""),
  claims: text.default(""),
  forbidden: text.default(""),
  preserve: text.default(""),
  notes: text.default(""),
});
const price = z
  .object({
    name,
    channel: z.enum(["blog", "clip"]),
    sale: amount,
    payout: optionalAmount,
    aiEstimate: optionalAmount,
    images: z.number().int().min(0).max(30),
    duration: z.number().int().min(0).max(60),
    mode: z.enum(["slideshow", "hybrid", "generated"]),
    revisions: z.number().int().min(0).max(10),
  })
  .superRefine((p, ctx) => {
    if (p.channel === "clip" && p.duration < 1)
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "클립 길이를 입력하세요.",
      });
    if (
      p.channel === "clip" &&
      p.mode === "generated" &&
      (p.duration < 4 || p.duration > 30)
    )
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "생성형은 4~30초로 설정하세요.",
      });
    if (p.channel === "clip" && p.mode === "hybrid" && p.duration < 8)
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "혼합형은 8초 이상으로 설정하세요.",
      });
  });
const line = z.object({
  priceId: name,
  quantity: z.number().int().min(1).max(100),
});
const contract = z.object({
  name,
  customerId: name,
  lines: z.array(line).min(1).max(30),
  discount: amount.default(0),
  months: z.number().int().min(1).max(36),
  setsPerMonth: z.number().int().min(1).max(30),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  vatIncluded: z.boolean().default(false),
  budget: amount.nullable().default(null),
});
const project = z.object({
  name,
  contractId: name,
  slot: z.number().int().min(0),
  productId: name,
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instructions: text.default(""),
  preferredKeywords: z.string().trim().max(1000).default(""),
  budget: amount,
});
const schemas = {
  participants: participantSchema,
  participant_history: participantHistorySchema,
  customers: customer,
  products: product,
  prices: price,
  contracts: contract,
  projects: project,
};
export async function requireRecord(id: string, kind?: Kind) {
  const r = await get(id);
  if (!r || (kind && r.kind !== kind))
    throw new Error("연결된 항목을 찾을 수 없습니다.");
  return r;
}
export async function quote(
  lines: { priceId: string; quantity: number }[],
  discount = 0,
) {
  const snapshots: RecordData[] = [];
  for (const l of lines) {
    const p = await requireRecord(l.priceId, "prices");
    snapshots.push({ ...p, priceId: p.id, quantity: l.quantity });
  }
  const total = snapshots.reduce(
    (s, p) => s + Number(p.sale) * Number(p.quantity),
    0,
  );
  if (discount > total) throw new Error("할인이 판매액보다 큽니다.");
  const missing = snapshots.some(
    (p) => p.payout === null || p.aiEstimate === null,
  );
  const cost = missing
    ? null
    : snapshots.reduce(
        (s, p) =>
          s + (Number(p.payout) + Number(p.aiEstimate)) * Number(p.quantity),
        0,
      );
  return {
    snapshots,
    total,
    discount,
    sale: total - discount,
    cost,
    margin: cost === null ? null : total - discount - cost,
  };
}
export function save(
  kind: Kind,
  input: unknown,
  actor: string,
  id?: string,
  version?: number,
) {
  if (!(kind in schemas)) throw new Error("직접 수정할 수 없는 항목입니다.");
  const data = schemas[kind as keyof typeof schemas].parse(input) as Record<
    string,
    unknown
  >;
  return transaction(async () => {
    // 같은 종류의 동시 저장을 직렬화해 중복 계정·중복 슬롯 검사가 경쟁 조건에 뚫리지 않게 한다.
    await lock("save:" + kind);
    if (id) {
      await requireRecord(id, kind);
      z.number().int().positive().parse(version);
    }
    if (kind === "participants") await validateParticipant(data, id);
    if (kind === "participant_history") {
      await requireRecord(String(data.participantId), "participants");
      if (id) {
        const previous = await requireRecord(id, "participant_history");
        if (previous.participantId !== data.participantId)
          throw new Error("기존 협업 이력의 참여자는 변경할 수 없습니다.");
        await audit(actor, "participant-history-updated", id, {
          previousAmount: previous.amount,
          amount: data.amount,
          previousPaid: previous.paid,
          paid: data.paid,
        });
      }
    }
    if (kind === "products")
      await requireRecord(String(data.customerId), "customers");
    if (kind === "contracts") {
      if (id)
        throw new Error(
          "확정 계약은 직접 변경할 수 없습니다. 새 계약으로 등록하세요.",
        );
      await requireRecord(String(data.customerId), "customers");
      const calculation = await quote(
        data.lines as { priceId: string; quantity: number }[],
        Number(data.discount),
      );
      if (calculation.cost === null)
        throw new Error("지급 단가와 AI 예상 비용을 먼저 입력하세요.");
      if (data.budget !== null && calculation.sale > Number(data.budget))
        throw new Error("설정한 예산을 초과합니다.");
      Object.assign(data, calculation, {
        saleInput: calculation.sale,
        sale: data.vatIncluded
          ? Math.round(calculation.sale / 1.1)
          : calculation.sale,
        vat: data.vatIncluded
          ? calculation.sale - Math.round(calculation.sale / 1.1)
          : Math.round(calculation.sale * 0.1),
        gross: data.vatIncluded
          ? calculation.sale
          : calculation.sale + Math.round(calculation.sale * 0.1),
        margin:
          (data.vatIncluded
            ? Math.round(calculation.sale / 1.1)
            : calculation.sale) - Number(calculation.cost),
        slotCount: Number(data.months) * Number(data.setsPerMonth),
        status: "confirmed",
      });
    }
    if (kind === "projects") {
      if (id) throw new Error("프로젝트 변경은 작업 메뉴에서 처리하세요.");
      const c = await requireRecord(String(data.contractId), "contracts"),
        p = await requireRecord(String(data.productId), "products");
      if (c.customerId !== p.customerId)
        throw new Error("계약과 제품의 고객이 다릅니다.");
      if (Number(data.slot) >= Number(c.slotCount))
        throw new Error("계약의 제공 범위를 초과합니다.");
      if (
        (await list("projects")).some(
          (p) => p.contractId === c.id && p.slot === data.slot,
        )
      )
        throw new Error("이미 시작한 제공 슬롯입니다.");
      Object.assign(data, {
        customerId: c.customerId,
        status: "materials",
        sale: c.sale,
        payoutEstimate: (c.snapshots as RecordData[]).reduce(
          (s, l) => s + Number(l.payout) * Number(l.quantity),
          0,
        ),
        aiEstimate: (c.snapshots as RecordData[]).reduce(
          (s, l) => s + Number(l.aiEstimate) * Number(l.quantity),
          0,
        ),
        knowledge: {
          customer: await requireRecord(String(c.customerId), "customers"),
          product: p,
        },
        settled: false,
        hold: false,
      });
    }
    const row = id ? await update(id, data, version) : await create(kind, data);
    if (kind === "projects") {
      const c = await requireRecord(String(data.contractId), "contracts");
      let order = 0;
      for (const l of c.snapshots as RecordData[])
        for (let i = 0; i < Number(l.quantity); i++)
          await create("tasks", {
            projectId: row.id,
            customerId: c.customerId,
            name: `${l.name} ${i + 1}`,
            channel: l.channel,
            images: l.images,
            duration: l.duration,
            mode: l.mode,
            payout: l.payout,
            payoutStatus: "pending",
            status: "planned",
            order: ++order,
            brief: "",
            assignee: "",
            link: "",
            deliveryVersion: [],
            paidAt: null,
          });
    }
    await audit(actor, id ? "update" : "create", row.id);
    return row;
  });
}
export async function projectCosts(p: RecordData) {
  const tasks = (await list("tasks")).filter(
    (t) =>
      t.projectId === p.id &&
      (t.status !== "cancelled" ||
        t.payoutStatus === "paid" ||
        t.payoutCommitted === true),
  );
  const costs = (await list("costs")).filter((c) => c.projectId === p.id);
  const actual = costs
    .filter((c) => c.category !== "payout")
    .reduce((s, c) => s + Number(c.amount), 0);
  const payouts = tasks.reduce((s, t) => s + Number(t.payout || 0), 0);
  const missing =
    tasks.some((t) => t.payout === null) ||
    costs.some((c) => c.confirmed !== true);
  const expected = Number(p.payoutEstimate) + Number(p.aiEstimate);
  return {
    sale: Number(p.sale),
    expected,
    expectedMargin: Number(p.sale) - expected,
    actual: actual + payouts,
    margin: Number(p.sale) - actual - payouts,
    provisional: missing || p.settled !== true,
  };
}
export function command(
  action: string,
  input: Record<string, unknown>,
  actor: string,
  key: string,
) {
  z.string().min(1).max(100).parse(key);
  return once(actor + ":" + key, async () => {
    const id = String(input.id || "");
    let row = await requireRecord(id);
    let result: RecordData = row;
    let parent =
      row.kind === "projects"
        ? row
        : row.projectId
          ? await requireRecord(String(row.projectId), "projects")
          : null;
    if (parent) {
      await lock("project-operations:" + parent.id);
      row = await requireRecord(id);
      parent =
        row.kind === "projects"
          ? row
          : await requireRecord(parent.id, "projects");
      result = row;
    }
    if (
      parent?.settled &&
      !["reopen-settlement", "import-source"].includes(action)
    )
      throw new Error("정산 마감한 프로젝트입니다. 먼저 마감을 취소하세요.");
    if (action === "posting-set-create") {
      if (row.kind !== "projects") throw new Error("프로젝트를 선택하세요.");
      if (row.version !== Number(input.version))
        throw new Error("새로고침 후 다시 시도하세요.");
      result = await createPostingSet(row, input);
    } else if (action === "posting-set-pay") {
      result = await payPostingSet(row, input, actor);
    } else if (action === "posting-set-dissolve") {
      result = await dissolvePostingSet(row, input);
    } else if (action === "materials-update") {
      if (row.kind !== "projects") throw new Error("프로젝트를 선택하세요.");
      const items = z
        .array(
          z.object({
            key: z.enum(materialItems.map((i) => i[0])),
            required: z.boolean(),
            status: z.enum(["missing", "received", "confirmed"]),
            note: z.string().trim().max(1000),
          }),
        )
        .length(materialItems.length)
        .parse(input.items);
      if (new Set(items.map((i) => i.key)).size !== materialItems.length)
        throw new Error("자료 항목이 중복되었습니다.");
      result = await update(
        id,
        {
          materialChecklist: items,
          materialsCheckedAt: new Date().toISOString(),
          materialsCheckedBy: actor,
        },
        Number(input.version),
      );
    } else if (action === "project-stage") {
      if (row.kind !== "projects") throw new Error("프로젝트를 선택하세요.");
      const next = String(input.status);
      const allowed: Record<string, string[]> = {
        materials: ["planning", "cancelled"],
        planning: ["brief_review", "cancelled"],
        brief_review: ["planning", "producing", "cancelled"],
        producing: ["review", "cancelled"],
        review: ["producing", "ready", "cancelled"],
        ready: ["publishing", "cancelled"],
        publishing: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowed[String(row.status)]?.includes(next))
        throw new Error("허용되지 않은 단계 변경입니다.");
      const tasks = (await list("tasks")).filter(
        (t) => t.projectId === id && t.status !== "cancelled",
      );
      if (
        next === "planning" &&
        !(
          (await list("assets")).some(
            (a) => a.projectId === id && a.category === "source",
          ) || String(row.materialNotes || "").trim()
        )
      )
        throw new Error("고객 자료 또는 확인한 자료 메모를 먼저 등록하세요.");
      if (next === "brief_review" && tasks.some((t) => !String(t.brief).trim()))
        throw new Error("모든 작업의 기획안을 작성하세요.");
      if (next === "producing" && row.status === "brief_review") {
        for (const t of tasks)
          await update(t.id, {
            briefApprovedAt: new Date().toISOString(),
            briefApprovedBy: actor,
          });
      }
      if (
        next === "ready" &&
        tasks.some(
          (t) =>
            !["approved", "delivered", "submitted", "verified"].includes(
              String(t.status),
            ),
        )
      )
        throw new Error("모든 결과물을 승인하세요.");
      if (next === "completed" && tasks.some((t) => t.status !== "verified"))
        throw new Error("모든 게시물을 확인하세요.");
      result = await update(id, { status: next }, Number(input.version));
    } else if (action === "project-notes") {
      if (row.kind !== "projects") throw new Error("프로젝트를 선택하세요.");
      result = await update(
        id,
        {
          materialNotes: text.parse(input.materialNotes),
          instructions: text.parse(input.instructions),
          preferredKeywords: z
            .string()
            .trim()
            .max(1000)
            .parse(input.preferredKeywords ?? row.preferredKeywords ?? ""),
          budget: amount.parse(input.budget),
        },
        Number(input.version),
      );
    } else if (action === "task-edit") {
      if (row.kind !== "tasks") throw new Error("게시 작업을 선택하세요.");
      const p = await requireRecord(String(row.projectId), "projects");
      const brief = text.parse(input.brief),
        changed = brief !== row.brief;
      const assignment = await participantAssignment(row, input);
      const newPayout = optionalAmount.parse(input.payout);
      if (
        row.postingSetId &&
        (newPayout !== row.payout ||
          assignment.participantId !== row.participantId ||
          assignment.participantAccountId !== row.participantAccountId)
      )
        throw new Error(
          "세트에 묶인 작업의 보수·참여자·계정은 개별 변경할 수 없습니다.",
        );
      if (
        row.payoutStatus === "paid" &&
        (newPayout !== row.payout ||
          (assignment.participantId !== row.participantId &&
            Boolean(row.participantId)))
      )
        throw new Error(
          "지급 완료한 작업의 지급액·참여자는 변경할 수 없습니다.",
        );
      if (
        changed &&
        ["ready", "publishing", "completed", "cancelled"].includes(
          String(p.status),
        )
      )
        throw new Error("전달 단계 이후에는 기획을 변경할 수 없습니다.");
      result = await update(
        id,
        {
          brief,
          ...assignment,
          payout: newPayout,
          ...(changed ? { briefApprovedAt: null, status: "planned" } : {}),
        },
        Number(input.version),
      );
      if (
        assignment.participantId !== row.participantId ||
        newPayout !== row.payout
      )
        await audit(actor, "participant-assigned", id, {
          from: row.participantId || null,
          to: assignment.participantId,
          previousPayout: row.payout,
          payout: newPayout,
        });
      if (changed && ["producing", "review"].includes(String(p.status)))
        await update(p.id, { status: "brief_review" });
    } else if (action === "approve-task") {
      if (row.kind !== "tasks") throw new Error("게시 작업을 선택하세요.");
      const p = await requireRecord(String(row.projectId), "projects");
      if (!["producing", "review"].includes(String(p.status)))
        throw new Error("제작·검수 단계에서 승인할 수 있습니다.");
      const assets = (await list("assets")).filter(
        (a) => a.taskId === id && a.current === true && a.category !== "source",
      );
      if (
        row.channel === "blog" &&
        (!assets.some((a) => a.category === "copy") ||
          assets.filter((a) => a.category === "image").length <
            Number(row.images))
      )
        throw new Error("원고와 계약 수량의 이미지를 등록하세요.");
      if (row.channel === "clip" && !assets.some((a) => a.category === "video"))
        throw new Error("영상을 등록하세요.");
      result = await update(
        id,
        {
          status: "approved",
          approvedAssets: assets.map((a) => a.id),
          approvedAt: new Date().toISOString(),
          approvedBy: actor,
        },
        Number(input.version),
      );
    } else if (action === "request-changes") {
      if (
        row.kind !== "tasks" ||
        ["delivered", "submitted", "verified"].includes(String(row.status))
      )
        throw new Error("전달 전 작업만 수정 요청할 수 있습니다.");
      result = await update(
        id,
        {
          status: "changes",
          feedback: name.parse(input.feedback),
          approvedAssets: [],
        },
        Number(input.version),
      );
      const p = await requireRecord(String(row.projectId), "projects");
      if (["ready", "publishing"].includes(String(p.status)))
        await update(p.id, { status: "review" });
    } else if (action === "publication") {
      if (
        row.kind !== "tasks" ||
        !["delivered", "submitted", "verified"].includes(String(row.status))
      )
        throw new Error("자료 전달을 먼저 기록하세요.");
      const link = z.string().url().max(2048).parse(input.link);
      const u = new URL(link);
      if (!["https:", "http:"].includes(u.protocol))
        throw new Error("웹 링크를 입력하세요.");
      if ((await list("tasks")).some((t) => t.id !== id && t.link === link))
        throw new Error("이미 등록된 게시 링크입니다.");
      if (
        row.postingSetId &&
        row.payoutStatus === "paid" &&
        (input.verified !== true || link !== row.link)
      )
        throw new Error(
          "지급한 세트의 게시 링크를 변경하려면 먼저 세트 지급을 취소하세요.",
        );
      result = await update(
        id,
        {
          link,
          status: input.verified === true ? "verified" : "submitted",
          verifiedAt: input.verified === true ? new Date().toISOString() : null,
          verifiedBy: input.verified === true ? actor : null,
        },
        Number(input.version),
      );
    } else if (action === "payout") {
      if (row.postingSetId)
        throw new Error("참여자 게시 세트에서 통합 지급을 처리하세요.");
      if (row.kind !== "tasks" || row.payout === null)
        throw new Error("지급액을 먼저 확정하세요.");
      result = await update(
        id,
        {
          payoutStatus: input.paid === true ? "paid" : "pending",
          paidAt: input.paid === true ? new Date().toISOString() : null,
        },
        Number(input.version),
      );
    } else if (action === "cost") {
      if (row.kind !== "projects") throw new Error("프로젝트를 선택하세요.");
      result = await create("costs", {
        projectId: id,
        category: z
          .enum(["ai", "shipping", "shooting", "editing", "other"])
          .parse(input.category),
        amount: amount.parse(input.amount),
        description: name.parse(input.description),
        confirmed: input.confirmed === true,
        currency: "KRW",
        actor,
      });
    } else if (action === "import-source") {
      if (row.kind !== "assets" || row.category !== "source")
        throw new Error("원본 자료를 선택하세요.");
      const target = await requireRecord(String(input.projectId), "projects"),
        origin = await requireRecord(String(row.projectId), "projects");
      if (
        target.productId !== origin.productId ||
        target.customerId !== origin.customerId
      )
        throw new Error("같은 고객·제품의 자료만 가져올 수 있습니다.");
      if (
        target.settled ||
        ["completed", "cancelled"].includes(String(target.status))
      )
        throw new Error("마감한 프로젝트입니다.");
      if (
        (await list("assets")).some(
          (a) =>
            a.projectId === target.id &&
            a.category === "source" &&
            a.hash === row.hash,
        )
      )
        throw new Error("이미 등록된 자료입니다.");
      const { id: oldId, ...source } = row;
      result = await create("assets", {
        ...source,
        projectId: target.id,
        taskId: null,
        sourceAssetId: row.id,
      });
    } else if (action === "assign-common") {
      if (
        row.kind !== "assets" ||
        row.category !== "source" ||
        !String(row.mime).startsWith("image/")
      )
        throw new Error("제품 원본 이미지를 선택하세요.");
      const p = await requireRecord(String(row.projectId), "projects");
      if (
        ["ready", "publishing", "completed", "cancelled"].includes(
          String(p.status),
        )
      )
        throw new Error("전달 전 제작 단계에서 배정하세요.");
      const tasks = (await list("tasks")).filter(
        (t) =>
          t.projectId === p.id &&
          t.channel === "blog" &&
          t.status !== "cancelled",
      );
      const assets = await list("assets");
      for (const t of tasks) {
        if (
          assets.some(
            (a) =>
              a.taskId === t.id &&
              a.sourceAssetId === row.id &&
              a.current === true,
          )
        )
          continue;
        const { id: sourceId, ...a } = row;
        await create("assets", {
          ...a,
          category: "image",
          taskId: t.id,
          common: true,
          sourceAssetId: row.id,
          current: true,
          slot: "common-" + row.id,
        });
        await update(t.id, { status: "review", approvedAssets: [] });
      }
      result = await update(id, { common: true }, Number(input.version));
    } else if (action === "confirm-cost") {
      if (row.kind !== "costs") throw new Error("비용을 선택하세요.");
      result = await update(
        id,
        {
          amount: amount.parse(input.amount),
          confirmed: true,
          estimate: false,
          description: name.parse(input.description),
          confirmedBy: actor,
          confirmedAt: new Date().toISOString(),
        },
        Number(input.version),
      );
    } else if (action === "resolve-job") {
      if (
        row.kind !== "jobs" ||
        !["failed", "uncertain"].includes(String(row.status))
      )
        throw new Error("확인이 필요한 작업을 선택하세요.");
      result = await update(
        id,
        {
          status: "failed",
          resolution: name.parse(input.note),
          resolvedBy: actor,
          resolvedAt: new Date().toISOString(),
        },
        Number(input.version),
      );
    } else if (action === "resume-job") {
      const state = row.providerState as
        { response?: unknown; request_id?: unknown } | undefined;
      if (
        row.kind !== "jobs" ||
        !["uncertain", "failed"].includes(String(row.status)) ||
        !(
          state?.response ||
          state?.request_id ||
          row.searchState ||
          typeof row.outputText === "string" ||
          Object.keys((row.checkpoints as object) || {}).length
        )
      )
        throw new Error("저장된 생성 요청이 있는 작업만 재조회할 수 있습니다.");
      result = await update(
        id,
        { status: "pending", error: null },
        Number(input.version),
      );
    } else if (action === "reopen-settlement") {
      if (row.kind !== "projects") throw new Error("프로젝트를 선택하세요.");
      result = await update(
        id,
        { settled: false, reopenReason: name.parse(input.note) },
        Number(input.version),
      );
    } else if (action === "cancel-task") {
      if (row.kind !== "tasks") throw new Error("게시 작업을 선택하세요.");
      if (row.postingSetId)
        throw new Error(
          "세트 작업은 개별 취소할 수 없습니다. 전달 전 세트를 해제하세요.",
        );
      result = await update(
        id,
        {
          status: "cancelled",
          cancelReason: name.parse(input.note),
          payoutCommitted:
            row.payoutStatus === "paid" ||
            ["delivered", "submitted", "verified"].includes(
              String(row.status),
            ) ||
            input.retainPayout === true,
        },
        Number(input.version),
      );
    } else if (action === "project-adjustment") {
      if (row.kind !== "projects") throw new Error("프로젝트를 선택하세요.");
      const adjustment = amount.parse(input.refund);
      if (adjustment > Number(row.sale))
        throw new Error("환불액이 판매액보다 큽니다.");
      result = await update(
        id,
        {
          originalSale: row.originalSale ?? row.sale,
          sale: Number(row.sale) - adjustment,
          adjustmentNote: name.parse(input.note),
        },
        Number(input.version),
      );
    } else if (action === "settle") {
      if (
        row.kind !== "projects" ||
        !["completed", "cancelled"].includes(String(row.status))
      )
        throw new Error("운영 완료 또는 취소 후 정산할 수 있습니다.");
      if (
        (await list("jobs")).some(
          (j) =>
            j.projectId === id &&
            ["pending", "running", "uncertain"].includes(String(j.status)),
        )
      )
        throw new Error("미완료 AI 작업의 비용을 먼저 확인하세요.");
      if ((await projectCosts({ ...row, settled: true })).provisional)
        throw new Error("미확정 비용을 먼저 확인하세요.");
      result = await update(
        id,
        { settled: true, settledAt: new Date().toISOString() },
        Number(input.version),
      );
    } else throw new Error("지원하지 않는 작업입니다.");
    await audit(actor, action, id, { resultId: result.id });
    return result;
  });
}
