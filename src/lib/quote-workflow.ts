import { lockCatalog, requireActiveCatalog } from "./domain";
import { z } from "zod";
import { create, get, list, update, transaction, lock, audit } from "./db";
import { save, requireRecord } from "./domain";
import { workflowPolicySchema, weeklyTimeline } from "./workflow-policy";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "유효한 날짜를 입력하세요.");
export const quoteDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customerId: z.string().uuid(),
  productId: z.string().uuid().nullable().default(null),
  start: date,
  end: date,
  blog: z.number().int().min(0).max(100),
  clip: z.number().int().min(0).max(100),
  blogPriceId: z.string().uuid().optional(),
  clipPriceId: z.string().uuid().optional(),
  discount: z.number().int().min(0).default(0),
  policy: workflowPolicySchema.default({
    offerHours: 48,
    submissionDays: 7,
    revisionDays: 2,
    preparationDays: 7,
    reviewDays: 3,
    retentionDays: 90,
  }),
  guide: z
    .string()
    .trim()
    .max(10000)
    .default(
      "제공된 원고와 이미지 순서를 지키고 광고 표시를 유지해주세요. 게시 후 링크를 제출해주세요.",
    ),
  timeline: z
    .array(
      z.object({
        start: date,
        end: date,
        blog: z.number().int().min(0),
        clip: z.number().int().min(0),
      }),
    )
    .optional(),
});
export async function prepareQuote(input: unknown) {
  const d = quoteDraftSchema.parse(input);
  if (d.blog + d.clip === 0 || d.blog + d.clip > 100)
    throw new Error("전체 게시 수량은 1~100건입니다.");
  const customer = await requireActiveCatalog(d.customerId, "customers");
  const product = d.productId
    ? await requireActiveCatalog(d.productId, "products")
    : null;
  if (product && product.customerId !== customer.id)
    throw new Error("고객 하위 제품을 선택하세요.");
  const prices = [];
  for (const [channel, quantity, id] of [
    ["blog", d.blog, d.blogPriceId],
    ["clip", d.clip, d.clipPriceId],
  ] as const) {
    if (!quantity) continue;
    const p = await requireRecord(String(id), "prices");
    if (p.channel !== channel) throw new Error("채널별 단가를 확인하세요.");
    prices.push({
      channel,
      quantity,
      unit: Number(p.sale),
      supply: Number(p.sale) * quantity,
    });
  }
  const supply = prices.reduce((n, p) => n + p.supply, 0) - d.discount;
  if (supply < 0) throw new Error("할인이 공급가액을 초과합니다.");
  const timeline = d.timeline || weeklyTimeline(d.start, d.end, d.blog, d.clip);
  if (
    timeline.reduce((n, w) => n + w.blog, 0) !== d.blog ||
    timeline.reduce((n, w) => n + w.clip, 0) !== d.clip
  )
    throw new Error("주차별 수량의 합계가 주문 수량과 다릅니다.");
  let previous = "";
  for (const week of timeline) {
    if (
      week.start < d.start ||
      week.end > d.end ||
      week.end < week.start ||
      (previous && week.start <= previous)
    )
      throw new Error("주차별 기간의 겹침·순서를 확인하세요.");
    previous = week.end;
  }
  const preparationStart = new Date(
    new Date(d.start + "T00:00:00+09:00").getTime() -
      d.policy.preparationDays * 86400000 +
      9 * 3600000,
  )
    .toISOString()
    .slice(0, 10);
  return {
    ...d,
    customerName: customer.name,
    targetName: product?.name || customer.brand || customer.name,
    supplier: {
      name: "주식회사98점7도",
      representative: "염정원",
      businessNumber: "501-81-27350",
      address: "경기도 수원시 영통구 광교로 145 차세대융합기술연구원 C동 2층",
    },
    prices,
    supply,
    vat: Math.round(supply * 0.1),
    total: supply + Math.round(supply * 0.1),
    timeline,
    preparationStart,
    warnings:
      preparationStart <
      new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
        ? [
            "준비·모집 시작일이 지났습니다. 첫 게시일 또는 준비 기간을 검토하세요.",
          ]
        : [],
  };
}
export async function saveQuote(
  input: unknown,
  actor: string,
  id?: string,
  version?: number,
) {
  return transaction(async () => {
    if (id) {
      await lock("quote-confirm:" + id);
      if (!version) throw new Error("초안 버전을 확인하세요.");
      const old = await requireRecord(id, "quote_drafts");
      if (old.status === "confirmed")
        throw new Error("확정 견적은 변경할 수 없습니다.");
    }
    await lockCatalog();
    const data = await prepareQuote(input);
    const row = id
      ? await update(id, { ...data, status: "draft" }, version)
      : await create("quote_drafts", { ...data, status: "draft" });
    await audit(actor, "quote-draft", row.id);
    return row;
  });
}
export async function confirmQuote(id: string, version: number, actor: string) {
  return transaction(async () => {
    await lock("quote-confirm:" + id);
    const draft = await requireRecord(id, "quote_drafts");
    if (draft.status === "confirmed")
      return { contractId: draft.contractId, projectId: draft.projectId };
    if (draft.version !== version)
      throw new Error("견적이 변경되었습니다. 두 문서를 다시 확인하세요.");
    await lockCatalog();
    await lock("save:prices");
    const d = await prepareQuote(draft);
    if (
      d.prices.some((p, i) =>
        Object.entries(p).some(
          ([k, v]) => (draft.prices as Record<string, unknown>[])[i]?.[k] !== v,
        ),
      ) ||
      d.customerName !== draft.customerName ||
      d.targetName !== draft.targetName
    )
      throw new Error(
        "고객 또는 단가가 변경되었습니다. 초안을 다시 저장하고 문서를 검토하세요.",
      );
    const bundle = Math.min(d.blog, d.clip);
    const packages = [
      ...(bundle
        ? [
            {
              type: "bundle",
              quantity: bundle,
              blogPriceId: d.blogPriceId,
              clipPriceId: d.clipPriceId,
            },
          ]
        : []),
      ...(d.blog > bundle
        ? [
            {
              type: "blog",
              quantity: d.blog - bundle,
              blogPriceId: d.blogPriceId,
            },
          ]
        : []),
      ...(d.clip > bundle
        ? [
            {
              type: "clip",
              quantity: d.clip - bundle,
              clipPriceId: d.clipPriceId,
            },
          ]
        : []),
    ];
    const contract = await save(
      "contracts",
      {
        name: d.name,
        customerId: d.customerId,
        packages,
        discount: d.discount,
        months: 1,
        setsPerMonth: 1,
        startMonth: d.start.slice(0, 7),
        vatIncluded: false,
        budget: null,
      },
      actor,
    );
    let productId = d.productId;
    if (!productId) {
      const p = await save(
        "products",
        {
          name: String(d.targetName) + " · 브랜드 홍보",
          customerId: d.customerId,
          facts: String(d.targetName),
          notes: "브랜드 홍보 캠페인에서 생성",
        },
        actor,
      );
      productId = p.id;
    }
    const project = await save(
      "projects",
      {
        name: d.name,
        contractId: contract.id,
        slot: 0,
        productId,
        due: d.end,
        instructions: d.guide,
        budget: contract.cost,
      },
      actor,
    );
    await update(project.id, {
      referralEstimate:
        Math.min(d.blog, d.clip) * 1200 + Math.abs(d.blog - d.clip) * 500,
      workflowPolicy: d.policy,
      quoteDraftId: draft.id,
      start: d.start,
      timeline: d.timeline,
      preparationStart: d.preparationStart,
      guideVersion: 1,
      guide: d.guide,
      approvalMode: "internal",
      orderedQuantities: { blog: d.blog, clip: d.clip },
    });
    const generated = (await list("tasks"))
      .filter((t) => t.projectId === project.id)
      .sort((a, b) => Number(a.order) - Number(b.order));
    for (const channel of ["blog", "clip"] as const) {
      let index = 0;
      const tasks = generated.filter((t) => t.channel === channel);
      for (const week of d.timeline)
        for (let n = 0; n < week[channel]; n++) {
          await update(tasks[index++].id, {
            scheduledFrom: week.start,
            scheduledUntil: week.end,
          });
        }
    }
    await update(contract.id, {
      quoteDraftId: draft.id,
      productId: d.productId,
      start: d.start,
      end: d.end,
      totalQuantities: { blog: d.blog, clip: d.clip },
    });
    await update(draft.id, {
      status: "confirmed",
      contractId: contract.id,
      projectId: project.id,
      confirmedAt: new Date().toISOString(),
      confirmedBy: actor,
    });
    await audit(actor, "quote-confirm", draft.id, { projectId: project.id });
    return { contractId: contract.id, projectId: project.id };
  });
}
