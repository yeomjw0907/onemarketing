import type { ParticipantApplication } from "./participant-application-schema";
export const applicationListLabels = {
  new: "신규",
  approved: "승인 완료",
  rejected: "반려",
  deleted: "삭제된 신청",
} as const;
export function matchesApplication(
  i: ParticipantApplication,
  filter: string,
  search: string,
) {
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
