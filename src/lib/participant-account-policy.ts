export const accountStatusLabels = {
  pending: "검토 대기",
  approved: "승인",
  rejected: "반려",
} as const;
export type ManagedAccount = {
  id: string;
  channel: string;
  url: string;
  label?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
};
export function accountApproved(
  account: Pick<ManagedAccount, "approvalStatus">,
) {
  return !account.approvalStatus || account.approvalStatus === "approved";
}
export function accountAssignable(
  account: {
    channel?: unknown;
    approvalStatus?: "pending" | "approved" | "rejected";
  },
  channel: unknown,
) {
  return (
    accountApproved(account) &&
    (account.channel === channel ||
      (channel === "clip" && account.channel === "blog"))
  );
}
