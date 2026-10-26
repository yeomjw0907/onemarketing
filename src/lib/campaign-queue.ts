type Row = Record<string, any>;
export type QueueItem = {
  id: string;
  campaignId?: string;
  orderId?: string;
  kind: "payment" | "selection" | "review" | "refund";
  title: string;
  label: string;
  count: number;
  due: string;
};
export function operationQueue(data: Row, admin: boolean): QueueItem[] {
  const rows: QueueItem[] = [];
  for (const o of data.orders || [])
    if (o.data.status === "awaiting_payment")
      rows.push({
        id: "payment:" + o.id,
        orderId: o.id,
        kind: "payment",
        title: "주문 " + o.id.slice(-8),
        label: admin ? "입금 확인" : "입금 대기",
        count: 1,
        due: o.created_at || "",
      });
  for (const c of data.campaigns || []) {
    const apps = c.applications || [],
      base = {
        campaignId: c.id,
        title: c.data.input.title,
        due: c.data.input.submissionDeadline,
      };
    const refund = (c.data.refunds || []).filter(
      (r: Row) =>
        r.status === "requested" || (admin && r.status === "approved"),
    );
    if (refund.length)
      rows.push({
        ...base,
        id: "refund:" + c.id,
        kind: "refund",
        label: admin ? "환불 검토·송금 확인" : "환불 처리 확인",
        count: refund.length,
      });
    if (
      ["paused", "cancelled", "completed", "awaiting_payment"].includes(
        c.data.status,
      )
    )
      continue;
    if (!admin && c.data.input.managed) continue;
    const review = apps.filter(
      (a: Row) => a.data.status === "submitted",
    ).length;
    if (review)
      rows.push({
        ...base,
        id: "review:" + c.id,
        kind: "review",
        label: "콘텐츠 검수",
        count: review,
      });
    const applied = apps.filter((a: Row) => a.data.status === "applied").length;
    if (applied)
      rows.push({
        ...base,
        id: "selection:" + c.id,
        kind: "selection",
        label: "지원자 선정",
        count: applied,
      });
  }
  const rank = { refund: 0, payment: 1, review: 2, selection: 3 };
  return rows.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.due.localeCompare(b.due),
  );
}
export function participantQueue(campaigns: Row[]) {
  return campaigns
    .flatMap((c) =>
      c.applications
        .filter((a: Row) =>
          ["selected", "accepted", "revision"].includes(a.data.status),
        )
        .map((a: Row) => ({
          id: a.id,
          campaignId: c.id,
          title: c.data.input.title,
          label:
            c.data.status === "paused"
              ? "진행 보류 · 안내 확인"
              : a.data.status === "selected"
                ? "참여 수락"
                : a.data.status === "revision"
                  ? "수정 후 재제출"
                  : "게시물 제출",
          status: a.data.status,
          due:
            a.data.status === "selected"
              ? a.data.expiresAt
              : c.data.input.submissionDeadline,
        })),
    )
    .sort((a, b) => String(a.due || "").localeCompare(String(b.due || "")));
}
