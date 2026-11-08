import {
  accountAssignable,
  type ManagedAccount,
  accountApproved,
} from "./participant-account-policy";
export const ownershipHelpPath =
  "/account?role=participant&category=profile&intent=ownership";
export type ApplicationAccount = ManagedAccount & {
  ownershipVerifiedAt?: unknown;
};
export function eligibleApplicationAccounts(
  accounts: ApplicationAccount[],
  channel: string,
) {
  return accounts.filter(
    (a) => accountAssignable(a, channel) && Boolean(a.ownershipVerifiedAt),
  );
}
export function missingApplicationChannels(
  accounts: ApplicationAccount[],
  type: string,
) {
  return (type === "bundle" ? ["blog", "clip"] : [type]).filter(
    (ch) => ch && !eligibleApplicationAccounts(accounts, ch).length,
  );
}
export function verifiedApplicationAccounts(accounts: ApplicationAccount[]) {
  return accounts.filter(
    (a) => accountApproved(a) && Boolean(a.ownershipVerifiedAt),
  ).length;
}
