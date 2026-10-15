import { create, list, lock, transaction, update } from "./db";
type Event = {
  request_id: string;
  endpoint_id: string;
  timestamp: string;
  cost_total?: number;
  cost_estimate_nano_usd?: number;
};
export function billedAmount(events: Event[]) {
  let nano = 0;
  for (const event of events) {
    // cost_total is the final amount after discounts; nano USD represents that same amount.
    const n =
      typeof event.cost_total === "number"
        ? Math.round(event.cost_total * 1e9)
        : event.cost_estimate_nano_usd;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)
      throw new Error("fal 청구 금액 형식을 확인할 수 없습니다.");
    nano += n;
  }
  if (!Number.isSafeInteger(nano))
    throw new Error("fal 청구 합계 범위를 초과했습니다.");
  return nano / 1e9;
}
export async function syncFalBilling(projectId?: string) {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY 설정이 필요합니다.");
  const jobs = (await list("jobs")).filter(
    (j) =>
      (!projectId || j.projectId === projectId) &&
      j.providerRequestId &&
      (j.providerState as any)?.provider === "fal",
  );
  const now = new Date();
  const start = new Date(now.getTime() - 89 * 86400000);
  const recent = jobs.filter((j) => new Date(j.createdAt) >= start);
  const ids = [...new Set(recent.map((j) => String(j.providerRequestId)))];
  if (ids.length > 500)
    throw new Error(
      "조회할 요청이 많습니다. 프로젝트별로 청구 확인을 실행하세요.",
    );
  const events: Event[] = [];
  const deadline = Date.now() + 45000;
  for (let i = 0; i < ids.length; i += 50) {
    let cursor: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 20; page++) {
      if (Date.now() >= deadline)
        throw new Error(
          "청구 조회 시간이 초과되었습니다. 기존 금액을 유지합니다. 프로젝트별로 다시 조회하세요.",
        );
      const url = new URL("https://api.fal.ai/v1/models/billing-events");
      url.searchParams.set("start", start.toISOString());
      url.searchParams.set("end", now.toISOString());
      url.searchParams.set("request_id", ids.slice(i, i + 50).join(","));
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, {
        headers: { Authorization: "Key " + key },
        signal: AbortSignal.timeout(
          Math.min(15000, Math.max(1, deadline - Date.now())),
        ),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          `fal 청구 조회 실패 · HTTP ${response.status}${response.status === 403 ? " · Billing 읽기 권한을 확인하세요" : ""}`,
        );
      const data = await response.json();
      if (
        !Array.isArray(data.billing_events) ||
        typeof data.has_more !== "boolean"
      )
        throw new Error("fal 청구 응답 형식을 확인할 수 없습니다.");
      events.push(
        ...data.billing_events.filter((e: Event) =>
          ids.slice(i, i + 50).includes(e.request_id),
        ),
      );
      if (!data.has_more) break;
      if (page === 19 || !data.next_cursor || cursors.has(data.next_cursor))
        throw new Error(
          "fal 청구 조회가 완결되지 않았습니다. 기존 금액을 유지합니다.",
        );
      cursor = data.next_cursor;
      cursors.add(cursor!);
    }
  }
  const grouped = new Map<string, Event[]>();
  for (const e of events)
    grouped.set(e.request_id, [...(grouped.get(e.request_id) || []), e]);
  // Validate all amounts before writing any results. Missing events are never treated as $0.
  const amounts = new Map(
    [...grouped].map(([id, rows]) => [id, billedAmount(rows)]),
  );
  await transaction(async () => {
    await lock("fal-billing:sync");
    const costs = await list("costs");
    for (const [requestId, matched] of grouped) {
      const job = recent.find((j) => j.providerRequestId === requestId)!;
      const billing = {
        currency: "USD",
        amount: amounts.get(requestId),
        requestId,
        model: matched[0].endpoint_id,
        billedAt: matched.map((e) => e.timestamp).sort()[0],
        checkedAt: now.toISOString(),
        eventCount: matched.length,
      };
      const existing = costs.find(
        (c) => c.category === "ai" && c.jobId === job.id,
      );
      if (existing) await update(existing.id, { providerBilling: billing });
      else
        await create("costs", {
          projectId: job.projectId,
          jobId: job.id,
          category: "ai",
          amount: job.estimate || 0,
          currency: "KRW",
          confirmed: false,
          estimate: true,
          description: "fal 생성 · USD 실제 청구 확인 / 원화 미환산",
          providerBilling: billing,
        });
    }
  });
  return {
    checked: ids.length,
    matched: grouped.size,
    pending: ids.length - grouped.size,
    older: jobs.length - recent.length,
    totalUsd: billedAmount(events),
    checkedAt: now.toISOString(),
  };
}
