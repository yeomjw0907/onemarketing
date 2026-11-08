import { test } from "node:test";
import assert from "node:assert/strict";
import { loginEntryRole } from "../src/lib/login-entry";

test("explicit participant signup does not open advertiser onboarding", () => {
  assert.equal(loginEntryRole("participant", "1", ""), "participant");
  assert.equal(loginEntryRole("participant", "1", "/marketing"), "participant");
});
test("explicit advertiser entry and existing default destinations remain stable", () => {
  assert.equal(
    loginEntryRole("advertiser", undefined, "/campaigns/example"),
    "advertiser",
  );
  assert.equal(loginEntryRole(undefined, "1", ""), "advertiser");
  assert.equal(
    loginEntryRole(undefined, undefined, "/marketing"),
    "advertiser",
  );
  assert.equal(
    loginEntryRole(undefined, undefined, "/campaigns/example"),
    "participant",
  );
  assert.equal(loginEntryRole("admin", undefined, ""), "advertiser");
});
