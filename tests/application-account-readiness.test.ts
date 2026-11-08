import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eligibleApplicationAccounts,
  missingApplicationChannels,
  verifiedApplicationAccounts,
  ownershipHelpPath,
} from "../src/lib/application-account-readiness";
import {
  safeLoginReturnPath,
  safeParticipantPortalReturn,
  applyParticipantReturn,
  applyAdvertiserReturn,
  loginEntryRole,
} from "../src/lib/login-entry";
test("approved registration does not silently bypass ownership; channel readiness follows assignment policy", () => {
  const unverified = {
    id: "a",
    channel: "blog",
    url: "https://blog.naver.com/qa",
    approvalStatus: "approved" as const,
  };
  assert.deepEqual(missingApplicationChannels([unverified], "bundle"), [
    "blog",
    "clip",
  ]);
  assert.equal(eligibleApplicationAccounts([unverified], "blog").length, 0);
  const verified = {
    ...unverified,
    ownershipVerifiedAt: "2026-11-09T00:00:00Z",
  };
  assert.deepEqual(missingApplicationChannels([verified], "bundle"), []);
  assert.equal(
    verifiedApplicationAccounts([{ ...verified, approvalStatus: "rejected" }]),
    0,
  );
  assert.deepEqual(
    missingApplicationChannels([{ ...verified, channel: "clip" }], "bundle"),
    ["blog"],
  );
});
test("ownership help login return is role-isolated and does not accept arbitrary query data", () => {
  assert.equal(
    safeParticipantPortalReturn(ownershipHelpPath),
    ownershipHelpPath,
  );
  assert.equal(safeLoginReturnPath(ownershipHelpPath), "");
  assert.equal(safeLoginReturnPath("/account"), "/account");
  assert.equal(safeParticipantPortalReturn("/account"), "");
  for (const path of [
    ownershipHelpPath + "&access=secret",
    "https://evil.test/account",
    "/account?role=admin",
    ownershipHelpPath + "#unsafe",
  ]) {
    assert.equal(safeParticipantPortalReturn(path), "");
    assert.equal(safeLoginReturnPath(path), "");
  }
  const p = new URL("https://example.test/participants/portal");
  applyParticipantReturn(p, ownershipHelpPath);
  assert.equal(p.pathname + p.search, ownershipHelpPath);
  applyAdvertiserReturn(p, ownershipHelpPath);
  assert.equal(p.pathname + p.search, ownershipHelpPath);
  assert.equal(
    loginEntryRole(undefined, undefined, ownershipHelpPath),
    "participant",
  );
});
