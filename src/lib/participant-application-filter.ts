import type { ParticipantApplication } from "./participant-application-schema";
export const applicationListLabels = {
  new: "신규",
  approved: "승인 완료",
  rejected: "반려",
  deleted: "삭제된 신청",
} as const;
export type ApplicationDateRange = { startDate?: string; endDate?: string };
export function applicationDateRangeError({
  startDate = "",
  endDate = "",
}: ApplicationDateRange) {
  for (const value of [startDate, endDate]) {
    if (!value) continue;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      return "올바른 신청일을 입력해주세요.";
  }
  return startDate && endDate && startDate > endDate
    ? "시작일은 종료일보다 늦을 수 없습니다."
    : "";
}
export function matchesApplication(
  i: ParticipantApplication,
  filter: string,
  search: string,
  range: ApplicationDateRange = {},
) {
  if (applicationDateRangeError(range)) return false;
  const submittedAt = Date.parse(i.created_at);
  if (
    range.startDate &&
    !(submittedAt >= Date.parse(`${range.startDate}T00:00:00+09:00`))
  )
    return false;
  if (
    range.endDate &&
    !(submittedAt < Date.parse(`${range.endDate}T00:00:00+09:00`) + 86400000)
  )
    return false;
  const query = search.trim();
  const nameQuery = query.replace(/\s/g, "").toLocaleLowerCase("ko-KR");
  const phoneQuery = /^[0-9+()\s-]+$/.test(query)
    ? query.replace(/\D/g, "")
    : "";
  const statusMatches =
    filter === "deleted"
      ? Boolean(i.data.deletedAt)
      : !i.data.deletedAt && i.status === filter;
  return (
    statusMatches &&
    (!query ||
      i.data.name
        .replace(/\s/g, "")
        .toLocaleLowerCase("ko-KR")
        .includes(nameQuery) ||
      (phoneQuery.length > 0 &&
        i.data.phone.replace(/\D/g, "").includes(phoneQuery)))
  );
}
